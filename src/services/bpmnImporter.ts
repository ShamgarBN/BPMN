/**
 * BPMN 2.0 XML → WizardState importer.
 *
 * Parses a BPMN XML document and produces a `Partial<WizardState>` suitable
 * for `wizardStore.loadState()`.  The DI (BPMNShape / BPMNEdge) is *not*
 * preserved — when the user regenerates a diagram from the loaded state the
 * layout service rebuilds it from scratch.  This keeps the importer simple
 * and resilient to third-party files that ship malformed DI.
 *
 * The importer is namespace-agnostic: it accepts elements in any namespace
 * by matching on local name only (so files emitted by Camunda, Zeebe, Signavio,
 * bpmn.io, etc. all load).
 *
 * Caller (App.tsx) is responsible for catching errors and surfacing them via
 * the toast system.
 */

import type {
  WizardState,
  StartEvent,
  StartEventType,
  EndEvent,
  EndEventType,
  Task,
  TaskType,
  Gateway,
  GatewayType,
  FlowConnection,
  Participant,
  IntermediateEvent,
  IntermediateCatchType,
  IntermediateThrowType,
} from '../types/wizard.ts'
import { PARTICIPANT_COLORS } from '../types/wizard.ts'

export class BpmnImportError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'BpmnImportError'
    this.cause = cause
  }
}

const VALID_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  'userTask', 'serviceTask', 'scriptTask', 'manualTask',
  'businessRuleTask', 'receiveTask', 'sendTask',
])

const VALID_GATEWAY_TYPES: ReadonlySet<GatewayType> = new Set([
  'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway',
])

/**
 * Optional DOMParser dependency.  In the renderer we use `window.DOMParser`;
 * tests pass in `@xmldom/xmldom`.  Callers that already have a Document can
 * use `documentToWizardState` directly.
 */
export interface ImportOptions {
  parser?: { parseFromString: (input: string, mimeType: string) => Document }
}

export function importBpmnXml(xml: string, opts: ImportOptions = {}): Partial<WizardState> {
  if (!xml || typeof xml !== 'string') {
    throw new BpmnImportError('Input is not a string.')
  }
  const parser = opts.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : undefined)
  if (!parser) {
    throw new BpmnImportError(
      'No XML parser available.  Provide one via `opts.parser` when running outside a browser.',
    )
  }
  let doc: Document
  try {
    doc = parser.parseFromString(xml, 'text/xml')
  } catch (err) {
    throw new BpmnImportError('Failed to parse XML.', err)
  }
  // DOMParser swallows fatal errors and emits a `<parsererror>` element in
  // the output.  Detect that explicitly.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new BpmnImportError('XML is malformed (parser error).')
  }
  return documentToWizardState(doc)
}

/** Local-name lookup helper that ignores namespaces. */
function findAll(root: Element | Document, localName: string): Element[] {
  // getElementsByTagNameNS('*', name) returns matches regardless of NS prefix
  const list = (root as Element).getElementsByTagNameNS
    ? (root as Element).getElementsByTagNameNS('*', localName)
    : (root as Element).getElementsByTagName(localName)
  return Array.from(list as ArrayLike<Element>)
}

function findFirst(root: Element | Document, localName: string): Element | null {
  return findAll(root, localName)[0] ?? null
}

/** Returns the direct child of `parent` with the given local name. */
function findDirectChild(parent: Element, localName: string): Element | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (n.nodeType === 1 && (n as Element).localName === localName) return n as Element
  }
  return null
}

function findDirectChildren(parent: Element, localName: string): Element[] {
  const out: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const n = parent.childNodes[i]
    if (n.nodeType === 1 && (n as Element).localName === localName) out.push(n as Element)
  }
  return out
}

function detectStartType(el: Element): StartEventType {
  if (findDirectChild(el, 'messageEventDefinition'))     return 'message'
  if (findDirectChild(el, 'timerEventDefinition'))       return 'timer'
  if (findDirectChild(el, 'conditionalEventDefinition')) return 'conditional'
  if (findDirectChild(el, 'signalEventDefinition'))      return 'signal'
  if (findDirectChild(el, 'errorEventDefinition'))       return 'error'
  return 'none'
}

function detectEndType(el: Element): EndEventType {
  if (findDirectChild(el, 'messageEventDefinition'))   return 'message'
  if (findDirectChild(el, 'terminateEventDefinition')) return 'terminate'
  if (findDirectChild(el, 'errorEventDefinition'))     return 'error'
  if (findDirectChild(el, 'signalEventDefinition'))    return 'signal'
  return 'none'
}

function textOfChild(el: Element, localName: string): string {
  const child = findDirectChild(el, localName)
  if (!child) return ''
  return (child.textContent ?? '').trim()
}

/** Maps a BPMN local-name to a TaskType in the wizard's enum. */
function toTaskType(localName: string | undefined | null): TaskType | null {
  if (!localName) return null
  if (localName === 'task') return 'userTask'   // generic task → userTask
  if (VALID_TASK_TYPES.has(localName as TaskType)) return localName as TaskType
  return null
}

