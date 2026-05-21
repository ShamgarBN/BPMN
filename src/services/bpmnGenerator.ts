import type {
  WizardState, StartEventType, TaskType, GatewayType, EndEventType,
  IntermediateEvent,
} from '@/types/wizard'
import { computeLayoutScene, serializeScene } from './bpmnLayoutService'
import { runVisualCleanup, type CleanupReport } from './visualCleanupService'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Sanitise an arbitrary string into a BPMN-safe XML id fragment. */
function safeIdFragment(input: string): string {
  return (input || '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'
}

/**
 * Picks the human-readable message/signal/error name for a given event.  Uses
 * `messageRef` when the wizard has stored an explicit value, otherwise falls
 * back to the event name itself so we always emit a meaningful `name=` on the
 * generated `<message>`/`<signal>` element.
 */
function nameForRef(name: string, explicit: string | undefined, fallback: string): string {
  const trimmed = (explicit ?? '').trim()
  if (trimmed) return trimmed
  return (name || '').trim() || fallback
}

function startEventDefinition(type: StartEventType, state: WizardState): string {
  const { startEvent } = state
  switch (type) {
    case 'message': {
      const refId = `Message_${safeIdFragment(startEvent.messageRef || startEvent.name || startEvent.id)}`
      return `<messageEventDefinition id="${startEvent.id}_msgDef" messageRef="${refId}" />`
    }
    case 'timer':
      return `<timerEventDefinition id="${startEvent.id}_timerDef">${
        startEvent.timerDefinition
          ? `<timeDuration xsi:type="tFormalExpression">${escapeXml(startEvent.timerDefinition)}</timeDuration>`
          : ''
      }</timerEventDefinition>`
    case 'conditional':
      return `<conditionalEventDefinition id="${startEvent.id}_condDef">${
        startEvent.conditionExpression
          ? `<condition xsi:type="tFormalExpression">${escapeXml(startEvent.conditionExpression)}</condition>`
          : ''
      }</conditionalEventDefinition>`
    case 'signal': {
      const refId = `Signal_${safeIdFragment(startEvent.name || startEvent.id)}`
      return `<signalEventDefinition id="${startEvent.id}_sigDef" signalRef="${refId}" />`
    }
    case 'error': {
      const refId = `Error_${safeIdFragment(startEvent.name || startEvent.id)}`
      return `<errorEventDefinition id="${startEvent.id}_errDef" errorRef="${refId}" />`
    }
    default:
      return ''
  }
}

function endEventDefinition(type: EndEventType, event: { id: string; name: string }): string {
  const { id: eventId, name } = event
  switch (type) {
    case 'message': {
      const refId = `Message_${safeIdFragment(name || eventId)}`
      return `<messageEventDefinition id="${eventId}_msgDef" messageRef="${refId}" />`
    }
    case 'terminate':
      return `<terminateEventDefinition id="${eventId}_termDef" />`
    case 'error': {
      const refId = `Error_${safeIdFragment(name || eventId)}`
      return `<errorEventDefinition id="${eventId}_errDef" errorRef="${refId}" />`
    }
    case 'signal': {
      const refId = `Signal_${safeIdFragment(name || eventId)}`
      return `<signalEventDefinition id="${eventId}_sigDef" signalRef="${refId}" />`
    }
    default:
      return ''
  }
}

/**
 * Builds the trigger-definition child for an intermediate event.  Catch
 * variants can be timer / message / signal / conditional; throw variants
 * support message / signal only (timers don't throw).  Returns an empty
 * string for misconfigured combinations so the surrounding element still
 * parses.
 */
function intermediateEventDefinition(ev: IntermediateEvent): string {
  const baseId = ev.id
  switch (ev.trigger) {
    case 'timer': {
      // Timer-throw is invalid per BPMN spec; skip the definition if asked.
      if (ev.direction === 'throw') return ''
      const body = ev.timerDefinition
        ? `<timeDuration xsi:type="tFormalExpression">${escapeXml(ev.timerDefinition)}</timeDuration>`
        : ''
      return `<timerEventDefinition id="${baseId}_timerDef">${body}</timerEventDefinition>`
    }
    case 'message': {
      const refId = `Message_${safeIdFragment(ev.signalOrMessageRef || ev.name || ev.id)}`
      return `<messageEventDefinition id="${baseId}_msgDef" messageRef="${refId}" />`
    }
    case 'signal': {
      const refId = `Signal_${safeIdFragment(ev.signalOrMessageRef || ev.name || ev.id)}`
      return `<signalEventDefinition id="${baseId}_sigDef" signalRef="${refId}" />`
    }
    case 'conditional': {
      if (ev.direction === 'throw') return ''
      const body = ev.conditionExpression
        ? `<condition xsi:type="tFormalExpression">${escapeXml(ev.conditionExpression)}</condition>`
        : ''
      return `<conditionalEventDefinition id="${baseId}_condDef">${body}</conditionalEventDefinition>`
    }
    default:
      return ''
  }
}

interface CollectedDefs {
  messages: Array<{ id: string; name: string }>
  signals:  Array<{ id: string; name: string }>
  errors:   Array<{ id: string; name: string }>
}

/**
 * Walks the start + end events and produces the deduplicated set of
 * `<bpmn:message>`, `<bpmn:signal>`, `<bpmn:error>` declarations that the
 * referencing `messageRef` / `signalRef` / `errorRef` attributes point at.
 * Without these the BPMN XML fails strict schema validation and several
 * runtime engines (Camunda, Zeebe) reject the file.
 */
function collectDefinitions(state: WizardState): CollectedDefs {
  const out: CollectedDefs = { messages: [], signals: [], errors: [] }
  const seen = { msg: new Set<string>(), sig: new Set<string>(), err: new Set<string>() }

  // start event
  const se = state.startEvent
  if (se.type === 'message') {
    const id   = `Message_${safeIdFragment(se.messageRef || se.name || se.id)}`
    const name = nameForRef(se.name, se.messageRef, 'Start message')
    if (!seen.msg.has(id)) { seen.msg.add(id); out.messages.push({ id, name }) }
  } else if (se.type === 'signal') {
    const id   = `Signal_${safeIdFragment(se.name || se.id)}`
    const name = nameForRef(se.name, undefined, 'Start signal')
    if (!seen.sig.has(id)) { seen.sig.add(id); out.signals.push({ id, name }) }
  } else if (se.type === 'error') {
    const id   = `Error_${safeIdFragment(se.name || se.id)}`
    const name = nameForRef(se.name, undefined, 'Start error')
    if (!seen.err.has(id)) { seen.err.add(id); out.errors.push({ id, name }) }
  }

  // end events
  for (const ee of state.endEvents) {
    if (ee.type === 'message') {
      const id   = `Message_${safeIdFragment(ee.name || ee.id)}`
      const name = nameForRef(ee.name, undefined, 'End message')
      if (!seen.msg.has(id)) { seen.msg.add(id); out.messages.push({ id, name }) }
    } else if (ee.type === 'signal') {
      const id   = `Signal_${safeIdFragment(ee.name || ee.id)}`
      const name = nameForRef(ee.name, undefined, 'End signal')
      if (!seen.sig.has(id)) { seen.sig.add(id); out.signals.push({ id, name }) }
    } else if (ee.type === 'error') {
      const id   = `Error_${safeIdFragment(ee.name || ee.id)}`
      const name = nameForRef(ee.name, undefined, 'End error')
      if (!seen.err.has(id)) { seen.err.add(id); out.errors.push({ id, name }) }
    }
  }

  // intermediate events (message + signal triggers ref these declarations)
  for (const ie of state.intermediateEvents ?? []) {
    if (ie.trigger === 'message') {
      const id   = `Message_${safeIdFragment(ie.signalOrMessageRef || ie.name || ie.id)}`
      const name = nameForRef(ie.name, ie.signalOrMessageRef, 'Intermediate message')
      if (!seen.msg.has(id)) { seen.msg.add(id); out.messages.push({ id, name }) }
    } else if (ie.trigger === 'signal') {
      const id   = `Signal_${safeIdFragment(ie.signalOrMessageRef || ie.name || ie.id)}`
      const name = nameForRef(ie.name, ie.signalOrMessageRef, 'Intermediate signal')
      if (!seen.sig.has(id)) { seen.sig.add(id); out.signals.push({ id, name }) }
    }
  }
  return out
}

function taskElement(type: TaskType): string {
  return type
}

function gatewayElement(type: GatewayType): string {
  return type
}

/**
 * Words/phrases on a flow label that we interpret as "this is the default
 * branch out of the gateway", not a real condition.  Used only as a fallback
 * when callers haven't explicitly set `flow.isDefault`.
 */
const DEFAULT_FLOW_TOKENS = new Set([
  'default',
  'otherwise',
  'else',
  'other',
  'no other condition',
  'fallback',
])

/**
 * Decision-style gateways carry conditional outflows.  Parallel gateways
 * propagate unconditionally so their outgoing flows must never carry a
 * `<conditionExpression>` (or a `default="..."` attribute on the gateway).
 */
function isDecisionGateway(type: GatewayType | undefined): boolean {
  return type === 'exclusiveGateway' || type === 'inclusiveGateway'
}

/**
 * Infer which participant lane a node (start/end event, gateway) belongs to.
 *
 * Strategy:
 *  1. Look at outgoing flow targets; if one is a task, use that task's lane.
 *  2. Look at incoming flow sources; if one is a task, use that task's lane.
 *  3. Walk one level deeper (target of target, source of source) for gateways
 *     that sit between events.
 *  4. Fall back to the first participant.
 */
function inferParticipantId(nodeId: string, state: WizardState): string {
  const { participants, tasks, flows } = state
  if (!participants.length) return ''

  const firstParticipantId = participants[0].id
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  const outTargets = flows.filter((f) => f.sourceId === nodeId).map((f) => f.targetId)
  const inSources = flows.filter((f) => f.targetId === nodeId).map((f) => f.sourceId)

  // Direct neighbours that are tasks
  for (const id of [...outTargets, ...inSources]) {
    const t = taskById.get(id)
    if (t) return t.participantId
  }

  // One level further (handles gateway ↔ start/end event chains)
  for (const id of outTargets) {
    const secondTargets = flows.filter((f) => f.sourceId === id).map((f) => f.targetId)
    for (const sid of secondTargets) {
      const t = taskById.get(sid)
      if (t) return t.participantId
    }
  }
  for (const id of inSources) {
    const secondSources = flows.filter((f) => f.targetId === id).map((f) => f.sourceId)
    for (const sid of secondSources) {
      const t = taskById.get(sid)
      if (t) return t.participantId
    }
  }

  return firstParticipantId
}

/**
 * Builds a BPMN 2.0 XML string from the current wizard state.
 *
 * The generator runs in three stages:
 *   1. Compute the layout scene (positions, lane bounds, edge waypoints)
 *   2. Run the visual cleanup pass (re-routes edges through shapes, off
 *      swimlane lines, and away from each other; nudges labels off shapes)
 *   3. Serialize the cleaned scene as BPMN DI and embed it in the XML
 *
 * Use `generateBpmnXmlWithReport` if you want the cleanup report.
 */
export function generateBpmnXml(state: WizardState): string {
  return generateBpmnXmlWithReport(state).xml
}

export interface GenerationResult {
  xml:     string
  cleanup: CleanupReport | null   // null when there is no pool/lane DI to clean
}

export function generateBpmnXmlWithReport(state: WizardState): GenerationResult {
  const {
    processName,
    processDescription,
    processVersion,
    participants,
    startEvent,
    tasks,
    gateways,
    flows,
    endEvents,
  } = state
  const intermediateEvents = state.intermediateEvents ?? []

  const processId = 'Process_1'
  const collaborationId = 'Collaboration_1'
  const participantId = 'Participant_1'
  const laneSetId = 'LaneSet_1'

  // ── Incoming / outgoing flow maps ─────────────────────────────────────────
  const incomingMap = new Map<string, string[]>()
  const outgoingMap = new Map<string, string[]>()

  for (const flow of flows) {
    if (!outgoingMap.has(flow.sourceId)) outgoingMap.set(flow.sourceId, [])
    if (!incomingMap.has(flow.targetId)) incomingMap.set(flow.targetId, [])
    outgoingMap.get(flow.sourceId)!.push(flow.id)
    incomingMap.get(flow.targetId)!.push(flow.id)
  }

  const incoming = (id: string) =>
    (incomingMap.get(id) ?? []).map((fid) => `<incoming>${fid}</incoming>`).join('')
  const outgoing = (id: string) =>
    (outgoingMap.get(id) ?? []).map((fid) => `<outgoing>${fid}</outgoing>`).join('')

  // ── Swimlane assignment ───────────────────────────────────────────────────
  // Every flow node must appear in exactly one lane's <flowNodeRef> list for
  // bpmn-auto-layout to render the pool/lane structure correctly.

  const startLaneId = inferParticipantId(startEvent.id, state)

  const endEventLaneIds = new Map(
    endEvents.map((e) => [e.id, inferParticipantId(e.id, state)])
  )

  const gatewayLaneIds = new Map(
    gateways.map((g) => [g.id, inferParticipantId(g.id, state)])
  )

  // Intermediate events: honour explicit `participantId` when provided, else
  // infer from neighbouring tasks/gateways via the same heuristic.
  const intermediateLaneIds = new Map<string, string>()
  for (const ie of intermediateEvents) {
    if (ie.participantId && participants.some((p) => p.id === ie.participantId)) {
      intermediateLaneIds.set(ie.id, ie.participantId)
    } else {
      intermediateLaneIds.set(ie.id, inferParticipantId(ie.id, state))
    }
  }

  // ── Lane set XML ──────────────────────────────────────────────────────────
  const laneSetXml =
    participants.length > 0
      ? `<laneSet id="${laneSetId}">
      ${participants
        .map((p) => {
          const refs: string[] = []
          if (startLaneId === p.id) refs.push(`<flowNodeRef>${startEvent.id}</flowNodeRef>`)
          tasks
            .filter((t) => t.participantId === p.id)
            .forEach((t) => refs.push(`<flowNodeRef>${t.id}</flowNodeRef>`))
          gateways
            .filter((g) => gatewayLaneIds.get(g.id) === p.id)
            .forEach((g) => refs.push(`<flowNodeRef>${g.id}</flowNodeRef>`))
          endEvents
            .filter((e) => endEventLaneIds.get(e.id) === p.id)
            .forEach((e) => refs.push(`<flowNodeRef>${e.id}</flowNodeRef>`))
          intermediateEvents
            .filter((ie) => intermediateLaneIds.get(ie.id) === p.id)
            .forEach((ie) => refs.push(`<flowNodeRef>${ie.id}</flowNodeRef>`))
          return `<lane id="${p.id}" name="${escapeXml(p.name)}">${refs.join('')}</lane>`
        })
        .join('\n      ')}
    </laneSet>`
      : ''

  // ── Start event ───────────────────────────────────────────────────────────
  const startDef = startEventDefinition(startEvent.type, state)
  const startXml = `<startEvent id="${startEvent.id}" name="${escapeXml(startEvent.name)}">
      ${incoming(startEvent.id)}${outgoing(startEvent.id)}${startDef}
    </startEvent>`

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const tasksXml = tasks
    .map((t) => {
      const tag = taskElement(t.type)
      const doc = t.description
        ? `<documentation>${escapeXml(t.description)}</documentation>`
        : ''
      return `<${tag} id="${t.id}" name="${escapeXml(t.name)}">
      ${doc}${incoming(t.id)}${outgoing(t.id)}
    </${tag}>`
    })
    .join('\n    ')

  // ── Conditional-flow resolution ───────────────────────────────────────────
  // For each decision-gateway, pick at most one default flow.  Explicit
  // `flow.isDefault` wins; otherwise fall back to a flow whose label matches
  // one of the DEFAULT_FLOW_TOKENS.  All other flows out of a decision gateway
  // become conditional (using `conditionExpression` or `label` for the body).
  const gatewayById = new Map(gateways.map((g) => [g.id, g]))
  const defaultFlowByGateway = new Map<string, string>()

  for (const g of gateways) {
    if (!isDecisionGateway(g.type)) continue
    const outIds = outgoingMap.get(g.id) ?? []
    if (outIds.length < 2) continue   // gateways with one out flow can't have a default

    // 1) honour explicit isDefault
    let chosen = outIds
      .map((id) => flows.find((f) => f.id === id))
      .find((f) => !!f && f.isDefault === true) as typeof flows[number] | undefined

    // 2) fall back to label heuristic ("otherwise", "else", …)
    if (!chosen) {
      chosen = outIds
        .map((id) => flows.find((f) => f.id === id))
        .find((f) => !!f && DEFAULT_FLOW_TOKENS.has((f.label ?? '').trim().toLowerCase())) as typeof flows[number] | undefined
    }

    if (chosen) defaultFlowByGateway.set(g.id, chosen.id)
  }

  // ── Gateways ──────────────────────────────────────────────────────────────
  const gatewaysXml = gateways
    .map((g) => {
      const tag = gatewayElement(g.type)
      const def = defaultFlowByGateway.get(g.id)
      const defaultAttr = def ? ` default="${def}"` : ''
      return `<${tag} id="${g.id}" name="${escapeXml(g.name)}"${defaultAttr}>
      ${incoming(g.id)}${outgoing(g.id)}
    </${tag}>`
    })
    .join('\n    ')

  // ── End events ────────────────────────────────────────────────────────────
  const endEventsXml = endEvents
    .map((e) => {
      const def = endEventDefinition(e.type, e)
      return `<endEvent id="${e.id}" name="${escapeXml(e.name)}">
      ${incoming(e.id)}${outgoing(e.id)}${def}
    </endEvent>`
    })
    .join('\n    ')

  // ── Intermediate events ───────────────────────────────────────────────────
  // Catch and throw variants share a payload (event definition + flows); we
  // pick the wrapping element name based on `direction`.
  const intermediateEventsXml = intermediateEvents
    .map((ie) => {
      const tag = ie.direction === 'throw' ? 'intermediateThrowEvent' : 'intermediateCatchEvent'
      const def = intermediateEventDefinition(ie)
      return `<${tag} id="${ie.id}" name="${escapeXml(ie.name)}">
      ${incoming(ie.id)}${outgoing(ie.id)}${def}
    </${tag}>`
    })
    .join('\n    ')

  // ── Top-level message / signal / error declarations ───────────────────────
  // These live at the <definitions> scope as siblings of <process>.  They are
  // referenced by `messageRef` / `signalRef` / `errorRef` attributes on the
  // event definitions we wrote above.
  const declsXml = (() => {
    const { messages, signals, errors } = collectDefinitions(state)
    const lines: string[] = []
    for (const m of messages) lines.push(`<message id="${m.id}" name="${escapeXml(m.name)}" />`)
    for (const s of signals)  lines.push(`<signal id="${s.id}" name="${escapeXml(s.name)}" />`)
    for (const e of errors)   lines.push(`<error id="${e.id}" name="${escapeXml(e.name)}" errorCode="${escapeXml(e.name)}" />`)
    return lines.join('\n  ')
  })()

  // ── Sequence flows ────────────────────────────────────────────────────────
  // Three shapes are possible:
  //   1) Plain unconditional flow → self-closed <sequenceFlow .../>
  //   2) Default branch out of a decision gateway → self-closed, no condition
  //      element (the gateway's `default=` attribute already designates it).
  //   3) Conditional flow → open tag containing <conditionExpression>...</...>.
  // We pick the shape based on `flow.isDefault`, `flow.conditionExpression`,
  // and whether the source is a decision gateway with a non-empty label.
  const defaultFlowIds = new Set(defaultFlowByGateway.values())

  const flowsXml = flows
    .map((f) => {
      const labelAttr = f.label ? ` name="${escapeXml(f.label)}"` : ''
      const head = `<sequenceFlow id="${f.id}"${labelAttr} sourceRef="${f.sourceId}" targetRef="${f.targetId}"`

      if (defaultFlowIds.has(f.id)) {
        // Default branch — never carry a conditionExpression
        return `${head} />`
      }

      const source = gatewayById.get(f.sourceId)
      const sourceIsDecision = isDecisionGateway(source?.type)

      // Resolve the condition text:
      //  • explicit `conditionExpression` always wins
      //  • else, if the source is a decision gateway and we have a label,
      //    promote the label to a formal expression
      const explicit = (f.conditionExpression ?? '').trim()
      const inferred = sourceIsDecision ? (f.label ?? '').trim() : ''
      const condText = explicit || inferred

      if (!condText) return `${head} />`

      return `${head}>
      <conditionExpression xsi:type="tFormalExpression">${escapeXml(condText)}</conditionExpression>
    </sequenceFlow>`
    })
    .join('\n    ')

  // ── Process documentation ─────────────────────────────────────────────────
  const docXml = processDescription
    ? `<documentation>${escapeXml(processDescription)}</documentation>`
    : ''

  // ── Collaboration (pool wrapper) ──────────────────────────────────────────
  const collaborationXml =
    participants.length > 0
      ? `<collaboration id="${collaborationId}">
    <participant id="${participantId}" name="${escapeXml(processName || 'Process')}" processRef="${processId}" />
  </collaboration>`
      : ''

  // ── DI + visual cleanup pass ─────────────────────────────────────────────
  let diXml = ''
  let cleanup: CleanupReport | null = null

  if (participants.length > 0) {
    const scene = computeLayoutScene(state)
    if (scene) {
      const result = runVisualCleanup(scene)
      cleanup = result.report
      diXml = serializeScene(result.scene)
    }
  }

  if (!diXml) {
    diXml = `<bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions
  xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="BPMN Studio"
  exporterVersion="${escapeXml(processVersion || '1.0')}">

  ${declsXml}

  ${collaborationXml}

  <process id="${processId}"
           name="${escapeXml(processName || 'Untitled Process')}"
           isExecutable="false">
    ${docXml}
    ${laneSetXml}
    ${startXml}
    ${tasksXml}
    ${gatewaysXml}
    ${intermediateEventsXml}
    ${endEventsXml}
    ${flowsXml}
  </process>

  ${diXml}

</definitions>`

  return { xml, cleanup }
}
