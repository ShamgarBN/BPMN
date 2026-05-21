/**
 * Pure formatters for the AuditReport — plain text and Markdown.
 *
 * Kept dependency-free (no LLM, no I/O) so they can be invoked from any
 * environment, including smoke tests that need to bypass the Ollama import
 * chain.  auditService.ts re-exports these symbols for convenience.
 */

import type { AuditIssue, AuditSeverity, AuditCategory } from './auditChecks'

// Local copy of the report shape — duplicated so this file has no runtime
// dependency on auditService.  auditService's AuditReport is structurally
// compatible with this interface.
//
// Note: we deliberately do NOT serialize `appliedFixes` here — auto-corrections
// are part of the render pipeline, not user-facing findings, so they stay
// out of the export.
export interface FormattableAuditReport {
  issues: AuditIssue[]
  llmRan?: boolean
  llmFailed?: boolean
  summary: string
  originalText?: string
  processName?: string
  generatedAt?: string
  modelUsed?: string
}

const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  error:   'ERROR',
  warning: 'WARNING',
  info:    'INFO',
}

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  'gateway-type':       'Decision type',
  'participant-actor':  'Participant',
  'missing-task':       'Missing task',
  'bundled-tasks':      'Bundled tasks',
  'flow-connectivity':  'Flow connectivity',
  'name-clarity':       'Naming',
  'other':              'Other',
}

function formatTimestamp(iso?: string): string {
  if (!iso) return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function formatAuditReportText(report: FormattableAuditReport): string {
  const lines: string[] = []
  lines.push('BPMN Studio — Diagram Quality Audit')
  lines.push('=====================================')
  lines.push(`Generated:    ${formatTimestamp(report.generatedAt)}`)
  if (report.processName) lines.push(`Process:      ${report.processName}`)
  if (report.modelUsed)   lines.push(`AI model:     ${report.modelUsed}`)
  lines.push(`AI audit:     ${report.llmRan ? (report.llmFailed ? 'attempted (failed)' : 'completed') : 'skipped (no model)'}`)
  lines.push(`Summary:      ${report.summary}`)
  lines.push('')

  if (report.originalText) {
    lines.push('Original description')
    lines.push('--------------------')
    lines.push(report.originalText.trim())
    lines.push('')
  }

  if (!report.issues.length) {
    lines.push('No issues found.')
    return lines.join('\n').trimEnd() + '\n'
  }

  const counts = { error: 0, warning: 0, info: 0 }
  for (const i of report.issues) counts[i.severity]++
  lines.push(`Issues (${report.issues.length})`)
  lines.push(`  ${counts.error} error${counts.error === 1 ? '' : 's'}, ` +
             `${counts.warning} warning${counts.warning === 1 ? '' : 's'}, ` +
             `${counts.info} suggestion${counts.info === 1 ? '' : 's'}`)
  lines.push('')

  let n = 0
  for (const issue of report.issues) {
    n++
    const sev = SEVERITY_LABEL[issue.severity]
    const cat = CATEGORY_LABEL[issue.category]
    const src = issue.source === 'llm' ? 'AI' : 'Rule'
    lines.push(`#${n}  [${sev}]  ${cat}  (${src})`)
    lines.push(`    ${issue.message}`)
    if (issue.suggestion) {
      lines.push(`    Suggested fix: ${issue.suggestion}`)
    }
    if (issue.affectedElements && issue.affectedElements.length > 0) {
      lines.push(`    Affected: ${issue.affectedElements.join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function formatAuditReportMarkdown(report: FormattableAuditReport): string {
  const lines: string[] = []
  lines.push('# BPMN Studio — Diagram Quality Audit')
  lines.push('')
  lines.push(`- **Generated:** ${formatTimestamp(report.generatedAt)}`)
  if (report.processName) lines.push(`- **Process:** ${report.processName}`)
  if (report.modelUsed)   lines.push(`- **AI model:** \`${report.modelUsed}\``)
  lines.push(`- **AI audit:** ${report.llmRan ? (report.llmFailed ? 'attempted (failed)' : 'completed') : 'skipped (no model)'}`)
  lines.push(`- **Summary:** ${report.summary}`)
  lines.push('')

  if (report.originalText) {
    lines.push('## Original description')
    lines.push('')
    lines.push('> ' + report.originalText.trim().split('\n').join('\n> '))
    lines.push('')
  }

  if (!report.issues.length) {
    lines.push('_No issues found._')
    return lines.join('\n') + '\n'
  }

  const counts = { error: 0, warning: 0, info: 0 }
  for (const i of report.issues) counts[i.severity]++
  lines.push(`## Issues (${report.issues.length})`)
  lines.push('')
  lines.push(`${counts.error} error${counts.error === 1 ? '' : 's'}, ` +
             `${counts.warning} warning${counts.warning === 1 ? '' : 's'}, ` +
             `${counts.info} suggestion${counts.info === 1 ? '' : 's'}.`)
  lines.push('')

  let n = 0
  for (const issue of report.issues) {
    n++
    const sev = SEVERITY_LABEL[issue.severity]
    const cat = CATEGORY_LABEL[issue.category]
    const src = issue.source === 'llm' ? 'AI' : 'Rule'
    lines.push(`### ${n}. [${sev}] ${cat} (${src})`)
    lines.push('')
    lines.push(issue.message)
    lines.push('')
    if (issue.suggestion) {
      lines.push(`**Suggested fix:** ${issue.suggestion}`)
      lines.push('')
    }
    if (issue.affectedElements && issue.affectedElements.length > 0) {
      lines.push(`**Affected elements:** ${issue.affectedElements.map(e => `\`${e}\``).join(', ')}`)
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
