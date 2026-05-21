export type StartEventType =
  | 'none'
  | 'message'
  | 'timer'
  | 'conditional'
  | 'signal'
  | 'error';

export type TaskType =
  | 'userTask'
  | 'serviceTask'
  | 'scriptTask'
  | 'manualTask'
  | 'businessRuleTask'
  | 'receiveTask'
  | 'sendTask';

export type GatewayType =
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'eventBasedGateway';

export type EndEventType = 'none' | 'message' | 'terminate' | 'error' | 'signal';

/**
 * Catching intermediate events wait for a trigger before the flow can continue.
 * Most common authoring case is "timer" (e.g. "wait 24 hours before sending a
 * reminder").  Message/signal/conditional catches show up in inter-process
 * scenarios.
 */
export type IntermediateCatchType = 'timer' | 'message' | 'signal' | 'conditional';

/**
 * Throwing intermediate events emit an event mid-process.  Most common
 * authoring case is "message" (e.g. "notify Finance once approved") and
 * "signal" (broadcast).  No "timer" — timers only catch.
 */
export type IntermediateThrowType = 'message' | 'signal';

export type IntermediateEventDirection = 'catch' | 'throw';

export interface Participant {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  participantId: string;
  description: string;
}

export interface Gateway {
  id: string;
  name: string;
  type: GatewayType;
}

export interface FlowConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  /**
   * Optional formal expression for conditional sequence flows.  When the source
   * is a decision gateway (exclusive/inclusive) this becomes the body of a
   * `<conditionExpression>` element in the emitted BPMN XML.  When absent, the
   * generator falls back to using `label` as the condition text so existing
   * NLP output stays valid.
   */
  conditionExpression?: string;
  /**
   * Marks the flow as the *default* branch of its source gateway.  The BPMN
   * `default="<flowId>"` attribute is added to the gateway, and this flow does
   * NOT receive a `<conditionExpression>` element (per the BPMN 2.0 spec).
   */
  isDefault?: boolean;
}

export interface StartEvent {
  id: string;
  name: string;
  type: StartEventType;
  timerDefinition: string;
  messageRef: string;
  conditionExpression: string;
}

export interface EndEvent {
  id: string;
  name: string;
  type: EndEventType;
}

/**
 * Intermediate event sitting between tasks/gateways.  Round-trips through
 * BPMN XML import/export and project files; the wizard UI does not yet
 * surface a form to author them manually, but importers and NLP can create
 * them and the layout/generator pipelines preserve them.
 */
export interface IntermediateEvent {
  id: string;
  name: string;
  direction: IntermediateEventDirection;
  /**
   * Trigger sub-type.  For `direction='catch'` this can be timer / message
   * / signal / conditional.  For `direction='throw'` it is message / signal.
   */
  trigger: IntermediateCatchType | IntermediateThrowType;
  /** Owning lane (matches Participant.id).  May be empty for poolless processes. */
  participantId: string;
  /** Optional ISO-8601 duration ("PT24H") or cron-like string for timer catches. */
  timerDefinition?: string;
  /** Optional message/signal name reference for message/signal triggers. */
  signalOrMessageRef?: string;
  /** Optional formal condition expression for conditional catches. */
  conditionExpression?: string;
}

export interface WizardState {
  currentStep: number;
  isEditorMode: boolean;
  hasGeneratedDiagram: boolean;

  // Step 1 – Process Identity
  processName: string;
  processDescription: string;
  processVersion: string;
  processOwner: string;

  // Step 2 – Participants / Lanes
  participants: Participant[];

  // Step 3 – Start Trigger
  startEvent: StartEvent;

  // Step 4 – Tasks
  tasks: Task[];

  // Step 5 – Gateways
  gateways: Gateway[];

  // Step 6 – Flows & End Events
  flows: FlowConnection[];
  endEvents: EndEvent[];

  /**
   * Intermediate events that round-trip through the diagram.  Populated by
   * the BPMN importer and (eventually) NLP; surfaced read-only in the
   * diagram and exports for now.
   */
  intermediateEvents?: IntermediateEvent[];
}

export type WizardNode =
  | { kind: 'start'; data: StartEvent }
  | { kind: 'task'; data: Task }
  | { kind: 'gateway'; data: Gateway }
  | { kind: 'intermediate'; data: IntermediateEvent }
  | { kind: 'end'; data: EndEvent };

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  userTask: 'User Task',
  serviceTask: 'Service Task',
  scriptTask: 'Script Task',
  manualTask: 'Manual Task',
  businessRuleTask: 'Business Rule Task',
  receiveTask: 'Receive Task',
  sendTask: 'Send Task',
};

export const GATEWAY_TYPE_LABELS: Record<GatewayType, string> = {
  exclusiveGateway: 'Exclusive (XOR) — one path',
  parallelGateway: 'Parallel (AND) — all paths',
  inclusiveGateway: 'Inclusive (OR) — one or more paths',
  eventBasedGateway: 'Event-Based — first event wins',
};

export const START_EVENT_TYPE_LABELS: Record<StartEventType, string> = {
  none: 'None (process starts immediately)',
  message: 'Message (incoming message or request)',
  timer: 'Timer (scheduled start)',
  conditional: 'Conditional (business condition met)',
  signal: 'Signal (broadcast signal received)',
  error: 'Error (triggered by an error)',
};

export const END_EVENT_TYPE_LABELS: Record<EndEventType, string> = {
  none: 'None (process completes normally)',
  message: 'Message (send message on completion)',
  terminate: 'Terminate (immediately end all flows)',
  error: 'Error (process ends with an error)',
  signal: 'Signal (broadcast signal on completion)',
};

export const PARTICIPANT_COLORS = [
  '#DBEAFE', // blue
  '#D1FAE5', // green
  '#FEF3C7', // amber
  '#FCE7F3', // pink
  '#EDE9FE', // violet
  '#CFFAFE', // cyan
  '#FEE2E2', // red
  '#F3F4F6', // gray
];
