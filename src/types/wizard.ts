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
}

export type WizardNode =
  | { kind: 'start'; data: StartEvent }
  | { kind: 'task'; data: Task }
  | { kind: 'gateway'; data: Gateway }
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
