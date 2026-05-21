/**
 * Audit service — third pass on the parsed model.
 *
 * The first two passes (extract + verify) operate on JSON and run BEFORE
 * deterministic post-processing.  This audit runs AFTER everything,
 * compares the FINAL model against the user's ORIGINAL natural-language
 * description, and produces a structured AuditReport that we can show
 * the user (and use to drive auto-corrections for high-confidence cases).
 *
 * Two parallel signals:
 *   1. LLM audit  — re-reads the prompt vs the JSON, flags anything off.
 *   2. Deterministic checks — fast, regex-based, catches well-known
 *      anti-patterns (parallel without trigger phrase, object-as-actor,
 *      comma-and verb lists with missing tasks, summary tasks).
 *
 * Both feed into one combined AuditReport.
 */

import { generateCompletion } from './ollamaService'
import { extractJsonBlock } from './jsonExtractUtil'
import { runDeterministicAudit } from './auditChecks'
import { formatAuditReportText, formatAuditReportMarkdown } from './auditFormatters'
import type { AuditIssue, AuditSeverity, AuditCategory } from './auditChecks'
import type { ParsedProcess } from './nlpService'
import type { AppliedFix } from './autoFixService'

// Re-export so callers (UI, etc.) can keep importing from auditService.
export { runDeterministicAudit, formatAuditReportText, formatAuditReportMarkdown }
export type { AuditIssue, AuditSeverity, AuditCategory, AppliedFix }

export interface AuditReport {
  issues: AuditIssue[]
  llmRan: boolean                       // Was the LLM pass attempted?
  llmFailed: boolean                    // Did the LLM pass error out?
  summary: string                       // One-sentence overall verdict
  // Context (used by the export/console view; safe to be missing).
  originalText?: string                 // The user's natural-language prompt
  processName?: string                  // Process name from the parsed model
  generatedAt?: string                  // ISO timestamp of when the audit ran
  modelUsed?: string                    // Ollama model id, if any
  // Auto-corrections applied before the audit ran.  The audit reflects the
  // model AFTER these were applied — listing them here lets the user see
  // what was changed without surfacing them as outstanding issues.
  appliedFixes?: AppliedFix[]
}

// ── Audit prompt ──────────────────────────────────────────────────────────────

const AUDIT_PROMPT = `You are an expert BPMN 2.0 quality auditor.  Your job is to read a natural-language process description and compare it against a candidate BPMN JSON model, then surface any GAPS IN THE DESCRIPTION ITSELF that show up as modeling problems.

DO NOT flag rendering or wiring problems (gateway types, flow connectivity, orphan elements) — those are handled by an automated pipeline before this audit runs.  Focus only on description-level issues that a human author would need to fix.

YOUR PRIORITY: ACCURACY OVER SPEED.  Read the description carefully.  Don't gloss over issues, but don't invent issues either.

Return ONLY a raw JSON object — no markdown, no explanation, no code fences.  Start with { and end with }.

=== OUTPUT SCHEMA ===
{
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "category": "participant-actor" | "missing-task" | "bundled-tasks" | "name-clarity" | "other",
      "message": "One-sentence description of what's wrong.",
      "suggestion": "One-sentence description of how to fix it.",
      "affectedElements": ["Exact element name 1", "Exact element name 2"]
    }
  ],
  "summary": "One-sentence overall assessment of the model's faithfulness to the description."
}

If the description is well-described and faithfully modeled, return: { "issues": [], "summary": "Model is consistent with the description." }

=== WHAT TO CHECK (description-level gaps only) ===

CHECK 1 — PARTICIPANTS ARE ACTORS (NOT OBJECTS)
For EACH participant declared in the JSON:
  - Is this a PERSON, ROLE, TEAM, DEPARTMENT, or AUTONOMOUS SYSTEM that performs an action?
  - If it's equipment (coffee maker, printer, oven, server), an object (form, request, application, document), a UI surface (button, dashboard, screen), or a material (water, paper, beans), flag as severity "error", category "participant-actor", suggest removing it and reassigning its tasks to the actual actor.
  - If the source has only one human actor ("you"/"the user"), but the JSON has multiple participants where one is non-human, flag the non-human one.

CHECK 2 — MISSING TASKS (especially comma-and lists)
For EVERY action verb explicitly named in the source description, is there a corresponding task in the JSON?
  - BEFORE flagging a task as missing, FIRST search the JSON's "tasks" array for a name that exactly or partially matches the action.  If a matching task exists at all, DO NOT flag it as missing — the task IS in the model, even if its flows or position are wrong.
  - Comma-and lists like "do A, do B, and do C" must produce three tasks.  Only flag items that have NO matching task name anywhere in the JSON.
  - Standalone verbs in lists also count: "the manager reviews and approves" is two tasks (Review + Approve) unless context makes them clearly one.

CHECK 3 — BUNDLED / SUMMARY TASKS
If a task name in the JSON looks like a summary that swallows multiple actions described in the source ("Brew Coffee" covering filter+grounds+start, "Process Order" covering verify+pack+ship), flag as severity "warning", category "bundled-tasks", suggest splitting into discrete tasks.

CHECK 4 — NAME CLARITY (LOW PRIORITY, INFO ONLY)
If element names are clearly vague ("Step 1", "Do Thing", "Process"), flag as severity "info", category "name-clarity", suggest a better name based on the source.  Do not flag specific names just because you'd phrase them differently.

=== RULES ===
  - DO NOT use categories "gateway-type" or "flow-connectivity" — those are handled automatically and any finding you produce in those categories will be discarded.
  - Be specific — quote the source text wherever possible in the "message" field so the user can see why you flagged it.
  - Do NOT flag things that are correct — empty issues array is the right answer for a clean model.
  - Severity "error" should be reserved for clear violations (object as participant).  Bundled / missing tasks are warnings.  Name clarity is info.
  - "affectedElements" must be exact names from the JSON model.
  - Output ONLY the JSON object.  No markdown, no code fences.`

