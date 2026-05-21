// Smoke test: autoFixService should fix the recurring AI mistakes from the
// "Morning Coffee" audit report (2026-05-08).  Run with:
//
//   node --experimental-strip-types scripts/autofix-smoke.mjs
//
// We bypass `tsx` to avoid IPC pipe sandbox issues.

import { autoFixModel } from '../src/services/autoFixService.ts'
import { runDeterministicAudit } from '../src/services/auditChecks.ts'

const COFFEE_TEXT = `When you wake up and want coffee, you head to the kitchen and check the coffee maker. First, you need to see if there are enough coffee beans in the container. If you're out of beans, you grab a new bag from the pantry and refill it before moving on. Otherwise, you go straight to the next step. Then you check the water reservoir — if it's low, you fill it up with fresh water; if it's already full, you skip that and go right to brewing. You add a filter, scoop in the grounds, and hit the start button. Once the coffee finishes brewing, you pour it into your favorite mug, add cream and sugar to taste, and enjoy your morning cup.`

const MODEL = {
  processName: 'Morning Coffee Process',
  processDescription: 'Brew coffee.',
  participants: [{ name: 'User' }],
  startEvent: { name: 'Wake Up', type: 'startEvent' },
  tasks: [
    { name: 'Head To Kitchen',     participantName: 'User' },
    { name: 'Check Coffee Beans',  participantName: 'User' },
    { name: 'Refill Beans',        participantName: 'User' },
    { name: 'Check Water Level',   participantName: 'User' },
    { name: 'Fill Water Reservoir',participantName: 'User' },
    { name: 'Hit Start Button',    participantName: 'User' },
    { name: 'Pour Coffee',         participantName: 'User' },
    { name: 'Add Cream And Sugar', participantName: 'User' },
  ],
  gateways: [
    { name: 'Beans Available?',       type: 'parallelGateway' },
    { name: 'Water Reservoir Full?',  type: 'parallelGateway' },
  ],
  flows: [
    { from: 'Wake Up',                 to: 'Head To Kitchen' },
    { from: 'Head To Kitchen',         to: 'Check Coffee Beans' },
    { from: 'Check Coffee Beans',      to: 'Beans Available?' },
    { from: 'Beans Available?',        to: 'Refill Beans',         label: 'No' },
    { from: 'Beans Available?',        to: 'Check Water Level',    label: 'Yes' },
    { from: 'Refill Beans',            to: 'Check Water Level' },
    { from: 'Check Water Level',       to: 'Water Reservoir Full?' },
    { from: 'Water Reservoir Full?',   to: 'Fill Water Reservoir', label: 'No' },
    { from: 'Water Reservoir Full?',   to: 'Hit Start Button',     label: 'Yes' },
    { from: 'Fill Water Reservoir',    to: 'Hit Start Button' },
    { from: 'Hit Start Button',        to: 'Pour Coffee' },
    { from: 'Pour Coffee',             to: 'Add Cream And Sugar' },
    { from: 'Add Cream And Sugar',     to: 'Coffee Ready' },
    { from: 'Coffee Ready',            to: 'Hit Start Button' },  // BPMN violation: outgoing flow from end event
  ],
  endEvents: [{ name: 'Coffee Ready', type: 'endEvent' }],
}

console.log('=== Audit BEFORE autofix ===')
const beforeIssues = runDeterministicAudit(COFFEE_TEXT, MODEL)
for (const i of beforeIssues) {
  console.log(`  [${i.severity}] ${i.category}: ${i.message}`)
}

const beforeParallelErrors = beforeIssues.filter(i => i.category === 'gateway-type').length

console.log()
console.log('=== Running autoFixModel ===')
const { model: fixed, fixes } = autoFixModel(COFFEE_TEXT, MODEL)
console.log(`Applied fixes: ${fixes.length}`)
for (const f of fixes) {
  console.log(`  • [${f.category}] ${f.description}`)
  console.log(`    affected: ${f.affectedElements.join(', ')}`)
}

console.log()
console.log('=== Audit AFTER autofix ===')
const afterIssues = runDeterministicAudit(COFFEE_TEXT, fixed)
for (const i of afterIssues) {
  console.log(`  [${i.severity}] ${i.category}: ${i.message}`)
}

// Assertions
const assertions = []
function assert(cond, msg) { assertions.push({ cond: !!cond, msg }) }

assert(beforeParallelErrors === 2,
  `Expected 2 parallel-gateway errors before autofix, got ${beforeParallelErrors}`)
assert(fixes.some(f => f.category === 'gateway-type'),
  'Expected a gateway-type auto-fix')
assert(fixes.some(f => f.category === 'flow-connectivity' && f.affectedElements.includes('Coffee Ready')),
  'Expected a flow-connectivity auto-fix that drops outgoing flow from "Coffee Ready"')
assert(fixed.gateways.every(g => !(g.type ?? '').toLowerCase().includes('parallel')),
  'Expected NO parallelGateway in fixed model')
assert(fixed.flows.every(f => f.from !== 'Coffee Ready'),
  'Expected NO flows whose source is the end event "Coffee Ready"')
assert(afterIssues.filter(i => i.category === 'gateway-type').length === 0,
  'Expected zero gateway-type issues after autofix')

console.log()
console.log('=== Tighter narrative-clause filter check ===')
// Now that the filter is tightened, the false positive on "When you wake up,
// you head to the kitchen" should be gone even before the autofix runs.
const tightenedIssues = runDeterministicAudit(COFFEE_TEXT, MODEL)
const stillFalsePositive = tightenedIssues.filter(i =>
  i.category === 'missing-task' &&
  (i.affectedElements ?? []).some(e => /^when\s+you\b/i.test(e))
).length

assert(stillFalsePositive === 0,
  `Expected the "When you wake up…" narrative-clause false positive to be gone; got ${stillFalsePositive}`)

console.log()
let fail = 0
for (const a of assertions) {
  if (a.cond) {
    console.log(`✓ ${a.msg}`)
  } else {
    console.error(`✗ ${a.msg}`)
    fail++
  }
}

if (fail > 0) {
  console.error(`\n${fail} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll assertions passed.')
