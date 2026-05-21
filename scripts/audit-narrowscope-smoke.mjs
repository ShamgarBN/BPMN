// Smoke test: verify runFullAudit drops gateway-type and flow-connectivity
// findings from BOTH the deterministic and (simulated) LLM passes, while
// keeping description-level gaps (participant-actor, missing-task, bundled,
// name-clarity).
//
// Reproduces the user's purchase-order audit screenshot scenario:
// 13 errors + 3 warnings, mostly gateway-type and flow-connectivity, that
// should be filtered out and never reach the user.
//
// Run with:  node --experimental-strip-types scripts/audit-narrowscope-smoke.mjs

// We can't easily import auditService directly because it depends on
// ollamaService which uses fetch.  Instead we re-implement the filter+merge
// step here (mirror of the production code) and run it against synthetic
// issues.  This is purely a behavioural test of the policy: does the audit
// pipeline drop render-pipeline categories?

import { runDeterministicAudit } from '../src/services/auditChecks.ts'

const PURCHASE_ORDER_TEXT = `When an employee needs to purchase something for work — say, software, equipment, or services — they start by creating a purchase request in the procurement system, including vendor info, item details, cost, and business justification. The system routes the request based on the dollar amount. If it's under $5,000, only the direct manager needs to approve. If it's between $5,000 and $25,000, both the manager and the department director must approve. Anything over $25,000 also requires Finance and the VP to sign off. Once all approvals are in, the procurement team reviews the request to verify the vendor is approved and compliant — if the vendor isn't in the system, procurement runs a vendor onboarding and risk assessment first. After vendor verification, procurement issues the purchase order to the vendor. The vendor delivers the goods or services, and the employee confirms receipt in the system. Finally, Accounts Payable matches the invoice against the PO and receipt, then processes payment per the agreed terms.`

const FIXED_MODEL = {
  processName: 'Purchase Request',
  processDescription: 'Purchase request workflow.',
  participants: [
    { name: 'Employee' },
    { name: 'Manager' },
    { name: 'Director' },
    { name: 'Finance' },
    { name: 'VP' },
    { name: 'Procurement' },
    { name: 'Vendor' },
    { name: 'Accounts Payable' },
    { name: 'Purchase Request' },  // Object-as-actor - SHOULD be flagged
  ],
  startEvent: { name: 'Employee Needs Item', type: 'startEvent' },
  tasks: [
    { name: 'Create Purchase Request',  participantName: 'Employee'        },
    { name: 'Manager Approve',          participantName: 'Manager'         },
    { name: 'Director Approve',         participantName: 'Director'        },
    { name: 'Finance Approve',          participantName: 'Finance'         },
    { name: 'VP Approve',               participantName: 'VP'              },
    { name: 'Process Purchase Order',   participantName: 'Procurement'     }, // Bundled summary task
    { name: 'Issue PO',                 participantName: 'Procurement'     },
    { name: 'Confirm Receipt',          participantName: 'Employee'        },
    { name: 'Match Invoice and PO',     participantName: 'Accounts Payable'},
    { name: 'Process Payment',          participantName: 'Accounts Payable'},
    { name: 'Vendor Onboarding and Risk Assessment', participantName: 'Procurement' },
    { name: 'Step 1',                   participantName: 'Employee'        }, // Vague - SHOULD be flagged
  ],
  gateways: [
    { name: 'Approval Threshold', type: 'exclusiveGateway' }, // already flipped by autoFix
  ],
  flows: [
    { from: 'Employee Needs Item',           to: 'Create Purchase Request' },
    { from: 'Create Purchase Request',       to: 'Approval Threshold' },
    { from: 'Approval Threshold',            to: 'Manager Approve',         label: 'Under $5K' },
    { from: 'Approval Threshold',            to: 'Director Approve',        label: '$5K-$25K' },
    { from: 'Approval Threshold',            to: 'VP Approve',              label: 'Over $25K' },
    { from: 'Manager Approve',               to: 'Process Purchase Order' },
    { from: 'Director Approve',              to: 'Process Purchase Order' },
    { from: 'VP Approve',                    to: 'Process Purchase Order' },
    { from: 'Process Purchase Order',        to: 'Issue PO' },
    { from: 'Issue PO',                      to: 'Confirm Receipt' },
    { from: 'Confirm Receipt',               to: 'Match Invoice and PO' },
    { from: 'Match Invoice and PO',          to: 'Process Payment' },
    { from: 'Process Payment',               to: 'Payment Processed' },
    // Vendor Onboarding orphaned (no flows) — this is a flow-connectivity issue
    // that the audit should NOT surface (rendering pipeline territory).
    // Step 1 also orphan — flow-connectivity, should NOT surface either.
  ],
  endEvents: [
    { name: 'Payment Processed', type: 'endEvent' },
  ],
}

