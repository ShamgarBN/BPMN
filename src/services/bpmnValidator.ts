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

  // Process identity
  if (!processName.trim()) {
    issues.push({ severity: 'error', message: 'Process name is required.' })
  }

  // Participants
  if (participants.length === 0) {
    issues.push({ severity: 'warning', message: 'No participants defined. Consider adding at least one swimlane.' })
  }
  for (const p of participants) {
    if (!p.name.trim()) {
      issues.push({ severity: 'error', message: 'All participants must have a name.', nodeId: p.id })
    }
  }

  // Start event
  if (outgoingCount(startEvent.id, flows) === 0) {
    issues.push({
      severity: 'error',
      message: `Start event "${startEvent.name}" has no outgoing sequence flow.`,
      nodeId: startEvent.id,
      nodeLabel: startEvent.name,
    })
  }
  if (outgoingCount(startEvent.id, flows) > 1) {
    issues.push({
      severity: 'error',
      message: `Start event "${startEvent.name}" must have exactly one outgoing flow.`,
      nodeId: startEvent.id,
      nodeLabel: startEvent.name,
    })
  }

  // Tasks
  for (const t of tasks) {
    if (!t.name.trim()) {
      issues.push({ severity: 'error', message: 'All tasks must have a name.', nodeId: t.id })
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
    issues.push({ severity: 'error', message: 'The process has no end event. Add at least one end event.' })
  }
  for (const e of endEvents) {
    if (!e.name.trim()) {
      issues.push({ severity: 'warning', message: 'An end event has no name.', nodeId: e.id })
    }
    if (incomingCount(e.id, flows) === 0) {
      issues.push({ severity: 'warning', message: `End event "${e.name}" has no incoming flow — it is unreachable.`, nodeId: e.id, nodeLabel: e.name })
    }
  }

  // Disconnected elements: are all nodes reachable from start?
  const allNodeIds = new Set([
    startEvent.id,
    ...tasks.map((t) => t.id),
    ...gateways.map((g) => g.id),
    ...endEvents.map((e) => e.id),
  ])

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

function getNodeLabel(id: string, state: WizardState): string | null {
  const task = state.tasks.find((t) => t.id === id)
  if (task) return task.name
  const gw = state.gateways.find((g) => g.id === id)
  if (gw) return gw.name
  const end = state.endEvents.find((e) => e.id === id)
  if (end) return end.name
  return null
}
