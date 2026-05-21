/**
 * Unit tests for the BPMN XML generator.
 *
 * These tests are intentionally string-shape focused: they assert that the
 * emitted XML contains the expected elements/attributes for a given wizard
 * state.  Layout/DI output is exercised by the layout & cleanup smoke tests.
 */

import { describe, expect, it } from 'vitest'
import { generateBpmnXml } from './bpmnGenerator'
import type { WizardState } from '@/types/wizard'

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 0,
    isEditorMode: false,
    hasGeneratedDiagram: false,
    processName: 'Demo',
    processDescription: 'Demo description',
    processVersion: '1.0',
    processOwner: '',
    participants: [{ id: 'Lane_A', name: 'Customer', color: '#DBEAFE' }],
    startEvent: {
      id: 'StartEvent_1', name: 'Order placed', type: 'none',
      timerDefinition: '', messageRef: '', conditionExpression: '',
    },
    tasks: [
      { id: 'Task_1', name: 'Place order', type: 'userTask', participantId: 'Lane_A', description: '' },
    ],
    gateways: [],
    flows: [
      { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'Task_1', label: '' },
      { id: 'Flow_2', sourceId: 'Task_1',       targetId: 'EndEvent_1', label: '' },
    ],
    endEvents: [{ id: 'EndEvent_1', name: 'Done', type: 'none' }],
    intermediateEvents: [],
    ...overrides,
  }
}

describe('generateBpmnXml', () => {
  it('emits process name, description, and start/end events', () => {
    const xml = generateBpmnXml(makeState())
    expect(xml).toContain('name="Demo"')
    expect(xml).toContain('<documentation>Demo description</documentation>')
    expect(xml).toContain('<startEvent id="StartEvent_1"')
    expect(xml).toContain('<endEvent id="EndEvent_1"')
  })

  it('emits user task elements with the correct id and name', () => {
    const xml = generateBpmnXml(makeState())
    expect(xml).toContain('<userTask id="Task_1" name="Place order"')
  })

  it('XML-escapes user-supplied names', () => {
    const xml = generateBpmnXml(makeState({
      processName: 'A & B "Quoted" <Test>',
    }))
    expect(xml).toContain('A &amp; B &quot;Quoted&quot; &lt;Test&gt;')
  })

  it('emits conditional sequence flows for decision-gateway branches', () => {
    const xml = generateBpmnXml(makeState({
      gateways: [{ id: 'Gateway_1', name: 'Approved?', type: 'exclusiveGateway' }],
      flows: [
        { id: 'Flow_1', sourceId: 'StartEvent_1',  targetId: 'Task_1',     label: '' },
        { id: 'Flow_2', sourceId: 'Task_1',        targetId: 'Gateway_1',  label: '' },
        { id: 'Flow_3', sourceId: 'Gateway_1',     targetId: 'EndEvent_1', label: 'approved' },
        { id: 'Flow_4', sourceId: 'Gateway_1',     targetId: 'Task_1',     label: 'Otherwise' },
      ],
    }))
    // conditional branch should embed <conditionExpression>
    expect(xml).toMatch(/<sequenceFlow id="Flow_3"[\s\S]*?<conditionExpression/i)
    // default flow ("Otherwise") should NOT have a conditionExpression child
    const flow4 = xml.match(/<sequenceFlow id="Flow_4"[^>]*\/>/)
    expect(flow4).toBeTruthy()
    // gateway should carry default="Flow_4"
    expect(xml).toContain('default="Flow_4"')
  })

  it('emits intermediate catch event with timer definition', () => {
    const xml = generateBpmnXml(makeState({
      intermediateEvents: [
        {
          id: 'IE_1',
          name: 'Wait 1 hour',
          direction: 'catch',
          trigger: 'timer',
          participantId: 'Lane_A',
          timerDefinition: 'PT1H',
        },
      ],
      flows: [
        { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'IE_1',       label: '' },
        { id: 'Flow_2', sourceId: 'IE_1',         targetId: 'Task_1',     label: '' },
        { id: 'Flow_3', sourceId: 'Task_1',       targetId: 'EndEvent_1', label: '' },
      ],
    }))
    expect(xml).toContain('<intermediateCatchEvent id="IE_1" name="Wait 1 hour"')
    expect(xml).toMatch(/<timerEventDefinition[^>]*>[\s\S]*<timeDuration[^>]*>PT1H<\/timeDuration>/)
  })

  it('emits intermediate throw event with signal definition', () => {
    const xml = generateBpmnXml(makeState({
      intermediateEvents: [
        {
          id: 'IE_2',
          name: 'Notify',
          direction: 'throw',
          trigger: 'signal',
          participantId: 'Lane_A',
          signalOrMessageRef: 'Reminder',
        },
      ],
      flows: [
        { id: 'Flow_1', sourceId: 'StartEvent_1', targetId: 'Task_1',    label: '' },
        { id: 'Flow_2', sourceId: 'Task_1',       targetId: 'IE_2',      label: '' },
        { id: 'Flow_3', sourceId: 'IE_2',         targetId: 'EndEvent_1', label: '' },
      ],
    }))
    expect(xml).toContain('<intermediateThrowEvent id="IE_2"')
    expect(xml).toMatch(/<signalEventDefinition[^>]*signalRef="Signal_Reminder"/)
    // The matching <signal> declaration should be present at top level
    expect(xml).toMatch(/<signal id="Signal_Reminder" name="Reminder"/)
  })

  it('emits messageRef and matching <message> declaration for message-start events', () => {
    const xml = generateBpmnXml(makeState({
      startEvent: {
        id: 'StartEvent_1', name: 'Order received',
        type: 'message', timerDefinition: '',
        messageRef: 'OrderReceived', conditionExpression: '',
      },
    }))
    expect(xml).toMatch(/<messageEventDefinition[^>]*messageRef="Message_OrderReceived"/)
    expect(xml).toMatch(/<message id="Message_OrderReceived" name="OrderReceived"/)
  })

  it('emits terminate end event with the right definition', () => {
    const xml = generateBpmnXml(makeState({
      endEvents: [{ id: 'EndEvent_1', name: 'Cancelled', type: 'terminate' }],
    }))
    expect(xml).toMatch(/<endEvent id="EndEvent_1"[\s\S]*?<terminateEventDefinition/)
  })
})
