// Smoke test: report formatters (text + markdown) produce non-empty output
// with all expected sections present.
//
// Run with:  node --experimental-strip-types scripts/audit-format-smoke.mjs
import {
  formatAuditReportText,
  formatAuditReportMarkdown,
} from '../src/services/auditFormatters.ts'

const REPORT = {
  issues: [
    {
      severity: 'error',
      category: 'gateway-type',
      message: 'Gateway "AND Split" is parallel but the source has no parallelism phrase.',
      suggestion: 'Change to exclusiveGateway.',
      affectedElements: ['AND Split'],
      source: 'deterministic',
    },
    {
      severity: 'warning',
      category: 'bundled-tasks',
      message: 'Task "Brew Coffee" looks like a summary task.',
      suggestion: 'Split into discrete tasks.',
      affectedElements: ['Brew Coffee'],
      source: 'llm',
    },
    {
      severity: 'info',
      category: 'name-clarity',
      message: 'Task "Step 1" is too vague.',
      affectedElements: ['Step 1'],
      source: 'llm',
    },
  ],
  llmRan: true,
  llmFailed: false,
  summary: '1 error, 1 warning, 1 suggestion found.',
  originalText: 'Make some coffee. If beans are out, refill. Then brew coffee.',
  processName: 'Morning Coffee Routine',
  generatedAt: '2026-05-08T13:59:00.000Z',
  modelUsed: 'llama3.1:8b',
  appliedFixes: [
    {
      category: 'gateway-type',
      description: '1 parallel gateway flipped to exclusive — no parallelism phrase in description.',
      affectedElements: ['Decision'],
    },
    {
      category: 'flow-connectivity',
      description: 'Removed 1 illegal outgoing flow from end event — BPMN end events have no outgoing flows.',
      affectedElements: ['Coffee Ready'],
    },
  ],
}

const text = formatAuditReportText(REPORT)
const md   = formatAuditReportMarkdown(REPORT)

console.log('────── PLAIN TEXT ──────')
console.log(text)
console.log('────── MARKDOWN ──────')
console.log(md)

const checks = [
  ['Text has title',           text.includes('BPMN Studio — Diagram Quality Audit')],
  ['Text has process name',    text.includes('Morning Coffee Routine')],
  ['Text has model id',        text.includes('llama3.1:8b')],
  ['Text has original prompt', text.includes('Make some coffee')],
  ['Text has all 3 issues',    text.includes('#1') && text.includes('#2') && text.includes('#3')],
  ['Text has suggested fix',   text.includes('Suggested fix:')],
  ['Text has affected line',   text.includes('Affected:')],
  ['MD has h1',                md.includes('# BPMN Studio')],
  ['MD has issue heading',     md.includes('### 1.')],
  ['MD has bold suggestion',   md.includes('**Suggested fix:**')],
  ['MD has backtick element',  md.includes('`AND Split`')],
  // Auto-corrections must NOT appear in the export — they're part of the
  // render pipeline, not user-facing findings.
  ['Text omits fix section',   !text.includes('Auto-corrections')],
  ['Text omits fix description', !text.includes('parallel gateway flipped')],
  ['MD omits fix section',     !md.includes('## Auto-corrections')],
]

console.log('Format-output checks:')
let allOk = true
for (const [label, ok] of checks) {
  console.log(`  ${ok ? '✔' : '✗'} ${label}`)
  if (!ok) allOk = false
}
process.exit(allOk ? 0 : 1)