// Synthesised LLM issues that mirror what the user actually saw in the
// screenshot — many gateway-type and flow-connectivity errors that should
// all be dropped, plus a couple of legitimate description-level findings
// that should survive.
const SYNTHESISED_LLM_ISSUES = [
  // These all SHOULD be dropped.
  { severity: 'error', category: 'gateway-type', message: "The text 'If it's under $5,000...' suggests an exclusiveGateway, but the model uses a parallelGateway.", affectedElements: ['Approval Threshold'], source: 'llm' },
  { severity: 'error', category: 'gateway-type', message: "The text 'Anything over $25,000 also requires...' suggests an exclusiveGateway, but the model uses a parallelGateway.", affectedElements: ['Approval Threshold'], source: 'llm' },
  { severity: 'error', category: 'flow-connectivity', message: "The task 'Vendor Onboarding and Risk Assessment' has no incoming flows.", affectedElements: ['Vendor Onboarding and Risk Assessment'], source: 'llm' },
  { severity: 'error', category: 'flow-connectivity', message: "The end event 'Purchase Request Approved' has no outgoing flows, but it should have one to the next step in the process.", affectedElements: ['Purchase Request Approved'], source: 'llm' },
  { severity: 'error', category: 'flow-connectivity', message: "The task 'Match Invoice against PO and Receipt' has no incoming flows, but it should have one from the previous step in the process.", affectedElements: ['Match Invoice and PO'], source: 'llm' },
  { severity: 'error', category: 'flow-connectivity', message: "The end event 'Payment Processed' has no outgoing flows, but it should have one to the next step in the process.", affectedElements: ['Payment Processed'], source: 'llm' },

  // These SHOULD survive.
  { severity: 'error',   category: 'participant-actor', message: 'Participant "Purchase Request" looks like a document, not a person/role/team.', affectedElements: ['Purchase Request'], source: 'llm' },
  { severity: 'warning', category: 'bundled-tasks',    message: 'Task "Process Purchase Order" looks like a summary task that bundles multiple actions.', affectedElements: ['Process Purchase Order'], source: 'llm' },
  { severity: 'info',    category: 'name-clarity',     message: 'Task "Step 1" is too vague — pick a name that describes what the user does.', affectedElements: ['Step 1'], source: 'llm' },
]

// Mirror of the production filter+merge logic from runFullAudit, so we can
// test the policy in isolation without spinning up Ollama.
function combineAndFilter(originalText, model, llmIssues) {
  const deterministic = runDeterministicAudit(originalText, model)
  const merged = [...llmIssues, ...deterministic]
  const byKey = new Map()
  for (const i of merged) {
    const elementsKey = (i.affectedElements ?? [])
      .map(e => e.trim().toLowerCase()).sort().join('|')
    const key = `${i.category}::${elementsKey}`
    const existing = byKey.get(key)
    if (!existing) { byKey.set(key, i); continue }
    if (existing.source === 'deterministic' && i.source === 'llm') byKey.set(key, i)
  }
  const HIDDEN = new Set(['gateway-type', 'flow-connectivity'])
  return Array.from(byKey.values()).filter(i => !HIDDEN.has(i.category))
}

console.log('=== Synthesised LLM findings (input) ===')
for (const i of SYNTHESISED_LLM_ISSUES) {
  console.log(`  [${i.severity}] ${i.category}: ${i.message}`)
}
console.log()
console.log('=== Deterministic findings (input) ===')
for (const i of runDeterministicAudit(PURCHASE_ORDER_TEXT, FIXED_MODEL)) {
  console.log(`  [${i.severity}] ${i.category}: ${i.message}`)
}

const visible = combineAndFilter(PURCHASE_ORDER_TEXT, FIXED_MODEL, SYNTHESISED_LLM_ISSUES)

console.log()
console.log('=== Audit issues SURFACED to user (after filter) ===')
for (const i of visible) {
  console.log(`  [${i.severity}] ${i.category} (${i.source}): ${i.message}`)
}

const assertions = []
function assert(cond, msg) { assertions.push({ cond: !!cond, msg }) }

const visibleCategories = new Set(visible.map(i => i.category))

assert(!visibleCategories.has('gateway-type'),
  'gateway-type findings must NOT reach the user')
assert(!visibleCategories.has('flow-connectivity'),
  'flow-connectivity findings must NOT reach the user')
assert(visible.some(i => i.category === 'participant-actor' && i.affectedElements?.[0] === 'Purchase Request'),
  'object-as-actor finding ("Purchase Request") MUST survive')
assert(visible.some(i => i.category === 'bundled-tasks' && i.affectedElements?.[0] === 'Process Purchase Order'),
  'bundled-tasks finding ("Process Purchase Order") MUST survive')
assert(visible.some(i => i.category === 'name-clarity' && i.affectedElements?.[0] === 'Step 1'),
  'name-clarity finding ("Step 1") MUST survive')

const errorsBefore = SYNTHESISED_LLM_ISSUES.filter(i => i.severity === 'error').length
const errorsAfter  = visible.filter(i => i.severity === 'error').length
assert(errorsBefore >= 6 && errorsAfter <= 2,
  `Should drop the bulk of "errors": before=${errorsBefore}, after=${errorsAfter}`)

console.log()
let fail = 0
for (const a of assertions) {
  if (a.cond) console.log(`✓ ${a.msg}`)
  else { console.error(`✗ ${a.msg}`); fail++ }
}
if (fail > 0) {
  console.error(`\n${fail} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll assertions passed.')
