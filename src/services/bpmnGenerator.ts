import type { WizardState, StartEventType, TaskType, GatewayType, EndEventType } from '@/types/wizard'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function startEventDefinition(type: StartEventType, state: WizardState): string {
  const { startEvent } = state
  switch (type) {
    case 'message':
      return `<messageEventDefinition id="${startEvent.id}_msgDef" />`
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
    case 'signal':
      return `<signalEventDefinition id="${startEvent.id}_sigDef" />`
    case 'error':
      return `<errorEventDefinition id="${startEvent.id}_errDef" />`
    default:
      return ''
  }
}

function endEventDefinition(type: EndEventType, eventId: string): string {
  switch (type) {
    case 'message':
      return `<messageEventDefinition id="${eventId}_msgDef" />`
    case 'terminate':
      return `<terminateEventDefinition id="${eventId}_termDef" />`
    case 'error':
      return `<errorEventDefinition id="${eventId}_errDef" />`
    case 'signal':
      return `<signalEventDefinition id="${eventId}_sigDef" />`
    default:
      return ''
  }
}

function taskElement(type: TaskType): string {
  return type // bpmn element names match task type names
}

function gatewayElement(type: GatewayType): string {
  return type
}

/**
 * Builds a BPMN 2.0 XML string from the current wizard state.
 * The diagram info (DI) section is minimal — bpmn-auto-layout will add
 * proper coordinates before the diagram is rendered in bpmn-js.
 */
export function generateBpmnXml(state: WizardState): string {
  const {
    processName,
    processDescription,
    processVersion,
    processOwner,
    participants,
    startEvent,
    tasks,
    gateways,
    flows,
    endEvents,
  } = state

  const processId = 'Process_1'
  const collaborationId = 'Collaboration_1'
  const participantId = 'Participant_1'
  const laneSetId = 'LaneSet_1'

  // Build lookup maps for incoming/outgoing flows
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

  // Lane sections: map each task to its participant lane
  const laneXml = participants
    .map((p) => {
      const refs = tasks
        .filter((t) => t.participantId === p.id)
        .map((t) => `<flowNodeRef>${t.id}</flowNodeRef>`)
        .join('')
      return `<lane id="${p.id}" name="${escapeXml(p.name)}">${refs}</lane>`
    })
    .join('\n      ')

  const laneSetXml =
    participants.length > 0
      ? `<laneSet id="${laneSetId}">\n      ${laneXml}\n    </laneSet>`
      : ''

  // Start event
  const startDef = startEventDefinition(startEvent.type, state)
  const startXml = `<startEvent id="${startEvent.id}" name="${escapeXml(startEvent.name)}">
      ${incoming(startEvent.id)}${outgoing(startEvent.id)}${startDef}
    </startEvent>`

  // Tasks
  const tasksXml = tasks
    .map((t) => {
      const tag = taskElement(t.type)
      const desc = t.description
        ? `<documentation>${escapeXml(t.description)}</documentation>`
        : ''
      return `<${tag} id="${t.id}" name="${escapeXml(t.name)}">
      ${desc}${incoming(t.id)}${outgoing(t.id)}
    </${tag}>`
    })
    .join('\n    ')

  // Gateways
  const gatewaysXml = gateways
    .map((g) => {
      const tag = gatewayElement(g.type)
      return `<${tag} id="${g.id}" name="${escapeXml(g.name)}">
      ${incoming(g.id)}${outgoing(g.id)}
    </${tag}>`
    })
    .join('\n    ')

  // End events
  const endEventsXml = endEvents
    .map((e) => {
      const def = endEventDefinition(e.type, e.id)
      return `<endEvent id="${e.id}" name="${escapeXml(e.name)}">
      ${incoming(e.id)}${outgoing(e.id)}${def}
    </endEvent>`
    })
    .join('\n    ')

  // Sequence flows
  const flowsXml = flows
    .map((f) => {
      const labelAttr = f.label ? ` name="${escapeXml(f.label)}"` : ''
      return `<sequenceFlow id="${f.id}"${labelAttr} sourceRef="${f.sourceId}" targetRef="${f.targetId}" />`
    })
    .join('\n    ')

  // Documentation attribute for process
  const docXml = processDescription
    ? `<documentation>${escapeXml(processDescription)}</documentation>`
    : ''

  // Collaboration wrapper (only when participants are defined)
  const collaborationXml =
    participants.length > 0
      ? `<collaboration id="${collaborationId}">
    <participant id="${participantId}" name="${escapeXml(processName || 'Process')}" processRef="${processId}" />
  </collaboration>`
      : ''

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

  ${collaborationXml}

  <process id="${processId}"
           name="${escapeXml(processName || 'Untitled Process')}"
           isExecutable="false">
    ${docXml}
    ${processOwner ? `<!-- Process Owner: ${escapeXml(processOwner)} -->` : ''}
    ${laneSetXml}
    ${startXml}
    ${tasksXml}
    ${gatewaysXml}
    ${endEventsXml}
    ${flowsXml}
  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1"
      bpmnElement="${participants.length > 0 ? collaborationId : processId}">
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</definitions>`

  return xml
}