function toGatewayType(localName: string | undefined | null): GatewayType | null {
  if (!localName) return null
  if (localName === 'complexGateway') return 'exclusiveGateway' // collapse unsupported
  if (VALID_GATEWAY_TYPES.has(localName as GatewayType)) return localName as GatewayType
  return null
}

/**
 * Core mapping logic — takes a parsed Document and returns a partial wizard
 * state.  Pure (no DOM-API outside the input doc) so it's easy to test.
 */
export function documentToWizardState(doc: Document): Partial<WizardState> {
  // Find the first <process> — it's the only one we model.  Collaborations
  // with multiple processes are flattened to the first executable (or the
  // first if none are flagged executable).
  const processes = findAll(doc, 'process')
  if (processes.length === 0) {
    throw new BpmnImportError('No <process> element found in the document.')
  }
  const proc =
    processes.find((p) => p.getAttribute('isExecutable') === 'true') ??
    processes[0]

  // ── Process identity ────────────────────────────────────────────────────
  const processName        = proc.getAttribute('name') ?? ''
  const processDescription = textOfChild(proc, 'documentation')
  const processVersion     = doc.documentElement.getAttribute('exporterVersion') ?? '1.0'

  // ── Lanes / participants ────────────────────────────────────────────────
  // Pull lanes from <laneSet>.  Fall back to the <participant> in
  // <collaboration> if there's no laneSet.  Fall back to a synthetic
  // "Process" lane if neither exists, so the wizard always has at least one.
  const laneSet = findDirectChild(proc, 'laneSet')
  const laneElements = laneSet ? findDirectChildren(laneSet, 'lane') : []

  const participants: Participant[] = []
  const nodeIdToLaneId = new Map<string, string>()

  if (laneElements.length > 0) {
    for (let i = 0; i < laneElements.length; i++) {
      const lane = laneElements[i]
      const id   = lane.getAttribute('id')   || `Lane_${i + 1}`
      const name = lane.getAttribute('name') || `Lane ${i + 1}`
      const color = PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length]
      participants.push({ id, name, color })

      // flowNodeRef children list the elements that belong to this lane
      for (const ref of findDirectChildren(lane, 'flowNodeRef')) {
        const nodeId = (ref.textContent ?? '').trim()
        if (nodeId) nodeIdToLaneId.set(nodeId, id)
      }
    }
  } else {
    // No laneSet — try the collaboration participant (pool) name
    const collab     = findFirst(doc, 'collaboration')
    const poolPart   = collab ? findDirectChildren(collab, 'participant').find(
      (p) => p.getAttribute('processRef') === proc.getAttribute('id'),
    ) : undefined
    const poolName   = poolPart?.getAttribute('name') ?? processName ?? 'Process'
    participants.push({
      id:    'Lane_1',
      name:  poolName || 'Process',
      color: PARTICIPANT_COLORS[0],
    })
  }

  const defaultParticipantId = participants[0].id

  // ── Tasks ───────────────────────────────────────────────────────────────
  const tasks: Task[] = []
  for (const taskTag of ['task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask',
                          'businessRuleTask', 'receiveTask', 'sendTask']) {
    for (const el of findDirectChildren(proc, taskTag)) {
      const type = toTaskType(el.localName)
      if (!type) continue
      const id   = el.getAttribute('id')   || `Task_${tasks.length + 1}`
      tasks.push({
        id,
        name:          el.getAttribute('name') || `Task ${tasks.length + 1}`,
        type,
        participantId: nodeIdToLaneId.get(id) ?? defaultParticipantId,
        description:   textOfChild(el, 'documentation'),
      })
    }
  }

  // ── Gateways ────────────────────────────────────────────────────────────
  const gateways: Gateway[] = []
  for (const gwTag of ['exclusiveGateway', 'parallelGateway',
                       'inclusiveGateway', 'eventBasedGateway', 'complexGateway']) {
    for (const el of findDirectChildren(proc, gwTag)) {
      const type = toGatewayType(el.localName)
      if (!type) continue
      const id = el.getAttribute('id') || `Gateway_${gateways.length + 1}`
      gateways.push({
        id,
        name: el.getAttribute('name') || `Gateway ${gateways.length + 1}`,
        type,
      })
    }
  }

  // ── Start event(s) ──────────────────────────────────────────────────────
  // The wizard supports a single start event.  If the BPMN has multiple, we
  // keep the first and emit a console hint (toast lives in the caller).
  const startElements = findDirectChildren(proc, 'startEvent')
  let startEvent: StartEvent
  if (startElements.length === 0) {
    startEvent = {
      id: 'StartEvent_1',
      name: 'Start',
      type: 'none',
      timerDefinition: '',
      messageRef: '',
      conditionExpression: '',
    }
  } else {
    const seEl = startElements[0]
    const type = detectStartType(seEl)
    let timerDefinition     = ''
    let conditionExpression = ''
    if (type === 'timer') {
      const td = findDirectChild(seEl, 'timerEventDefinition')
      if (td) timerDefinition = textOfChild(td, 'timeDuration') || textOfChild(td, 'timeDate') || textOfChild(td, 'timeCycle')
    }
    if (type === 'conditional') {
      const cd = findDirectChild(seEl, 'conditionalEventDefinition')
      if (cd) conditionExpression = textOfChild(cd, 'condition')
    }
    startEvent = {
      id:                  seEl.getAttribute('id')   || 'StartEvent_1',
      name:                seEl.getAttribute('name') || 'Start',
      type,
      timerDefinition,
      messageRef: '',
      conditionExpression,
    }
  }

  // ── End events ──────────────────────────────────────────────────────────
  const endEvents: EndEvent[] = findDirectChildren(proc, 'endEvent').map((el, i) => ({
    id:   el.getAttribute('id')   || `EndEvent_${i + 1}`,
    name: el.getAttribute('name') || `End ${i + 1}`,
    type: detectEndType(el),
  }))

  // ── Intermediate events ─────────────────────────────────────────────────
  // Catch + throw variants share the same shape; the direction is encoded in
  // the element local-name.  Triggers we recognise: timer (catch only),
  // message, signal, conditional (catch only).
  function detectIntermediateTrigger(
    el: Element,
    direction: 'catch' | 'throw',
  ): IntermediateCatchType | IntermediateThrowType | null {
    if (findDirectChild(el, 'timerEventDefinition'))       return direction === 'catch' ? 'timer' : null
    if (findDirectChild(el, 'messageEventDefinition'))     return 'message'
    if (findDirectChild(el, 'signalEventDefinition'))      return 'signal'
    if (findDirectChild(el, 'conditionalEventDefinition')) return direction === 'catch' ? 'conditional' : null
    return null
  }

  const intermediateEvents: IntermediateEvent[] = []
  let intIdx = 0
  for (const tag of ['intermediateCatchEvent', 'intermediateThrowEvent'] as const) {
    const direction: 'catch' | 'throw' = tag === 'intermediateCatchEvent' ? 'catch' : 'throw'
    for (const el of findDirectChildren(proc, tag)) {
      intIdx++
      const trigger = detectIntermediateTrigger(el, direction)
      if (!trigger) continue
      const id = el.getAttribute('id') || `IntermediateEvent_${intIdx}`
      let timerDefinition: string | undefined
      let conditionExpression: string | undefined
      if (trigger === 'timer') {
        const td = findDirectChild(el, 'timerEventDefinition')
        if (td) timerDefinition = textOfChild(td, 'timeDuration') || textOfChild(td, 'timeDate') || textOfChild(td, 'timeCycle') || undefined
      }
      if (trigger === 'conditional') {
        const cd = findDirectChild(el, 'conditionalEventDefinition')
        if (cd) conditionExpression = textOfChild(cd, 'condition') || undefined
      }
      intermediateEvents.push({
        id,
        name: el.getAttribute('name') || `Intermediate ${intIdx}`,
        direction,
        trigger,
        participantId: nodeIdToLaneId.get(id) ?? defaultParticipantId,
        ...(timerDefinition     ? { timerDefinition }     : {}),
        ...(conditionExpression ? { conditionExpression } : {}),
      })
    }
  }

  // ── Sequence flows ──────────────────────────────────────────────────────
  // Build a quick lookup of gateway IDs so we can recognise default-attribute
  // values and conditional expressions on outgoing flows.
  const gatewayIds = new Set(gateways.map((g) => g.id))
  const defaultByFlowId = new Set<string>()
  for (const gwTag of ['exclusiveGateway', 'inclusiveGateway']) {
    for (const el of findDirectChildren(proc, gwTag)) {
      const def = el.getAttribute('default')
      if (def) defaultByFlowId.add(def)
    }
  }

  const flows: FlowConnection[] = findDirectChildren(proc, 'sequenceFlow').map((el, i) => {
    const id  = el.getAttribute('id')        || `Flow_${i + 1}`
    const src = el.getAttribute('sourceRef') || ''
    const tgt = el.getAttribute('targetRef') || ''
    const label = el.getAttribute('name') ?? ''
    const isDefault = defaultByFlowId.has(id)
    const condText  = textOfChild(el, 'conditionExpression')
    const flow: FlowConnection = {
      id,
      sourceId: src,
      targetId: tgt,
      label: label || condText || '',
    }
    if (isDefault) flow.isDefault = true
    if (condText)  flow.conditionExpression = condText
    return flow
  }).filter((f) => f.sourceId && f.targetId)

  // ── Lane membership for nodes the wizard cares about ────────────────────
  // We've populated `nodeIdToLaneId` already for tasks; gateways and
  // start/end events use the same map for their lane lookup at render time.
  // The wizard doesn't store gateway/end-event lane explicitly — the
  // generator infers it from neighbouring tasks.  So nothing more to do.
  void gatewayIds  // silence "unused" — kept as documentation hook

  return {
    processName,
    processDescription,
    processVersion,
    participants,
    startEvent,
    tasks,
    gateways,
    flows,
    endEvents,
    ...(intermediateEvents.length > 0 ? { intermediateEvents } : {}),
  }
}
