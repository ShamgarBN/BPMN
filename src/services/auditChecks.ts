/**
 * Pure deterministic audit checks — no I/O, no LLM dependency.
 *
 * Split out from auditService.ts so tests and tooling can import the
 * deterministic logic without dragging in the Ollama client.
 */

// ── Types are duplicated here (rather than importing from auditService) so
// this module stays dependency-free at runtime.  auditService re-exports
// these symbols and adds the LLM pass on top.

export type AuditSeverity = 'error' | 'warning' | 'info'

export type AuditCategory =
  | 'gateway-type'
  | 'participant-actor'
  | 'missing-task'
  | 'bundled-tasks'
  | 'flow-connectivity'
  | 'name-clarity'
  | 'other'

export interface AuditIssue {
  severity: AuditSeverity
  category: AuditCategory
  message: string
  suggestion?: string
  affectedElements?: string[]
  source: 'llm' | 'deterministic'
  autoFixed?: boolean
}

// Minimal shape of the model we audit (matches ParsedProcess fields we use).
export interface AuditableModel {
  participants?: Array<{ name: string }>
  startEvent?:   { name: string; type?: string }
  tasks?:        Array<{ name: string; participantName?: string; type?: string }>
  gateways?:     Array<{ name: string; type?: string }>
  flows?:        Array<{ from: string; to: string; label?: string }>
  endEvents?:    Array<{ name: string }>
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const PARALLEL_TRIGGER_RE =
  /\b(in\s+parallel|at\s+the\s+same\s+time|simultaneously|concurrently|while\b|both\s+\S+\s+and\s+\S+\s+(?:must|need|are\s+required))/i

const OBJECT_PARTICIPANT_PATTERNS: Array<{ rx: RegExp; label: string }> = [
  { rx: /\b(coffee\s*maker|coffee\s*machine|espresso\s*machine)\b/i, label: 'coffee machine' },
  { rx: /\b(oven|stove|microwave|toaster|kettle|fridge|refrigerator|freezer|dishwasher|washing\s*machine|dryer)\b/i, label: 'appliance' },
  { rx: /\b(printer|scanner|copier|fax\s*machine|server\s*rack|router|modem)\b/i, label: 'office equipment' },
  { rx: /\b(form|request|application|document|record|file|invoice|receipt|report)\b/i, label: 'document/form' },
  { rx: /\b(button|dashboard|screen|page|menu|panel|widget|icon)\b/i, label: 'UI surface' },
  { rx: /\b(water|paper|coffee|tea|beans|grounds|filter|ink|toner|fuel)\b/i, label: 'consumable/material' },
  { rx: /\b(badge|laptop|computer|phone|tablet|monitor)\b/i, label: 'physical equipment' },
]

const SUMMARY_TASK_VERBS_RE =
  /^\s*(?:brew|prepare|process|handle|do|complete|perform|run|make|setup|set\s*up|finish)\b/i

// ── Helpers ───────────────────────────────────────────────────────────────────

// Narrative connectives that signal a sentence is not a true action enumeration
// — e.g. "When you wake up, want coffee, you head to the kitchen…" looks like
// a comma-and list to the regex, but is really a story-style sentence.
const NARRATIVE_CONNECTIVES = new Set([
  'when', 'while', 'if', 'unless', 'until', 'although', 'though', 'because',
  'since', 'so', 'after', 'before', 'once', 'whenever', 'however',
  'otherwise', 'then', 'first', 'second', 'third', 'finally', 'next', 'meanwhile',
])

function findCommaAndLists(text: string): string[][] {
  const MAX_WORDS_PER_ITEM = 6   // True action enumerations are concise
  const lists: string[][] = []
  const sentences = text.split(/(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    const re = /([a-z][^,.;]+?(?:,\s+[a-z][^,.;]+?){1,}\s*,?\s*(?:and|&)\s+[a-z][^,.;]+?)(?=[,.;]|$)/gi
    const match = re.exec(sentence)
    if (!match) continue
    const parts = match[1]
      .split(/\s*(?:,|\band\b)\s*/i)
      .map(p => p.trim())
      .filter(p => p.length > 0)
    if (parts.length < 3) continue
    // Reject if any item is too long — that's a narrative clause, not a list item.
    const allShort = parts.every(p => p.split(/\s+/).length <= MAX_WORDS_PER_ITEM)
    if (!allShort) continue
    // Reject if ANY item starts with a narrative connective ("when", "if", "then"…) —
    // those mark a story-style sentence rather than an action enumeration.
    const anyConnective = parts.some(p => {
      const firstWord = p.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
      return NARRATIVE_CONNECTIVES.has(firstWord)
    })
    if (anyConnective) continue
    // Reject if more than ⅓ of items lead with a subject pronoun ("you head to…",
    // "they review…").  True imperative action lists ("add a filter, scoop in
    // the grounds, hit the start button") rarely repeat the subject — the
    // subject is established once at the start of the sentence.
    const SUBJECT_PRONOUNS = new Set(['you', 'they', 'we', 'i', 'he', 'she'])
    const subjectLeads = parts.filter(p => {
      const firstWord = p.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? ''
      return SUBJECT_PRONOUNS.has(firstWord)
    }).length
    if (subjectLeads * 3 > parts.length) continue
    lists.push(parts)
  }
  return lists
}

function taskMatchesPhrase(taskName: string, phrase: string): boolean {
  const STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','at','by','from','it','your','my','their','our'])
  const taskWords  = taskName.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP.has(w))
  const phraseWords = phrase.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP.has(w))
  if (!taskWords.length || !phraseWords.length) return false
  return phraseWords.some(pw => taskWords.some(tw => tw === pw || tw.startsWith(pw) || pw.startsWith(tw)))
}

