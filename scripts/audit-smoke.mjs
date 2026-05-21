// Smoke test: deterministic audit against the coffee scenario.
//
// Synthesizes the exact "wrong" model that the AI produced for the coffee
// prompt (parallel gateway used for the water-reservoir XOR check, plus
// "Coffee Maker" treated as a participant) and verifies the deterministic
// audit catches both issues without needing the LLM.
//
// Run with:  node --experimental-strip-types scripts/audit-smoke.mjs
import { runDeterministicAudit } from '../src/services/auditChecks.ts'

const ORIGINAL_TEXT = `When you wake up and want coffee, you head to the kitchen and check the coffee maker. First, you need to see if there are enough coffee beans in the container. If you're out of beans, you grab a new bag from the pantry and refill it before moving on. Otherwise, you go straight to the next step. Then you check the water reservoir — if it's low, you fill it up with fresh water; if it's already full, you skip that and go right to brewing. You add a filter, scoop in the grounds, and hit the start button. Once the coffee finishes brewing, you pour it into your favorite mug, add cream and sugar to taste, and enjoy your morning cup.`

const BUGGY_MODEL = {
  processName: 'Morning Coffee Routine',
  processDescription: 'Make morning coffee.',
  participants: [
    { name: 'You' },
    { name: 'Coffee Maker' },     // ← OBJECT used as participant
  ],
  startEvent: { name: 'Wake Up and Want Coffee', type: 'none' },
  tasks: [
    { name: 'Check Coffee Beans',  participantName: 'You',          type: 'userTask' },
    { name: 'Refill Coffee Beans', participantName: 'You',          type: 'userTask' },
    { name: 'Check Water Reservoir', participantName: 'You',        type: 'userTask' },
    { name: 'Fill Water Reservoir',  participantName: 'You',        type: 'userTask' },
    { name: 'Brew Coffee',         participantName: 'Coffee Maker', type: 'userTask' }, // ← bundled summary task
    { name: 'Pour Coffee into Mug', participantName: 'You',         type: 'userTask' },
  ],
  gateways: [
    { name: 'Are There Enough Beans?', type: 'exclusiveGateway' },
    { name: 'AND Split',               type: 'parallelGateway' },   // ← WRONG type (should be XOR)
    { name: 'AND Join',                type: 'parallelGateway' },
  ],
  flows: [
    { from: 'Wake Up and Want Coffee',  to: 'Check Coffee Beans',     label: '' },
    { from: 'Check Coffee Beans',       to: 'Are There Enough Beans?', label: '' },
    { from: 'Are There Enough Beans?',  to: 'Refill Coffee Beans',    label: 'No' },
    { from: 'Refill Coffee Beans',      to: 'Check Water Reservoir',  label: '' },
    { from: 'Are There Enough Beans?',  to: 'Check Water Reservoir',  label: 'Yes' },
    { from: 'Check Water Reservoir',    to: 'AND Split',              label: '' },
    { from: 'AND Split',                to: 'Fill Water Reservoir',   label: '' },
    { from: 'AND Split',                to: 'AND Join',               label: '' },
    { from: 'Fill Water Reservoir',     to: 'AND Join',               label: '' },
    { from: 'AND Join',                 to: 'Brew Coffee',            label: '' },
    { from: 'Brew Coffee',              to: 'Pour Coffee into Mug',   label: '' },
    { from: 'Pour Coffee into Mug',     to: 'Enjoy Morning Cup',      label: '' },
  ],
  endEvents: [{ name: 'Enjoy Morning Cup' }],
}

const issues = runDeterministicAudit(ORIGINAL_TEXT, BUGGY_MODEL)

console.log(`\nDeterministic audit found ${issues.length} issue(s):\n`)
for (const i of issues) {
  console.log(`  [${i.severity.toUpperCase().padEnd(7)}] ${i.category.padEnd(20)} ${i.message}`)
  if (i.suggestion) console.log(`     → ${i.suggestion}`)
  if (i.affectedElements?.length) console.log(`     elements: ${i.affectedElements.join(', ')}`)
  console.log()
}

// ── Assertions ─────────────────────────────────────────────────────────────
const summary = {
  parallelFlagged:    issues.some(i => i.category === 'gateway-type'      && i.affectedElements?.includes('AND Split')),
  coffeeMakerFlagged: issues.some(i => i.category === 'participant-actor' && i.affectedElements?.includes('Coffee Maker')),
  bundledFlagged:     issues.some(i => i.category === 'bundled-tasks'     && i.affectedElements?.includes('Brew Coffee')),
}

console.log('Expected findings:')
console.log(`  ✔ Parallel gateway flagged:  ${summary.parallelFlagged    ? 'YES' : 'no  ←  REGRESSION'}`)
console.log(`  ✔ Coffee Maker flagged:      ${summary.coffeeMakerFlagged ? 'YES' : 'no  ←  REGRESSION'}`)
console.log(`  ✔ Brew Coffee bundled flag:  ${summary.bundledFlagged     ? 'YES' : 'no  (expected — needs a comma-and list it overlaps with)'}`)

const ok = summary.parallelFlagged && summary.coffeeMakerFlagged
process.exit(ok ? 0 : 1)
