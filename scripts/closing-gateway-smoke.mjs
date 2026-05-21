// Sanity check for the closing-gateway insertion rule.
//
// Three scenarios:
//   A. AND-split with both branches converging back into a task
//      → must insert a parallelGateway join.
//   B. XOR-split with both branches converging into the same end event
//      → must insert an exclusiveGateway merge.
//   C. Two unrelated paths converging into a task (no shared split ancestor)
//      → defaults to exclusiveGateway.

import {
  insertClosingGatewaysBeforeConvergence,
} from '../src/services/gatewayRepairService.ts'

function runScenario(label, { tasks, gateways, endEvents, flows }) {
  console.log(`── ${label} ──`)
  const result = insertClosingGatewaysBeforeConvergence(tasks, gateways, endEvents, flows)

  const newGateways = result.gateways.filter(g => !gateways.some(o => o.id === g.id))
  for (const g of newGateways) {
    console.log(`  + inserted ${g.type}  (id=${g.id})`)
  }

  // Verify no task or end event still has 2+ incoming flows
  let stillBroken = 0
  for (const t of tasks) {
    const inc = result.flows.filter(f => f.targetId === t.id).length
    if (inc >= 2) {
      console.log(`  ✗ Task "${t.name}" still has ${inc} incoming flows`)
      stillBroken++
    }
  }
  for (const e of endEvents) {
    const inc = result.flows.filter(f => f.targetId === e.id).length
    if (inc >= 2) {
      console.log(`  ✗ EndEvent "${e.name}" still has ${inc} incoming flows`)
      stillBroken++
    }
  }
  console.log(`  ${stillBroken === 0 ? '✓' : '✗'} ${stillBroken} unresolved convergence sites`)
  console.log()
  return { newGateways, stillBroken }
}

// ── Scenario A — AND-split converging on a task ───────────────────────────────
const A = runScenario('A. AND-split → AND-join (parallel)', {
  tasks: [
    { id: 'Begin',   name: 'Begin',   type: 'userTask', participantId: 'L1', description: '' },
    { id: 'BranchA', name: 'BranchA', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'BranchB', name: 'BranchB', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'Combine', name: 'Combine', type: 'userTask', participantId: 'L1', description: '' },
  ],
  gateways: [
    { id: 'Fork', name: 'Fork', type: 'parallelGateway' },
  ],
  endEvents: [{ id: 'Done', name: 'Done', type: 'none' }],
  flows: [
    { id: 'F1', sourceId: 'Begin',   targetId: 'Fork',    label: '' },
    { id: 'F2', sourceId: 'Fork',    targetId: 'BranchA', label: '' },
    { id: 'F3', sourceId: 'Fork',    targetId: 'BranchB', label: '' },
    { id: 'F4', sourceId: 'BranchA', targetId: 'Combine', label: '' },
    { id: 'F5', sourceId: 'BranchB', targetId: 'Combine', label: '' },
    { id: 'F6', sourceId: 'Combine', targetId: 'Done',    label: '' },
  ],
})

// ── Scenario B — XOR-split converging on an end event ────────────────────────
const B = runScenario('B. XOR-split → XOR-merge (exclusive)', {
  tasks: [
    { id: 'Review',  name: 'Review',  type: 'userTask', participantId: 'L1', description: '' },
    { id: 'Approve', name: 'Approve', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'Reject',  name: 'Reject',  type: 'userTask', participantId: 'L1', description: '' },
  ],
  gateways: [
    { id: 'Decision', name: 'Approved?', type: 'exclusiveGateway' },
  ],
  endEvents: [{ id: 'Done', name: 'Done', type: 'none' }],
  flows: [
    { id: 'F1', sourceId: 'Review',   targetId: 'Decision', label: '' },
    { id: 'F2', sourceId: 'Decision', targetId: 'Approve',  label: 'yes' },
    { id: 'F3', sourceId: 'Decision', targetId: 'Reject',   label: 'no' },
    { id: 'F4', sourceId: 'Approve',  targetId: 'Done',     label: '' },
    { id: 'F5', sourceId: 'Reject',   targetId: 'Done',     label: '' },
  ],
})

// ── Scenario C — two unrelated paths converging on a task ────────────────────
const C = runScenario('C. Mixed/unrelated splits → default XOR-merge', {
  tasks: [
    { id: 'P1', name: 'P1', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'P2', name: 'P2', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'PA', name: 'PA', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'PB', name: 'PB', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'PC', name: 'PC', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'PD', name: 'PD', type: 'userTask', participantId: 'L1', description: '' },
    { id: 'Combine', name: 'Combine', type: 'userTask', participantId: 'L1', description: '' },
  ],
  gateways: [
    { id: 'Split1', name: 'Path?', type: 'exclusiveGateway' },
    { id: 'Split2', name: 'Both',  type: 'parallelGateway' },
  ],
  endEvents: [{ id: 'Done', name: 'Done', type: 'none' }],
  flows: [
    { id: 'F1',  sourceId: 'P1',     targetId: 'Split1',  label: '' },
    { id: 'F2',  sourceId: 'Split1', targetId: 'PA',      label: '' },
    { id: 'F3',  sourceId: 'Split1', targetId: 'PB',      label: '' },
    { id: 'F4',  sourceId: 'PA',     targetId: 'P2',      label: '' },
    { id: 'F5',  sourceId: 'PB',     targetId: 'P2',      label: '' },
    { id: 'F6',  sourceId: 'P2',     targetId: 'Split2',  label: '' },
    { id: 'F7',  sourceId: 'Split2', targetId: 'PC',      label: '' },
    { id: 'F8',  sourceId: 'Split2', targetId: 'PD',      label: '' },
    { id: 'F9',  sourceId: 'PC',     targetId: 'Combine', label: '' },
    { id: 'F10', sourceId: 'PD',     targetId: 'Combine', label: '' },
    { id: 'F11', sourceId: 'Combine', targetId: 'Done',   label: '' },
  ],
})

// ── Assertions ────────────────────────────────────────────────────────────────
let pass = true

const aTypes = A.newGateways.map(g => g.type)
if (!(aTypes.length === 1 && aTypes[0] === 'parallelGateway')) {
  console.log(`A FAIL: expected one parallelGateway, got ${JSON.stringify(aTypes)}`)
  pass = false
}

const bTypes = B.newGateways.map(g => g.type)
if (!(bTypes.length === 1 && bTypes[0] === 'exclusiveGateway')) {
  console.log(`B FAIL: expected one exclusiveGateway, got ${JSON.stringify(bTypes)}`)
  pass = false
}

const cTypes = C.newGateways.map(g => g.type)
// Scenario C has two convergence sites: P2 (mixed exclusive split origin),
// and Combine (parallel split). Both should be inserted; Combine should be
// parallelGateway, P2 should be exclusiveGateway.
const hasParallelForCombine = cTypes.includes('parallelGateway')
const hasExclusiveForP2     = cTypes.filter(t => t === 'exclusiveGateway').length >= 1
if (!(hasParallelForCombine && hasExclusiveForP2 && cTypes.length === 2)) {
  console.log(`C FAIL: expected one parallel + one exclusive, got ${JSON.stringify(cTypes)}`)
  pass = false
}

if (A.stillBroken !== 0 || B.stillBroken !== 0 || C.stillBroken !== 0) {
  console.log('FAIL: at least one scenario still has unresolved convergence')
  pass = false
}

console.log(pass ? '✓ all checks passed' : '✗ failures detected')
process.exit(pass ? 0 : 1)
