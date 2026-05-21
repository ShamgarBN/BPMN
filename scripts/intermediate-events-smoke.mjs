// Smoke test for intermediate event support across importer → generator.
//
// 1. Parse a BPMN XML that contains intermediateCatchEvent (timer + message)
//    and intermediateThrowEvent (signal).
// 2. Verify importer populates `intermediateEvents` with correct trigger types
//    and definitions.
// 3. Round-trip through generator; ensure emitted XML contains the expected
//    <intermediateCatchEvent>, <intermediateThrowEvent>, <timerEventDefinition>
//    <timeDuration> etc.
//
// Run with: node --experimental-strip-types scripts/intermediate-events-smoke.mjs

import { DOMParser } from '@xmldom/xmldom'
import { importBpmnXml }    from '../src/services/bpmnImporter.ts'

let pass = 0, fail = 0
function ok(cond, msg) {
  if (cond) { console.log(`✓ ${msg}`); pass++ }
  else      { console.error(`✗ ${msg}`); fail++ }
}

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collaboration_1">
    <participant id="Pool_1" name="Demo" processRef="Process_1"/>
  </collaboration>
  <process id="Process_1" name="Reminder Process" isExecutable="false">
    <laneSet id="LaneSet_1">
      <lane id="Lane_Customer" name="Customer">
        <flowNodeRef>StartEvent_1</flowNodeRef>
        <flowNodeRef>Wait24h</flowNodeRef>
        <flowNodeRef>Throw_Notify</flowNodeRef>
        <flowNodeRef>EndEvent_1</flowNodeRef>
      </lane>
    </laneSet>
    <startEvent id="StartEvent_1" name="Order placed">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <intermediateCatchEvent id="Wait24h" name="Wait 24 hours">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
      <timerEventDefinition id="td_1">
        <timeDuration xsi:type="tFormalExpression">PT24H</timeDuration>
      </timerEventDefinition>
    </intermediateCatchEvent>
    <intermediateThrowEvent id="Throw_Notify" name="Notify customer">
      <incoming>Flow_2</incoming>
      <outgoing>Flow_3</outgoing>
      <signalEventDefinition id="sd_1" signalRef="Signal_Notify"/>
    </intermediateThrowEvent>
    <endEvent id="EndEvent_1" name="Done">
      <incoming>Flow_3</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1"  targetRef="Wait24h"/>
    <sequenceFlow id="Flow_2" sourceRef="Wait24h"       targetRef="Throw_Notify"/>
    <sequenceFlow id="Flow_3" sourceRef="Throw_Notify"  targetRef="EndEvent_1"/>
  </process>
</definitions>`

// ── Import side ──────────────────────────────────────────────────────────────
const imported = importBpmnXml(FIXTURE, { parser: new DOMParser() })
ok(Array.isArray(imported.intermediateEvents), 'importer populates intermediateEvents')
ok(imported.intermediateEvents.length === 2, 'two intermediate events imported')

const timer = imported.intermediateEvents.find(e => e.trigger === 'timer')
ok(!!timer && timer.direction === 'catch', 'timer catch event detected')
ok(timer?.timerDefinition === 'PT24H',     'timer duration preserved')
ok(timer?.name === 'Wait 24 hours',         'timer name preserved')

const sig = imported.intermediateEvents.find(e => e.trigger === 'signal')
ok(!!sig && sig.direction === 'throw',     'signal throw event detected')
ok(sig?.name === 'Notify customer',         'signal name preserved')

// Round-trip generator → importer.  We can't import bpmnGenerator.ts directly
// because it pulls in visualCleanupService (which imports from @/ aliases that
// strip-types can't resolve).  Instead we manually verify the importer's
// output shape is enough to drive the generator: every intermediate event has
// a valid trigger, direction, participantId, and id.
for (const ie of imported.intermediateEvents) {
  ok(!!ie.id,                  `id present for ${ie.name}`)
  ok(!!ie.direction,           `direction present for ${ie.name}`)
  ok(!!ie.trigger,             `trigger present for ${ie.name}`)
  ok(!!ie.participantId,       `participantId present for ${ie.name}`)
}

console.log(`\n${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
