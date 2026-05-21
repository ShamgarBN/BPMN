import type { WizardState } from '@/types/wizard'

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
  nodeId?: string
  nodeLabel?: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

export function validateWizardState(state: WizardState): ValidationResult {
  const issues: ValidationIssue[] = []
  const { processName, participants, startEvent, tasks, gateways, flows, endEvents } = state

  // Process identity — the only true hard error
  if (!processName.trim()) {
    issues.push({ severity: 'error', message: 'Process name is required (Step 1).' })
  }

  // Participants
  if (participants.length === 0) {
    issues.push({ severity: 'warning', message: 'No participants defined. Consider adding at least one swimlane.' })
  }
  for (const p of participants) {
    if (!p.name.trim()) {
      issues.push({ severity: 'warning', message: 'A participant has no name.', nodeId: p.id })
    }
  }

  // Start event
  if (outgoingCount(startEvent.id, flows) === 0) {
    issues.push({
      severity: 'warning',
      message: `Start event "${startEvent.name}" has no outgoing sequence flow — the process has no path yet.`,
      nodeId: startEvent.id,
      nodeLabel: startEvent.name,
    })
  }
  if (outgoingCount(startEvent.id, flows) > 1) {
    issues.push({
      severity: 'warning',
      message: `Start event "${startEvent.name}" has more than one outgoing flow — only one is allowed per BPMN 2.0.`,
      nodeId: startEvent.id,
      nodeLabel: startEvent.name,
    })
  }

  // Tasks
  for (const t of tasks) {
    if (!t.name.trim()) {
      issues.push({ severity: 'warning', message: 'A task has no name — give it one for a clean diagram.', nodeId: t.id })
    }
    if (!t.participantId) {
      issues.push({ severity: 'warning', message: `Task "${t.name}" is not assigned to a participant.`, nodeId: t.id, nodeLabel: t.name })
    }
    if (incomingCount(t.id, flows) === 0 && t.id !== startEvent.id) {
      issues.push({ severity: 'warning', message: `Task "${t.name}" has no incoming flow — it will be unreachable.`, nodeId: t.id, nodeLabel: t.name })
    }
    if (outgoingCount(t.id, flows) === 0) {
      issues.push({ severity: 'warning', message: `Task "${t.name}" has no outgoing flow — the process will stall here.`, nodeId: t.id, nodeLabel: t.name })
    }
    if (needsClosingGateway(t.id, flows, gateways)) {
      issues.push({
        severity: 'warning',
        message:
          `Task "${t.name}" has multiple incoming flows that aren't merged through a converging gateway. ` +
          `Consider adding a closing gateway (BPMN best practice — every split should be matched by a join).`,
        nodeId: t.id, nodeLabel: t.name,
      })
    }
  }

  // Gateways
  for (const g of gateways) {
    if (!g.name.trim()) {
      issues.push({ severity: 'warning', message: 'A gateway has no name — consider labelling decision points.', nodeId: g.id })
    }
    const incoming = incomingCount(g.id, flows)
    const outgoing = outgoingCount(g.id, flows)
    if (incoming === 0) {
      issues.push({ severity: 'error', message: `Gateway "${g.name}" has no incoming flow.`, nodeId: g.id, nodeLabel: g.name })
    }
    if (outgoing < 2 && (g.type === 'exclusiveGateway' || g.type === 'inclusiveGateway' || g.type === 'parallelGateway')) {
      issues.push({ severity: 'warning', message: `Gateway "${g.name}" should have at least 2 outgoing flows to be useful.`, nodeId: g.id, nodeLabel: g.name })
    }
  }

  // End events
  if (endEvents.length === 0) {
    issues.push({ severity: 'warning', message: 'The process has no end event yet. Add one in Step 6.' })
  }
  for (const e of endEvents) {
    if (!e.name.trim()) {
      issues.push({ severity: 'warning', message: 'An end event has no name.', nodeId: e.id })
    }
    if (incomingCount(e.id, flows) === 0) {
      issues.push({ severity: 'warning', message: `End event "${e.name}" has no incoming flow — it is unreachable.`, nodeId: e.id, nodeLabel: e.name })
    }
    if (needsClosingGateway(e.id, flows, gateways)) {
      issues.push({
        severity: 'warning',
        message:
          `End event "${e.name}" has multiple incoming flows that aren't merged through a converging gateway. ` +
          `Consider adding a closing gateway before this end event.`,
        nodeId: e.id, nodeLabel: e.name,
      })
    }
  }

  // Disconnected elements: are all nodes reachable from start?
  const intermediateEvents = state.intermediateEvents ?? []
  const allNodeIds = new Set([
    startEvent.id,
    ...tasks.map((t) => t.id),
    ...gateways.map((g) => g.id),
    ...intermediateEvents.map((ie) => ie.id),
    ...endEvents.map((e) => e.id),
  ])

  // Intermediate events must have both incoming and outgoing flows.
  for (const ie of intermediateEvents) {
    if (incomingCount(ie.id, flows) === 0) {
      issues.push({
        severity: 'warning',
        message: `Intermediate event "${ie.name}" has no incoming flow.`,
        nodeId: ie.id,
        nodeLabel: ie.name,
      })
    }
    if (outgoingCount(ie.id, flows) === 0) {
      issues.push({
        severity: 'warning',
        message: `Intermediate event "${ie.name}" has no outgoing flow.`,
        nodeId: ie.id,
        nodeLabel: ie.name,
      })
    }
  }

  const reachable = new Set<string>()
  const queue = [startEvent.id]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (reachable.has(current)) continue
    reachable.add(current)
    for (const f of flows) {
      if (f.sourceId === current && !reachable.has(f.targetId)) {
        queue.push(f.targetId)
      }
    }
  }

  for (const id of allNodeIds) {
    if (!reachable.has(id)) {
      const label = getNodeLabel(id, state)
      if (label) {
        issues.push({ severity: 'warning', message: `Element "${label}" is not reachable from the start event.`, nodeId: id, nodeLabel: label })
      }
    }
  }

  return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues }
}