// ── Public entry ──────────────────────────────────────────────────────────────

export function runDeterministicAudit(
  originalText: string,
  finalModel: AuditableModel,
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const text = originalText ?? ''

  // CHECK 1 — parallel gateway without explicit parallelism trigger.
  const hasParallelTrigger = PARALLEL_TRIGGER_RE.test(text)
  for (const g of finalModel.gateways ?? []) {
    if ((g.type ?? '').toLowerCase().includes('parallel') && !hasParallelTrigger) {
      issues.push({
        severity: 'error',
        category: 'gateway-type',
        message: `Gateway "${g.name}" is modeled as parallel (AND) but the description has no parallelism phrase ("in parallel", "at the same time", "simultaneously", "while", "concurrently"). It almost certainly should be exclusive (XOR).`,
        suggestion: `Change "${g.name}" to an exclusiveGateway and rename it to a question (e.g. "Is X true?").`,
        affectedElements: [g.name],
        source: 'deterministic',
      })
    }
  }

  // CHECK 2 — object/equipment used as participant.
  for (const p of finalModel.participants ?? []) {
    for (const { rx, label } of OBJECT_PARTICIPANT_PATTERNS) {
      if (rx.test(p.name)) {
        issues.push({
          severity: 'error',
          category: 'participant-actor',
          message: `Participant "${p.name}" looks like a ${label}, not a person/role/team. Participants should be actors that perform actions.`,
          suggestion: `Remove "${p.name}" and reassign its tasks to the human actor who actually performs them (often "User" or "Employee").`,
          affectedElements: [p.name],
          source: 'deterministic',
        })
        break
      }
    }
  }

  // CHECK 3 — comma-and verb lists with possibly missing tasks.
  // Heuristic gate: only flag if the list has high signal of being a true
  // action list — at least 2 items match existing tasks AND at most ~half
  // are missing.  Otherwise we get false positives on narrative sentences
  // that happen to use "X, Y, and Z" but aren't action enumerations.
  const lists = findCommaAndLists(text)
  for (const list of lists) {
    const matched = list.filter(item =>
      (finalModel.tasks ?? []).some(t => taskMatchesPhrase(t.name, item)) ||
      (finalModel.endEvents ?? []).some(e => taskMatchesPhrase(e.name, item))
    )
    const missing = list.filter(item => !matched.includes(item))
    const isStrongMatch = matched.length >= 2 && missing.length >= 1
                       && missing.length <= Math.ceil(list.length / 2)
    if (isStrongMatch) {
      issues.push({
        severity: 'warning',
        category: 'missing-task',
        message: `The source describes a list of actions ("${list.slice(0, 3).join(', ')}…") but ${missing.length} item${missing.length === 1 ? ' may be' : 's may be'} missing as task${missing.length === 1 ? '' : 's'}.`,
        suggestion: `Add task${missing.length === 1 ? '' : 's'} for: ${missing.slice(0, 4).join('; ')}.`,
        affectedElements: missing.slice(0, 4),
        source: 'deterministic',
      })
    }
  }

  // CHECK 4 — summary-style tasks when the source has many discrete verbs.
  if (lists.length > 0) {
    for (const t of finalModel.tasks ?? []) {
      if (SUMMARY_TASK_VERBS_RE.test(t.name)) {
        const looksLikePaperOver = lists.some(list =>
          list.some(item => taskMatchesPhrase(t.name, item))
        )
        if (looksLikePaperOver) {
          issues.push({
            severity: 'warning',
            category: 'bundled-tasks',
            message: `Task "${t.name}" looks like a summary task that may be hiding several discrete actions described in the source.`,
            suggestion: `Consider splitting "${t.name}" into separate tasks for each action mentioned in the description.`,
            affectedElements: [t.name],
            source: 'deterministic',
          })
        }
      }
    }
  }

  // CHECK 5 — flow connectivity: orphan tasks/gateways/end events.
  const allElementNames = new Set<string>()
  if (finalModel.startEvent?.name) allElementNames.add(finalModel.startEvent.name)
  ;(finalModel.tasks    ?? []).forEach(t => allElementNames.add(t.name))
  ;(finalModel.gateways ?? []).forEach(g => allElementNames.add(g.name))
  ;(finalModel.endEvents ?? []).forEach(e => allElementNames.add(e.name))

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const f of finalModel.flows ?? []) {
    if (allElementNames.has(f.to))   incoming.set(f.to,   (incoming.get(f.to)   ?? 0) + 1)
    if (allElementNames.has(f.from)) outgoing.set(f.from, (outgoing.get(f.from) ?? 0) + 1)
  }

  for (const t of finalModel.tasks ?? []) {
    const inDeg  = incoming.get(t.name) ?? 0
    const outDeg = outgoing.get(t.name) ?? 0
    if (inDeg === 0) {
      issues.push({
        severity: 'error',
        category: 'flow-connectivity',
        message: `Task "${t.name}" has no incoming flow. It will be orphaned in the diagram.`,
        suggestion: `Connect a flow from a previous element into "${t.name}", or remove the task if it isn't needed.`,
        affectedElements: [t.name],
        source: 'deterministic',
      })
    }
    if (outDeg === 0) {
      issues.push({
        severity: 'error',
        category: 'flow-connectivity',
        message: `Task "${t.name}" has no outgoing flow. The process will dead-end here.`,
        suggestion: `Connect a flow from "${t.name}" to the next element, or convert it to an end event.`,
        affectedElements: [t.name],
        source: 'deterministic',
      })
    }
  }

  for (const g of finalModel.gateways ?? []) {
    const inDeg  = incoming.get(g.name) ?? 0
    const outDeg = outgoing.get(g.name) ?? 0
    if (inDeg === 0 || outDeg === 0) {
      issues.push({
        severity: 'error',
        category: 'flow-connectivity',
        message: `Gateway "${g.name}" is missing ${inDeg === 0 ? 'incoming' : 'outgoing'} flows.`,
        suggestion: `Connect ${inDeg === 0 ? 'a flow into' : 'flows out of'} "${g.name}" to all branches it should control.`,
        affectedElements: [g.name],
        source: 'deterministic',
      })
    }
  }

  for (const e of finalModel.endEvents ?? []) {
    const inDeg = incoming.get(e.name) ?? 0
    if (inDeg === 0) {
      issues.push({
        severity: 'error',
        category: 'flow-connectivity',
        message: `End event "${e.name}" has no incoming flow. It will never be reached.`,
        suggestion: `Connect a flow from a final task or gateway branch into "${e.name}".`,
        affectedElements: [e.name],
        source: 'deterministic',
      })
    }
  }

  // CHECK 6 — start event sanity.
  if (finalModel.startEvent?.name) {
    const outDeg = outgoing.get(finalModel.startEvent.name) ?? 0
    if (outDeg === 0) {
      issues.push({
        severity: 'error',
        category: 'flow-connectivity',
        message: `Start event "${finalModel.startEvent.name}" has no outgoing flow. The process can't begin.`,
        suggestion: `Connect a flow from "${finalModel.startEvent.name}" to the first task.`,
        affectedElements: [finalModel.startEvent.name],
        source: 'deterministic',
      })
    }
  }

  return issues
}
