// Smoke test for the .bpmnstudio project file roundtrip.
//
// Verifies:
//   1. serializeProject() strips transient UI fields
//   2. parseProject() rejects garbage / wrong-schema / future-version files
//   3. round-trip: serialize → parse → loadable state preserves wizard data
//
// Run with:  node --experimental-strip-types scripts/project-roundtrip-smoke.mjs

import {
  serializeProject,
  parseProject,
  projectToLoadable,
  ProjectParseError,
  PROJECT_SCHEMA_ID,
  PROJECT_SCHEMA_VERSION,
} from '../src/services/projectFileService.ts'

function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${pass ? '✓' : '✗'} ${label}`)
  if (!pass) {
    console.log('   expected:', expected)
    console.log('   actual:  ', actual)
    process.exit(1)
  }
}

function throws(label, fn, predicate) {
  try {
    fn()
  } catch (err) {
    if (predicate(err)) {
      console.log(`✓ ${label}`)
      return
    }
    console.log(`✗ ${label} (wrong error: ${err.constructor.name}: ${err.message})`)
    process.exit(1)
  }
  console.log(`✗ ${label} (no error thrown)`)
  process.exit(1)
}

// ── Fixture: full-ish wizard state ─────────────────────────────────────────
const sampleState = {
  currentStep:         3,      // transient — should not survive
  isEditorMode:        true,   // transient — should not survive
  hasGeneratedDiagram: true,   // transient — should not survive
  processName:         'Onboarding',
  processDescription:  'New-hire onboarding process',
  processVersion:      '1.2',
  processOwner:        'HR',
  participants: [
    { id: 'Lane_1', name: 'HR',  color: '#DBEAFE' },
    { id: 'Lane_2', name: 'IT',  color: '#D1FAE5' },
  ],
  startEvent: {
    id: 'StartEvent_1',
    name: 'Offer Accepted',
    type: 'message',
    timerDefinition: '',
    messageRef: 'Offer accepted',
    conditionExpression: '',
  },
  tasks: [
    { id: 'Task_1', name: 'Create employee record', type: 'userTask', participantId: 'Lane_1', description: '' },
    { id: 'Task_2', name: 'Provision laptop',       type: 'userTask', participantId: 'Lane_2', description: '' },
  ],
  gateways: [],
  flows: [
    { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'Task_1', label: '' },
    { id: 'Flow_2', sourceId: 'Task_1',       targetId: 'Task_2', label: '' },
  ],
  endEvents: [{ id: 'EndEvent_1', name: 'New hire started', type: 'none' }],
}

// ── 1. serialize strips transient fields ────────────────────────────────────
const json = serializeProject(sampleState, '1.1.0')
const obj  = JSON.parse(json)
eq('envelope.schema',        obj.schema,        PROJECT_SCHEMA_ID)
eq('envelope.schemaVersion', obj.schemaVersion, PROJECT_SCHEMA_VERSION)
eq('envelope.appVersion',    obj.appVersion,    '1.1.0')
if (!obj.savedAt || isNaN(Date.parse(obj.savedAt))) {
  console.log('✗ envelope.savedAt missing or unparseable')
  process.exit(1)
}
console.log('✓ envelope.savedAt is valid ISO-8601')
for (const k of ['currentStep', 'isEditorMode', 'hasGeneratedDiagram']) {
  if (k in obj.state) {
    console.log(`✗ transient key "${k}" leaked into envelope.state`)
    process.exit(1)
  }
}
console.log('✓ transient keys stripped from envelope.state')

// ── 2. parseProject input-validation ───────────────────────────────────────
throws('rejects non-JSON',    () => parseProject('not json {{}}'),                    e => e instanceof ProjectParseError)
throws('rejects wrong schema', () => parseProject('{"schema":"other","schemaVersion":1,"state":{}}'), e => e instanceof ProjectParseError)
throws('rejects missing state',() => parseProject(JSON.stringify({ schema: PROJECT_SCHEMA_ID, schemaVersion: 1 })), e => e instanceof ProjectParseError)
throws('rejects future schema',() => parseProject(JSON.stringify({ schema: PROJECT_SCHEMA_ID, schemaVersion: 999, state: {} })), e => e instanceof ProjectParseError)
throws('rejects bad version',  () => parseProject(JSON.stringify({ schema: PROJECT_SCHEMA_ID, schemaVersion: -1, state: {} })),  e => e instanceof ProjectParseError)

// ── 3. round-trip preserves modelled data ──────────────────────────────────
const parsed   = parseProject(json)
const loadable = projectToLoadable(parsed)

eq('processName roundtrip',  loadable.processName,  sampleState.processName)
eq('participants roundtrip', loadable.participants, sampleState.participants)
eq('tasks roundtrip',        loadable.tasks,        sampleState.tasks)
eq('flows roundtrip',        loadable.flows,        sampleState.flows)
eq('endEvents roundtrip',    loadable.endEvents,    sampleState.endEvents)
eq('startEvent roundtrip',   loadable.startEvent,   sampleState.startEvent)

console.log('\nAll project roundtrip assertions passed.')
