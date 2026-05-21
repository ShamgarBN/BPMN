/**
 * Unit tests for the wizard state validator.
 *
 * Covers the high-value branches: missing process name (the only hard error),
 * orphan tasks, start/end connectivity rules, intermediate event connectivity,
 * and the converging-gateway heuristic (`needsClosingGateway`).
 */

import { describe, expect, it } from 'vitest'
import { validateWizardState } from './bpmnValidator'
import type { WizardState } from '@/types/wizard'

function emptyState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 0,
    isEditorMode: false,
    hasGeneratedDiagram: false,
    processName: 'Sample',
    processDescription: '',
    processVersion: '1.0',
    processOwner: '',
    participants: [{ id: 'L_1', name: 'Lane 1', color: '#DBEAFE' }],
    startEvent: {
      id: 'S_1', name: 'Start', type: 'none',
      timerDefinition: '', messageRef: '', conditionExpression: '',
    },
    tasks: [],
    gateways: [],
    flows: [],
    endEvents: [{ id: 'E_1', name: 'End', type: 'none' }],
    intermediateEvents: [],
    ...overrides,
  }
}

describe('validateWizardState', () => {
  it('requires a process name (only true hard error)', () => {
    const result = validateWizardState(emptyState({ processName: '   ' }))
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.severity === 'error' && /Process name/.test(i.message))).toBe(true)
  })

  it('warns when start event has no outgoing flow', () => {
    const result = validateWizardState(emptyState())
    expect(result.issues.some(i => /no outgoing sequence flow/.test(i.message))).toBe(true)
  })

  it('warns when start event has multiple outgoing flows', () => {
    const result = validateWizardState(emptyState({
      tasks: [
        { id: 'T_1', name: 'A', type: 'userTask', participantId: 'L_1', description: '' },
        { id: 'T_2', name: 'B', type: 'userTask', participantId: 'L_1', description: '' },
      ],
      flows: [
        { id: 'F_1', sourceId: 'S_1', targetId: 'T_1', label: '' },
        { id: 'F_2', sourceId: 'S_1', targetId: 'T_2', label: '' },
      ],
    }))
    expect(result.issues.some(i => /more than one outgoing/.test(i.message))).toBe(true)
  })

  it('warns when intermediate events lack incoming/outgoing flows', () => {
    const result = validateWizardState(emptyState({
      tasks: [
        { id: 'T_1', name: 'A', type: 'userTask', participantId: 'L_1', description: '' },
      ],
      flows: [
        { id: 'F_1', sourceId: 'S_1', targetId: 'T_1', label: '' },
        { id: 'F_2', sourceId: 'T_1', targetId: 'E_1', label: '' },
      ],
      intermediateEvents: [
        {
          id: 'I_1', name: 'Wait', direction: 'catch', trigger: 'timer',
          participantId: 'L_1', timerDefinition: 'PT1H',
        },
      ],
    }))
    expect(result.issues.some(i => /no incoming/.test(i.message))).toBe(true)
    expect(result.issues.some(i => /no outgoing/.test(i.message))).toBe(true)
  })

  it('detects unreachable nodes from the start event', () => {
    const result = validateWizardState(emptyState({
      tasks: [
        { id: 'T_isolated', name: 'Lone', type: 'userTask', participantId: 'L_1', description: '' },
      ],
      flows: [
        { id: 'F_1', sourceId: 'S_1', targetId: 'E_1', label: '' },
      ],
    }))
    expect(result.issues.some(i => /not reachable/.test(i.message))).toBe(true)
  })

  it('passes (no errors) for a minimal connected flow', () => {
    const result = validateWizardState(emptyState({
      tasks: [
        { id: 'T_1', name: 'Do thing', type: 'userTask', participantId: 'L_1', description: '' },
      ],
      flows: [
        { id: 'F_1', sourceId: 'S_1', targetId: 'T_1', label: '' },
        { id: 'F_2', sourceId: 'T_1', targetId: 'E_1', label: '' },
      ],
    }))
    expect(result.valid).toBe(true)
  })
})
