/**
 * Unit tests for project file serialization/parsing.
 */

import { describe, expect, it } from 'vitest'
import {
  serializeProject,
  parseProject,
  projectToLoadable,
  ProjectParseError,
  PROJECT_SCHEMA_ID,
  PROJECT_SCHEMA_VERSION,
} from './projectFileService'
import type { WizardState } from '@/types/wizard'

function sampleState(): WizardState {
  return {
    currentStep:        3,                  // transient
    isEditorMode:       true,               // transient
    hasGeneratedDiagram: true,              // transient
    processName:        'Sample',
    processDescription: 'Test process',
    processVersion:     '1.0',
    processOwner:       'QA',
    participants: [
      { id: 'L_1', name: 'Customer', color: '#DBEAFE' },
    ],
    startEvent: {
      id:                  'StartEvent_1',
      name:                'Order placed',
      type:                'none',
      timerDefinition:     '',
      messageRef:          '',
      conditionExpression: '',
    },
    tasks: [
      { id: 'T_1', name: 'Place order', type: 'userTask', participantId: 'L_1', description: '' },
    ],
    gateways:  [],
    flows:     [],
    endEvents: [{ id: 'E_1', name: 'Done', type: 'none' }],
    intermediateEvents: [],
  }
}

describe('serializeProject', () => {
  it('strips transient UI fields', () => {
    const text = serializeProject(sampleState(), '9.9.9')
    const obj = JSON.parse(text)
    expect(obj.state.currentStep).toBeUndefined()
    expect(obj.state.isEditorMode).toBeUndefined()
    expect(obj.state.hasGeneratedDiagram).toBeUndefined()
  })

  it('stamps schema id, version and app version', () => {
    const text = serializeProject(sampleState(), '9.9.9')
    const obj = JSON.parse(text)
    expect(obj.schema).toBe(PROJECT_SCHEMA_ID)
    expect(obj.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(obj.appVersion).toBe('9.9.9')
    expect(typeof obj.savedAt).toBe('string')
  })

  it('preserves the modelled process', () => {
    const text = serializeProject(sampleState(), '1.0.0')
    const parsed = parseProject(text)
    const loaded = projectToLoadable(parsed)
    expect(loaded.processName).toBe('Sample')
    expect(loaded.tasks?.length).toBe(1)
    expect(loaded.endEvents?.[0].name).toBe('Done')
  })
})

describe('parseProject', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseProject('not json')).toThrow(ProjectParseError)
  })

  it('rejects unknown schema', () => {
    const file = JSON.stringify({
      schema:        'not/bpmnstudio',
      schemaVersion: 1,
      state:         {},
    })
    expect(() => parseProject(file)).toThrow(/BPMN Studio project/)
  })

  it('rejects future schema versions', () => {
    const file = JSON.stringify({
      schema:        PROJECT_SCHEMA_ID,
      schemaVersion: PROJECT_SCHEMA_VERSION + 1,
      state:         {},
    })
    expect(() => parseProject(file)).toThrow(/newer version/)
  })

  it('rejects missing state', () => {
    const file = JSON.stringify({
      schema:        PROJECT_SCHEMA_ID,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    })
    expect(() => parseProject(file)).toThrow(/state/)
  })

  it('rejects non-object root', () => {
    expect(() => parseProject('"a-string"')).toThrow(/JSON object/)
  })
})
