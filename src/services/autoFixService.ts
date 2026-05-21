/**
 * autoFixService — deterministic, conservative corrections applied to a
 * ParsedProcess before the audit pass runs.
 *
 * Each fix is high-confidence (its violation is unambiguous in the BPMN
 * spec or in the source text) and low-risk (it doesn't invent new tasks
 * or flows out of thin air).  Anything subjective stays out of this
 * service — the audit will surface it instead, so the user can decide.
 *
 * Currently implemented:
 *   1. parallelGateway → exclusiveGateway, when the source text contains
 *      no parallelism phrase ("in parallel", "at the same time", "while",
 *      "simultaneously", "concurrently", "both X and Y must").  The most
 *      common AI mistake on conditional ("if/otherwise") flows.
 *   2. End events cannot have outgoing flows — drop any such flows.
 */

import type { AuditableModel } from './auditChecks'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AutoFixCategory =
  | 'gateway-type'         // parallelGateway flipped to exclusiveGateway
  | 'flow-connectivity'    // dropped illegal flow (e.g. outgoing from end event)

export interface AppliedFix {
  category: AutoFixCategory
  description: string         // Single-sentence summary, suitable for UI/export
  affectedElements: string[]  // Element names affected
}

export interface AutoFixResult<M extends AuditableModel> {
  model: M
  fixes: AppliedFix[]
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const PARALLEL_TRIGGER_RE =
  /\b(in\s+parallel|at\s+the\s+same\s+time|simultaneously|concurrently|while\b|both\s+\S+\s+and\s+\S+\s+(?:must|need|are\s+required))/i

// ── Main entry ────────────────────────────────────────────────────────────────

export function autoFixModel<M extends AuditableModel>(
  originalText: string,
  model: M,
): AutoFixResult<M> {
  const text  = originalText ?? ''
  const fixes: AppliedFix[] = []

  // Shallow-clone arrays we mutate so we don't surprise the caller.
  // The contained objects are mutated in place, which is fine because the
  // caller has the result back from us anyway.
  const out: M = {
    ...model,
    gateways:  [...(model.gateways  ?? [])],
    flows:     [...(model.flows     ?? [])],
    tasks:     model.tasks,
    endEvents: model.endEvents,
  } as M

  // ── Fix 1: parallelGateway → exclusiveGateway when no parallelism trigger ──
  const hasParallelTrigger = PARALLEL_TRIGGER_RE.test(text)
  if (!hasParallelTrigger) {
    const flipped: string[] = []
    out.gateways = (out.gateways ?? []).map(g => {
      const type = (g.type ?? '').toLowerCase()
      if (type.includes('parallel')) {
        flipped.push(g.name)
        const renamed = renameAfterFlip(g.name)
        return { ...g, type: 'exclusiveGateway', name: renamed }
      }
      return g
    })
    if (flipped.length > 0) {
      // Update flow source/target names to the renamed gateways too.
      const renameMap = new Map<string, string>()
      for (const oldName of flipped) {
        renameMap.set(oldName, renameAfterFlip(oldName))
      }
      out.flows = (out.flows ?? []).map(f => ({
        ...f,
        from: renameMap.get(f.from) ?? f.from,
        to:   renameMap.get(f.to)   ?? f.to,
      }))

      const renamedNames = flipped.map(n => renameMap.get(n) ?? n)
      fixes.push({
        category: 'gateway-type',
        description:
          `${flipped.length} parallel gateway${flipped.length === 1 ? '' : 's'} ` +
          `flipped to exclusive — the description has no parallelism phrase ` +
          `("in parallel", "at the same time", "simultaneously", "while", ` +
          `"concurrently"), so a conditional decision was implied.`,
        affectedElements: renamedNames,
      })
    }
  }

  // ── Fix 2: end events cannot have outgoing flows — drop them ──────────────
  const endEventNames = new Set<string>(
    (out.endEvents ?? []).map(e => e.name)
  )
  if (endEventNames.size > 0) {
    const before = out.flows ?? []
    const afterDrops: typeof before = []
    const droppedFromEnds = new Map<string, number>()
    for (const f of before) {
      if (endEventNames.has(f.from)) {
        droppedFromEnds.set(f.from, (droppedFromEnds.get(f.from) ?? 0) + 1)
        continue
      }
      afterDrops.push(f)
    }
    if (droppedFromEnds.size > 0) {
      out.flows = afterDrops
      const names = Array.from(droppedFromEnds.keys())
      const totalDropped = Array.from(droppedFromEnds.values()).reduce((a, b) => a + b, 0)
      fixes.push({
        category: 'flow-connectivity',
        description:
          `Removed ${totalDropped} illegal outgoing flow${totalDropped === 1 ? '' : 's'} ` +
          `from end event${names.length === 1 ? '' : 's'} — BPMN end events have ` +
          `no outgoing flows.`,
        affectedElements: names,
      })
    }
  }

  return { model: out, fixes }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Rename "AND Split" → "Decision", "AND Join" → "Merge".  Otherwise keep
// the original name (the user can tidy up via Refine if they want).
function renameAfterFlip(name: string): string {
  const trimmed = name.trim()
  if (/^and\s*split$/i.test(trimmed))   return 'Decision'
  if (/^and\s*join$/i.test(trimmed))    return 'Merge'
  if (/^parallel\s*split$/i.test(trimmed)) return 'Decision'
  if (/^parallel\s*join$/i.test(trimmed))  return 'Merge'
  return trimmed
}
