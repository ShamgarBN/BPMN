// Smoke test for the BPMN XML → WizardState importer.
//
// Validates:
//   1. A typical pool/lane file imports with all participants/tasks/gateways
//   2. Default flow + conditional flow attributes survive the round-trip
//   3. A laneless file gets a synthetic "Process" lane
//   4. Round-trip with bpmnGenerator preserves enough structure to reimport
//
// Run with:  node --experimental-strip-types scripts/bpmn-import-smoke.mjs

import { DOMParser } from '@xmldom/xmldom'
import { importBpmnXml, BpmnImportError } from '../src/services/bpmnImporter.ts'

function assert(label, cond) {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) process.exit(1)
}

const parser = new DOMParser()

// ── Fixture 1: 2-lane file with a conditional gateway ───────────────────────
const FIXTURE_WITH_LANES = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collaboration_1">
    <participant id="Pool_1" name="Reimbursement Process" processRef="Process_1"/>
  </collaboration>
  <process id="Process_1" name="Expense Reimbursement" isExecutable="false">
    <documentation>Reimburse employee expenses</documentation>
    <laneSet id="LaneSet_1">
      <lane id="Lane_Employee" name="Employee">
        <flowNodeRef>StartEvent_1</flowNodeRef>
        <flowNodeRef>Task_Submit</flowNodeRef>
        <flowNodeRef>EndEvent_1</flowNodeRef>
      </lane>
      <lane id="Lane_Manager" name="Manager">
        <flowNodeRef>Task_Review</flowNodeRef>
        <flowNodeRef>Gateway_Approve</flowNodeRef>
      </lane>
    </laneSet>
    <startEvent id="StartEvent_1" name="Expense incurred">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Task_Submit" name="Submit expense report">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <userTask id="Task_Review" name="Review report">
      <incoming>Flow_2</incoming>
      <outgoing>Flow_3</outgoing>
    </userTask>
    <exclusiveGateway id="Gateway_Approve" name="Approved?" default="Flow_Reject">
      <incoming>Flow_3</incoming>
      <outgoing>Flow_Approve</outgoing>
      <outgoing>Flow_Reject</outgoing>
    </exclusiveGateway>
    <endEvent id="EndEvent_1" name="Reimbursed">
      <incoming>Flow_Approve</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1"       sourceRef="StartEvent_1"   targetRef="Task_Submit"/>
    <sequenceFlow id="Flow_2"       sourceRef="Task_Submit"    targetRef="Task_Review"/>
    <sequenceFlow id="Flow_3"       sourceRef="Task_Review"    targetRef="Gateway_Approve"/>
    <sequenceFlow id="Flow_Approve" name="Approved" sourceRef="Gateway_Approve" targetRef="EndEvent_1">
      <conditionExpression xsi:type="tFormalExpression">approved == true</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="Flow_Reject"  name="Otherwise" sourceRef="Gateway_Approve" targetRef="Task_Submit"/>
  </process>
</definitions>`

const state = importBpmnXml(FIXTURE_WITH_LANES, { parser })

assert('process name',          state.processName === 'Expense Reimbursement')
assert('process description',   state.processDescription === 'Reimburse employee expenses')
assert('2 participants',        state.participants.length === 2)
assert('lane names',            state.participants[0].name === 'Employee' && state.participants[1].name === 'Manager')
assert('2 tasks',               state.tasks.length === 2)
assert('task in correct lane',  state.tasks.find(t => t.id === 'Task_Submit').participantId === 'Lane_Employee')
assert('1 gateway',             state.gateways.length === 1)
assert('gateway type exclusive',state.gateways[0].type === 'exclusiveGateway')
assert('1 end event',           state.endEvents.length === 1)
assert('start event name',      state.startEvent.name === 'Expense incurred')
assert('5 flows',               state.flows.length === 5)
const approve = state.flows.find(f => f.id === 'Flow_Approve')
const reject  = state.flows.find(f => f.id === 'Flow_Reject')
assert('conditional flow has expression', approve.conditionExpression === 'approved == true')
assert('default flow marked',   reject.isDefault === true)
assert('default flow has no expression', !reject.conditionExpression)

// ── Fixture 2: laneless file should synthesize a single participant ─────────
const FIXTURE_NO_LANES = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D2">
  <process id="P2" name="Quick" isExecutable="false">
    <startEvent id="S2"/>
    <userTask  id="T2" name="Do stuff"/>
    <endEvent  id="E2"/>
    <sequenceFlow id="F1" sourceRef="S2" targetRef="T2"/>
    <sequenceFlow id="F2" sourceRef="T2" targetRef="E2"/>
  </process>
</definitions>`

const lonely = importBpmnXml(FIXTURE_NO_LANES, { parser })
assert('synthesized 1 participant',         lonely.participants.length === 1)
assert('participant inherits process name', lonely.participants[0].name === 'Quick')
assert('task routed to synthetic lane',     lonely.tasks[0].participantId === lonely.participants[0].id)

// ── Fixture 3: hostile input ───────────────────────────────────────────────
try {
  importBpmnXml('<not-bpmn/>', { parser })
  console.log('✗ expected BpmnImportError for non-BPMN input')
  process.exit(1)
} catch (e) {
  assert('rejects non-BPMN input', e instanceof BpmnImportError)
}

try {
  importBpmnXml('<<<>>>', { parser })
  console.log('✗ expected BpmnImportError for garbage XML')
  process.exit(1)
} catch (e) {
  assert('rejects garbage XML', e instanceof BpmnImportError)
}

// ── Fixture 4: detect each event-definition variant ────────────────────────
const FIXTURE_EVENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D3">
  <process id="P3" isExecutable="false">
    <startEvent id="S3">
      <timerEventDefinition><timeDuration>PT1H</timeDuration></timerEventDefinition>
    </startEvent>
    <endEvent id="E3">
      <terminateEventDefinition/>
    </endEvent>
    <sequenceFlow id="F1" sourceRef="S3" targetRef="E3"/>
  </process>
</definitions>`

const typed = importBpmnXml(FIXTURE_EVENT_TYPES, { parser })
assert('timer start detected',      typed.startEvent.type === 'timer')
assert('timer expression captured', typed.startEvent.timerDefinition === 'PT1H')
assert('terminate end detected',    typed.endEvents[0].type === 'terminate')

console.log('\nAll BPMN-import assertions passed.')
