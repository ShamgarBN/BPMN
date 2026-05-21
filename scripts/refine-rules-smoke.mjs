// Smoke test for the deterministic refiner (refineWithRules).
// Runs the patterns the panel surfaces — rename, re-assign, threshold, remove —
// against a small fixture and asserts the expected mutations.
//
// Run with: node --experimental-strip-types scripts/refine-rules-smoke.mjs

import { refineWithRules } from '../src/services/refineRules.ts'

let pass = 0
let fail = 0

function ok(cond, msg) {
  if (cond) {
    console.log(`✓ ${msg}`)
    pass++
  } else {
    console.error(`✗ ${msg}`)
    fail++
  }
}

const baseModel = {
  processName: 'Reimbursement',
  processDescription: 'Reimburse employee expenses',
  participants: [
    { name: 'Employee' },
    { name: 'Manager' },
    { name: 'Finance' },
  ],
  startEvent: { name: 'Expense incurred', type: 'none' },
  tasks: [
    { name: 'Submit expense report', participantName: 'Employee',  type: 'userTask' },
    { name: 'Review report',         participantName: 'Manager',   type: 'userTask' },
    { name: 'Verify receipts',       participantName: 'Finance',   type: 'userTask' },
    { name: 'Process payment',       participantName: 'Finance',   type: 'userTask' },
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

// ── Rename ─────────────────────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Rename "Review report" to "Manager reviews report"')
  ok(r.applied, 'rename: applied')
  ok(
    r.model.tasks.some(t => t.name === 'Manager reviews report'),
    'rename: task renamed',
  )
  ok(
    r.model.flows.some(f => f.from === 'Manager reviews report' || f.to === 'Manager reviews report'),
    'rename: flows updated to new name',
  )
  // Original input untouched
  ok(
    baseModel.tasks.some(t => t.name === 'Review report'),
    'rename: original model not mutated',
  )
}

// ── Re-assign (handles) ────────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'The VP handles the Process payment task')
  ok(r.applied, 're-assign(handles): applied')
  const task = r.model.tasks.find(t => t.name === 'Process payment')
  ok(task?.participantName === 'VP', 're-assign(handles): participant changed to VP')
  ok(
    r.model.participants.some(p => p.name === 'VP'),
    're-assign(handles): new participant added',
  )
}

// ── Re-assign (Assign … to …) ──────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Assign the Verify receipts task to Accounting')
  ok(r.applied, 're-assign(assign-to): applied')
  const task = r.model.tasks.find(t => t.name === 'Verify receipts')
  ok(task?.participantName === 'Accounting', 're-assign(assign-to): participant changed')
}

// ── Threshold tweak ────────────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Change the threshold to $10,000')
  ok(r.applied, 'threshold: applied')
  ok(
    r.model.flows.some(f => f.label?.includes('$10,000')),
    'threshold: dollar amount replaced',
  )
}

// ── Threshold with k suffix ────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Update the threshold to $25k')
  ok(r.applied, 'threshold(k): applied')
  ok(
    r.model.flows.some(f => f.label?.includes('$25,000')),
    'threshold(k): expanded to $25,000',
  )
}

// ── Remove ─────────────────────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Remove the Verify receipts task')
  ok(r.applied, 'remove: applied')
  ok(
    !r.model.tasks.some(t => t.name === 'Verify receipts'),
    'remove: task gone',
  )
  // Flow stitched around it: Approved? → Process payment should exist
  ok(
    r.model.flows.some(f => f.from === 'Approved?' && f.to === 'Process payment'),
    'remove: flows stitched around removed task',
  )
  ok(
    !r.model.flows.some(f => f.to === 'Verify receipts' || f.from === 'Verify receipts'),
    'remove: no dangling references',
  )
}

// ── Non-match: passthrough ─────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, 'Make this process faster and more efficient please.')
  ok(!r.applied, 'non-match: applied flag false')
  ok(r.model === baseModel || JSON.stringify(r.model) === JSON.stringify(baseModel),
     'non-match: model unchanged')
}

// ── Empty input ────────────────────────────────────────────────────────────
{
  const r = refineWithRules(baseModel, '   ')
  ok(!r.applied, 'empty: applied flag false')
}

console.log(`\n${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