// ── LLM pass ──────────────────────────────────────────────────────────────────

interface LlmAuditResponse {
  issues?: Array<{
    severity?: string
    category?: string
    message?: string
    suggestion?: string
    affectedElements?: string[]
  }>
  summary?: string
}

const VALID_SEVERITY = new Set<AuditSeverity>(['error', 'warning', 'info'])
const VALID_CATEGORY = new Set<AuditCategory>([
  'gateway-type', 'participant-actor', 'missing-task',
  'bundled-tasks', 'flow-connectivity', 'name-clarity', 'other',
])

function coerceLlmIssue(raw: NonNullable<LlmAuditResponse['issues']>[number]): AuditIssue | null {
  const severity = (raw.severity ?? '').toLowerCase() as AuditSeverity
  const category = (raw.category ?? '').toLowerCase() as AuditCategory
  if (!VALID_SEVERITY.has(severity)) return null
  if (!raw.message || typeof raw.message !== 'string') return null
  return {
    severity,
    category: VALID_CATEGORY.has(category) ? category : 'other',
    message: raw.message.trim(),
    suggestion: raw.suggestion?.trim() || undefined,
    affectedElements: Array.isArray(raw.affectedElements)
      ? raw.affectedElements.filter(e => typeof e === 'string' && e.length > 0)
      : undefined,
    source: 'llm',
  }
}

export async function runLlmAudit(
  originalText: string,
  finalModel: ParsedProcess,
  model: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ issues: AuditIssue[]; summary: string }> {
  const prompt = `${AUDIT_PROMPT}

ORIGINAL DESCRIPTION:
${originalText}

CANDIDATE BPMN MODEL:
${JSON.stringify(finalModel, null, 2)}

Return the audit JSON now:`

  onChunk?.('\n[Pass 3/3] Auditing model against original description...\n\n')
  const raw = await generateCompletion(prompt, model, onChunk, signal)
  const json = extractJsonBlock(raw)
  let parsed: LlmAuditResponse
  try {
    parsed = JSON.parse(json) as LlmAuditResponse
  } catch (err) {
    throw new Error(`Audit JSON parse failed: ${(err as Error).message}`, { cause: err })
  }

  const issues: AuditIssue[] = []
  for (const raw of parsed.issues ?? []) {
    const coerced = coerceLlmIssue(raw)
    if (coerced) issues.push(coerced)
  }
  const summary = parsed.summary?.trim() || (
    issues.length === 0
      ? 'Model is consistent with the description.'
      : `Found ${issues.length} potential issue${issues.length === 1 ? '' : 's'}.`
  )
  return { issues, summary }
}

