/**
 * Gateway repair — enforces BPMN's "every diverging gateway needs a matching
 * converging gateway" rule by inserting closing gateways in front of any
 * task or end event with multiple incoming flows.
 *
 * From the Camunda BPMN reference (Parallel Gateways):
 *   "Check yourself: What if we draw the same process, but leave the AND
 *    merge out for lack of space, and the path from the 'prepare salad'
 *    task leads directly to the XOR merge … The token is generated and
 *    then cloned as always at the AND split. As soon as we finish preparing
 *    the salad, the token passes through the XOR merge and 'eat meal'
 *    executes. Five minutes later, 'cook pasta' also completes. Its token
 *    passes through the XOR merge and 'eat meal' executes again! That's
 *    not the behavior we wanted."
 *
 * The closing-gateway type is chosen by tracing each incoming flow back to
 * its nearest preceding split gateway:
 *   1. Same single split ancestor      → use that split's type
 *   2. Multiple splits, same type      → use that type
 *   3. Mixed types or no identifiable split → default to exclusive (XOR-merge)
 */

import type {
  Task, Gateway, EndEvent, FlowConnection, GatewayType,
} from '@/types/wizard'

let _flowCounter = 0
function newFlowId(): string {
  _flowCounter++
  return `Flow_${Date.now().toString(36)}_${_flowCounter}`
}

let _gatewayCounter = 0
function newGatewayId(): string {
  _gatewayCounter++
  return `Gateway_${Date.now().toString(36)}_${_gatewayCounter}`
}

export function insertClosingGatewaysBeforeConvergence(
  tasks: Task[],
  gateways: Gateway[],
  endEvents: EndEvent[],
  flows: FlowConnection[],
): { flows: FlowConnection[]; gateways: Gateway[] } {
  let workingFlows: FlowConnection[] = [...flows]
  const workingGateways: Gateway[] = [...gateways]

  const targets: Array<{ id: string; label: string }> = [
    ...tasks.map(t => ({ id: t.id, label: t.name })),
    ...endEvents.map(e => ({ id: e.id, label: e.name })),
  ]

  for (const tgt of targets) {
    const incoming = workingFlows.filter(f => f.targetId === tgt.id)
    if (incoming.length < 2) continue

    const gatewayById = new Map(workingGateways.map(g => [g.id, g]))

    // If every incoming flow already comes from a converging gateway
    // (≥2 in, exactly 1 out), the join structure is already in place.
    const allFromJoin = incoming.every(f => {
      const g = gatewayById.get(f.sourceId)
      if (!g) return false
      const gIn  = workingFlows.filter(x => x.targetId === g.id).length
      const gOut = workingFlows.filter(x => x.sourceId === g.id).length
      return gIn >= 2 && gOut === 1
    })
    if (allFromJoin) continue

    const closingType = inferClosingGatewayType(incoming, gatewayById, workingFlows)

    const newGateway: Gateway = {
      id:   newGatewayId(),
      name: '',                  // BPMN convention: closing gateways are unnamed
      type: closingType,
    }
    workingGateways.push(newGateway)

    // Redirect every incoming flow to the new gateway, preserving labels.
    workingFlows = workingFlows.map(f =>
      f.targetId === tgt.id ? { ...f, targetId: newGateway.id } : f
    )

    // Add a single flow from the new gateway to the original target.
    workingFlows.push({
      id:        newFlowId(),
      sourceId:  newGateway.id,
      targetId:  tgt.id,
      label:     '',
    })
  }

  return { flows: workingFlows, gateways: workingGateways }
}

/**
 * Determine the type of a closing gateway by tracing each incoming flow back
 * to the nearest preceding split gateway (one with ≥2 outgoing flows).
 */
export function inferClosingGatewayType(
  incoming: FlowConnection[],
  gatewayById: Map<string, Gateway>,
  flows: FlowConnection[],
): GatewayType {
  function findNearestSplit(startNodeId: string): Gateway | null {
    const visited = new Set<string>()
    const queue: string[] = [startNodeId]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur)) continue
      visited.add(cur)
      const gw = gatewayById.get(cur)
      if (gw) {
        const outCount = flows.filter(f => f.sourceId === gw.id).length
        if (outCount >= 2) return gw
      }
      for (const f of flows) {
        if (f.targetId === cur && !visited.has(f.sourceId)) {
          queue.push(f.sourceId)
        }
      }
    }
    return null
  }

  const splits = incoming
    .map(f => findNearestSplit(f.sourceId))
    .filter((g): g is Gateway => g !== null)

  if (splits.length === incoming.length && splits.length > 0) {
    const ids = new Set(splits.map(g => g.id))
    if (ids.size === 1) return splits[0].type        // same single split → its type

    const types = new Set(splits.map(g => g.type))
    if (types.size === 1) return splits[0].type      // multiple splits, same type → that type
  }

  // Mixed types or no identifiable splits — default to exclusive merge.
  return 'exclusiveGateway'
}