function incomingCount(id: string, flows: WizardState['flows']): number {
  return flows.filter((f) => f.targetId === id).length
}

function outgoingCount(id: string, flows: WizardState['flows']): number {
  return flows.filter((f) => f.sourceId === id).length
}

/**
 * True when a node has 2+ incoming flows AND at least one incoming flow does
 * NOT come from a converging (join) gateway. Per BPMN spec / Camunda
 * reference, every diverging gateway should be matched by a converging
 * gateway of the same type before merging into a single activity.
 */
function needsClosingGateway(
  nodeId: string,
  flows: WizardState['flows'],
  gateways: WizardState['gateways'],
): boolean {
  const incoming = flows.filter((f) => f.targetId === nodeId)
  if (incoming.length < 2) return false

  const gatewayIds = new Set(gateways.map((g) => g.id))
  for (const f of incoming) {
    if (!gatewayIds.has(f.sourceId)) return true     // a non-gateway feeds in directly
    const gOut = outgoingCount(f.sourceId, flows)
    const gIn  = incomingCount(f.sourceId, flows)
    // Source IS a gateway — counts as a join only if it is a converging
    // gateway (≥2 in, exactly 1 out). Otherwise this convergence still needs
    // its own closing gateway.
    if (!(gIn >= 2 && gOut === 1)) return true
  }
  return false
}

function getNodeLabel(id: string, state: WizardState): string | null {
  const task = state.tasks.find((t) => t.id === id)
  if (task) return task.name
  const gw = state.gateways.find((g) => g.id === id)
  if (gw) return gw.name
  const ie = (state.intermediateEvents ?? []).find((e) => e.id === id)
  if (ie) return ie.name
  const end = state.endEvents.find((e) => e.id === id)
  if (end) return end.name
  return null
}