// ── Combined audit (LLM + deterministic) ──────────────────────────────────────

export async function runFullAudit(opts: {
  originalText: string
  finalModel: ParsedProcess
  model?: string                              // Ollama model; if undefined, only deterministic
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
  appliedFixes?: AppliedFix[]                 // Auto-fixes applied before the audit
}): Promise<AuditReport> {
  const { originalText, finalModel, model, onChunk, signal, appliedFixes } = opts
  const deterministic = runDeterministicAudit(originalText, finalModel)

  let llmIssues: AuditIssue[] = []
  let llmSummary = ''
  let llmRan = false
  let llmFailed = false

  if (model) {
    llmRan = true
    try {
      const result = await runLlmAudit(originalText, finalModel, model, onChunk, signal)
      llmIssues = result.issues
      llmSummary = result.summary
    } catch (err) {
      llmFailed = true
      console.warn('[Audit] LLM pass failed:', err)
    }
  }

  // Combine + de-duplicate.  Prefer the LLM's wording when both sources flag
  // the same logical issue (LLM messages tend to quote the source text).
  // Two findings collide if they share category + the same set of affected
  // elements (case-insensitive, order-independent).
  const merged = [...llmIssues, ...deterministic]
  const byKey = new Map<string, AuditIssue>()
  for (const i of merged) {
    const elementsKey = (i.affectedElements ?? [])
      .map(e => e.trim().toLowerCase())
      .sort()
      .join('|')
    const key = `${i.category}::${elementsKey}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, i)
      continue
    }
    // Merge — keep the LLM finding (richer wording) but tag as "both sources".
    if (existing.source === 'deterministic' && i.source === 'llm') {
      byKey.set(key, i)
    }
    // Otherwise keep the existing one — first win for same-source duplicates.
  }

  // Drop render-pipeline categories — they aren't user-actionable findings:
  //   - gateway-type        — already handled silently by autoFixService;
  //                           any leftover finding here is LLM hallucination
  //                           (e.g. AI says "model uses parallelGateway" when
  //                           the model has already been flipped to exclusive).
  //   - flow-connectivity   — orphan/dead-end findings reflect AI extraction
  //                           gaps the user can't act on directly, and the
  //                           LLM frequently misreads BPMN connectivity rules
  //                           (e.g. "end event has no outgoing flows" — that
  //                           is the correct shape).  The user sees any real
  //                           orphans visually and fixes via Refine.
  // The audit now only surfaces categories that point to a clear gap in the
  // user's natural-language description: bundled tasks, missing tasks,
  // object-as-actor, vague names.
  const HIDDEN_CATEGORIES = new Set<AuditCategory>(['gateway-type', 'flow-connectivity'])
  const unique = Array.from(byKey.values()).filter(i => !HIDDEN_CATEGORIES.has(i.category))

  // Sort: errors first, then warnings, then info.
  const sevOrder: Record<AuditSeverity, number> = { error: 0, warning: 1, info: 2 }
  unique.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  const errors    = unique.filter(i => i.severity === 'error').length
  const warnings  = unique.filter(i => i.severity === 'warning').length
  const infos     = unique.filter(i => i.severity === 'info').length

  const summary = unique.length === 0
    ? (llmSummary || 'Model is consistent with the description.')
    : [
        errors   ? `${errors} error${errors === 1 ? '' : 's'}`         : '',
        warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}`   : '',
        infos    ? `${infos} suggestion${infos === 1 ? '' : 's'}`      : '',
      ].filter(Boolean).join(', ') + ' found.'

  return {
    issues: unique,
    llmRan,
    llmFailed,
    summary,
    originalText,
    processName: finalModel.processName?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    modelUsed: model,
    appliedFixes: (appliedFixes && appliedFixes.length > 0) ? appliedFixes : undefined,
  }
}

