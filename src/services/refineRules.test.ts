/**
 * Unit tests for the deterministic refiner.  Mirrors the smoke test in
 * scripts/refine-rules-smoke.mjs but runs under Vitest so failures are
 * surfaced via the test runner in CI.
 */

import { describe, expect, it } from 'vitest'
import { refineWithRules, type RefineRulesProcess } from './refineRules'

function baseModel(): RefineRulesProcess {
  return {
    processName: 'Reimbursement',
    processDescription: 'Reimburse employee expenses',
    participants: [
      { name: 'Employee' },
      { name: 'Manager' },
      { name: 'Finance' },
    ],
    startEvent: { name: 'Expense incurred', type: 'none' },
    tasks: [
      { name: 'Submit expense report', participantName: 'Employee', type: 'userTask' },
      { name: 'Review report',         participantName: 'Manager',  type: 'userTask' },
      { name: 'Verify receipts',       participantName: 'Finance',  type: 'userTask' },
      { name: 'Process payment',       participantName: 'Finance',  type: 'userTask' },
    ],
    gateways: [
      { name: 'Approved?', type: 'exclusiveGateway' },
    ],
    flows: [
      { from: 'Expense incurred',     to: 'Submit expense report' },
      { from: 'Submit expense report',to: 'Review report' },
      { from: 'Review report',        to: 'Approved?' },
      { from: 'Approved?',            to: 'Verify receipts',  label: 'Approved, $5,000' },
      { from: 'Approved?',            to: 'Submit expense report', label: 'Otherwise' },
      { from: 'Verify receipts',      to: 'Process payment' },
      { from: 'Process payment',      to: 'Reimbursed' },
    ],
    endEvents: [ { name: 'Reimbursed' } ],
  }
}

describe('refineWithRules', () => {
  it('renames a task and updates all references', () => {
    const r = refineWithRules(baseModel(), 'Rename "Review report" to "Manager reviews report"')
    expect(r.applied).toBe(true)
    expect(r.model.tasks.some(t => t.name === 'Manager reviews report')).toBe(true)
    expect(r.model.flows.some(f =>
      f.from === 'Manager reviews report' || f.to === 'Manager reviews report',
    )).toBe(true)
  })

  it('does not mutate the input model on rename', () => {
    const start = baseModel()
    refineWithRules(start, 'Rename "Review report" to "Manager reviews report"')
    expect(start.tasks.some(t => t.name === 'Review report')).toBe(true)
  })

  it('re-assigns a task via "<Actor> handles <Task>"', () => {
    const r = refineWithRules(baseModel(), 'The VP handles the Process payment task')
    expect(r.applied).toBe(true)
    expect(r.model.tasks.find(t => t.name === 'Process payment')?.participantName).toBe('VP')
    expect(r.model.participants.some(p => p.name === 'VP')).toBe(true)
  })

  it('re-assigns a task via "Assign <Task> to <Actor>"', () => {
    const r = refineWithRules(baseModel(), 'Assign the Verify receipts task to Accounting')
    expect(r.applied).toBe(true)
    expect(r.model.tasks.find(t => t.name === 'Verify receipts')?.participantName).toBe('Accounting')
  })

  it('rewrites dollar thresholds on flow labels', () => {
    const r = refineWithRules(baseModel(), 'Change the threshold to $10,000')
    expect(r.applied).toBe(true)
    expect(r.model.flows.some(f => f.label?.includes('$10,000'))).toBe(true)
  })

  it('expands "k" / "thousand" suffix into a full dollar value', () => {
    const r = refineWithRules(baseModel(), 'Update the threshold to $25k')
    expect(r.applied).toBe(true)
    expect(r.model.flows.some(f => f.label?.includes('$25,000'))).toBe(true)
  })

  it('removes a task and stitches flows around it', () => {
    const r = refineWithRules(baseModel(), 'Remove the Verify receipts task')
    expect(r.applied).toBe(true)
    expect(r.model.tasks.some(t => t.name === 'Verify receipts')).toBe(false)
    expect(r.model.flows.some(f => f.from === 'Approved?' && f.to === 'Process payment')).toBe(true)
    expect(r.model.flows.some(f =>
      f.from === 'Verify receipts' || f.to === 'Verify receipts',
    )).toBe(false)
  })

  it('returns applied=false when no pattern matches', () => {
    const r = refineWithRules(baseModel(), 'Make this process faster and more efficient please.')
    expect(r.applied).toBe(false)
  })

  it('returns applied=false on empty input', () => {
    const r = refineWithRules(baseModel(), '   ')
    expect(r.applied).toBe(false)
  })
})
