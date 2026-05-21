/**
 * Deterministic, no-LLM refinement.  Lives in its own module (rather than in
 * nlpService) so it can be smoke-tested with Node's --experimental-strip-types
 * without dragging in the full nlpService import graph (Ollama client, audit
 * service, gateway repair, etc).
 *
 * Handles a small set of high-confidence patterns:
 *   • "rename <old> to <new>"
 *   • "<actor> handles the <task> task"      (re-assigns task to a participant)
 *   • "Assign <task> to <actor>"
 *   • "change the threshold to $<n>"          (replaces dollar values on labels)
 *   • "remove the <task> step|task"           (drops a task, stitches flows)
 *
 * Returns the modified model + an `applied` flag.  When nothing matches we
 * return the model unchanged with `applied = false`.
 */

export interface RefineRulesProcess {
  processName: string
  processDescription: string
  participants: Array<{ name: string }>
  startEvent: { name: string; type?: string }
  tasks: Array<{ name: string; participantName: string; type?: string }>
  gateways: Array<{ name: string; type?: string }>
  flows: Array<{ from: string; to: string; label?: string }>
  endEvents: Array<{ name: string }>
}

export interface RefineRulesResult<T extends RefineRulesProcess> {
  model: T
  applied: boolean
  description: string
}

export function refineWithRules<T extends RefineRulesProcess>(
  currentModel: T,
  refinementText: string,
): RefineRulesResult<T> {
  const text = refinementText.trim()
  if (!text) {
    return { model: currentModel, applied: false, description: '' }
  }

  // Work on a deep copy so we never mutate the caller's input.
  const model: T = JSON.parse(JSON.stringify(currentModel))

  const findTask = (needle: string) => {
    const n = needle.trim().toLowerCase()
    return model.tasks.find(t => t.name.trim().toLowerCase() === n)
        ?? model.tasks.find(t => t.name.trim().toLowerCase().includes(n))
  }
  const findParticipant = (needle: string) => {
    const n = needle.trim().toLowerCase()
    return model.participants.find(p => p.name.trim().toLowerCase() === n)
        ?? model.participants.find(p => p.name.trim().toLowerCase().includes(n))
  }
  const renameEverywhere = (oldName: string, newName: string) => {
    const o = oldName.trim()
    const n = newName.trim()
    if (!o || !n) return false
    const lower = o.toLowerCase()
    let touched = false
    model.tasks = model.tasks.map(t => {
      if (t.name.trim().toLowerCase() === lower) { touched = true; return { ...t, name: n } }
      return t
    })
    model.gateways = model.gateways.map(g => {
      if (g.name.trim().toLowerCase() === lower) { touched = true; return { ...g, name: n } }
      return g
    })
    model.endEvents = model.endEvents.map(e => {
      if (e.name.trim().toLowerCase() === lower) { touched = true; return { ...e, name: n } }
      return e
    })
    if (model.startEvent.name.trim().toLowerCase() === lower) {
      model.startEvent = { ...model.startEvent, name: n }
      touched = true
    }
    model.flows = model.flows.map(f => {
      let next = f
      if (f.from.trim().toLowerCase() === lower) { next = { ...next, from: n }; touched = true }
      if (f.to.trim().toLowerCase()   === lower) { next = { ...next, to:   n }; touched = true }
      return next
    })
    return touched
  }

  // ── Pattern 1: rename ────────────────────────────────────────────────────
  const renameMatch =
    text.match(/^rename\s+["“]?([^"”]+?)["”]?\s+to\s+["“]?([^"”]+?)["”]?\.?$/i)
  if (renameMatch) {
    const [, oldName, newName] = renameMatch
    if (renameEverywhere(oldName, newName)) {
      return {
        model,
        applied: true,
        description: `Renamed "${oldName.trim()}" → "${newName.trim()}".`,
      }
    }
  }

  // ── Pattern 2: re-assign ─────────────────────────────────────────────────
  const handlesMatch = text.match(
    /^(?:the\s+)?([A-Za-z][\w\s.&/-]+?)\s+(?:handles|owns|performs|does)\s+(?:the\s+)?(.+?)(?:\s+(?:task|step))?\.?$/i
  )
  const assignMatch = text.match(
    /^assign\s+(?:the\s+)?(.+?)(?:\s+(?:task|step))?\s+to\s+(.+?)\.?$/i
  )
  let reassignActor: string | null = null
  let reassignTask: string | null = null
  if (assignMatch) {
    reassignTask  = assignMatch[1]
    reassignActor = assignMatch[2]
  } else if (handlesMatch) {
    reassignActor = handlesMatch[1]
    reassignTask  = handlesMatch[2]
  }
  if (reassignActor && reassignTask) {
    const task = findTask(reassignTask)
    if (task) {
      const existing = findParticipant(reassignActor)
      const actorName = existing?.name ?? reassignActor.trim()
      if (!existing) {
        model.participants = [...model.participants, { name: actorName }]
      }
      task.participantName = actorName
      return {
        model,
        applied: true,
        description: `Re-assigned "${task.name}" to "${actorName}".`,
      }
    }
  }

  // ── Pattern 3: dollar-threshold tweak ────────────────────────────────────
  const thresholdMatch = text.match(
    /(?:change|update|set)\s+(?:the\s+)?(?:[\w-]+\s+)?threshold\s+to\s+\$?\s*([\d,]+)\s*(k|thousand|million|m)?\.?/i
  )
  if (thresholdMatch) {
    const rawAmount  = thresholdMatch[1].replace(/,/g, '')
    const multiplier = thresholdMatch[2]?.toLowerCase()
    let amount       = Number.parseInt(rawAmount, 10)
    if (multiplier === 'k' || multiplier === 'thousand') amount *= 1_000
    if (multiplier === 'm' || multiplier === 'million')  amount *= 1_000_000
    if (Number.isFinite(amount) && amount > 0) {
      const moneyRx = /\$\s*[\d,]+(?:\.\d+)?/g
      let touched = false
      model.flows = model.flows.map(f => {
        if (!f.label) return f
        const newLabel = f.label.replace(moneyRx, () => `$${amount.toLocaleString()}`)
        if (newLabel !== f.label) { touched = true; return { ...f, label: newLabel } }
        return f
      })
      if (touched) {
        return {
          model,
          applied: true,
          description: `Updated dollar threshold(s) to $${amount.toLocaleString()}.`,
        }
      }
    }
  }

  // ── Pattern 4: remove a task ─────────────────────────────────────────────
  const removeMatch = text.match(
    /^(?:remove|delete|drop)\s+(?:the\s+)?(.+?)(?:\s+(?:task|step))?\.?$/i
  )
  if (removeMatch) {
    const task = findTask(removeMatch[1])
    if (task) {
      const taskName = task.name
      const incoming = model.flows.filter(f => f.to.trim().toLowerCase()   === taskName.toLowerCase())
      const outgoing = model.flows.filter(f => f.from.trim().toLowerCase() === taskName.toLowerCase())
      const bridged: Array<{ from: string; to: string; label?: string }> = []
      for (const i of incoming) {
        for (const o of outgoing) {
          bridged.push({ from: i.from, to: o.to, label: i.label || o.label || '' })
        }
      }
      model.flows = [
        ...model.flows.filter(f =>
          f.to.trim().toLowerCase()   !== taskName.toLowerCase() &&
          f.from.trim().toLowerCase() !== taskName.toLowerCase()
        ),
        ...bridged,
      ]
      model.tasks = model.tasks.filter(t => t !== task)
      return {
        model,
        applied: true,
        description: `Removed "${taskName}" and stitched flows around it.`,
      }
    }
  }

  return { model: currentModel, applied: false, description: '' }
}
