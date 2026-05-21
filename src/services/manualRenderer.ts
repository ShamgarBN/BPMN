/**
 * Render the user manual to Markdown, HTML, and PDF from the same source.
 * Single source of truth = `src/docs/userManual.ts`.
 */

import jsPDF from 'jspdf'
import {
  MANUAL, MANUAL_TITLE, MANUAL_SUBTITLE, MANUAL_VERSION,
  type ManualBlock, type ManualSection, type ManualTopic,
} from '@/docs/userManual'

// ── Markdown ─────────────────────────────────────────────────────────────────

function blockToMarkdown(b: ManualBlock): string {
  switch (b.type) {
    case 'h3':
      return `### ${b.content as string}\n`
    case 'p':
      return `${b.content as string}\n`
    case 'ul':
      return (b.content as string[]).map(s => `- ${s}`).join('\n') + '\n'
    case 'ol':
      return (b.content as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n'
    case 'note':
      return `> **Note:** ${b.content as string}\n`
    case 'code':
      return '```\n' + (b.content as string) + '\n```\n'
    case 'kbd-table': {
      const rows = b.content as Array<[string, string]>
      const header = '| Shortcut | Action |\n| --- | --- |'
      const body = rows.map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')
      return header + '\n' + body + '\n'
    }
  }
}

function topicToMarkdown(t: ManualTopic): string {
  return `## ${t.title}\n\n` + t.blocks.map(blockToMarkdown).join('\n')
}

function sectionToMarkdown(s: ManualSection): string {
  return `# ${s.title}\n\n` + s.topics.map(topicToMarkdown).join('\n')
}

export function renderManualMarkdown(): string {
  const header  = `# ${MANUAL_TITLE}\n\n*${MANUAL_SUBTITLE}*\n\nVersion ${MANUAL_VERSION}\n\n---\n\n`
  const toc = '## Table of Contents\n\n' + MANUAL.map((s, i) =>
    `${i + 1}. **${s.title}**\n` +
    s.topics.map(t => `   - ${t.title}`).join('\n')
  ).join('\n') + '\n\n---\n\n'
  const body = MANUAL.map(sectionToMarkdown).join('\n---\n\n')
  return header + toc + body
}

// ── HTML ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function blockToHtml(b: ManualBlock): string {
  switch (b.type) {
    case 'h3':
      return `<h3>${escapeHtml(b.content as string)}</h3>`
    case 'p':
      return `<p>${escapeHtml(b.content as string)}</p>`
    case 'ul':
      return `<ul>${(b.content as string[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    case 'ol':
      return `<ol>${(b.content as string[]).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    case 'note':
      return `<aside class="note">${escapeHtml(b.content as string)}</aside>`
    case 'code':
      return `<pre><code>${escapeHtml(b.content as string)}</code></pre>`
    case 'kbd-table': {
      const rows = b.content as Array<[string, string]>
      return `<table class="kbd-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>${rows.map(([k, v]) =>
          `<tr><td><kbd>${escapeHtml(k)}</kbd></td><td>${escapeHtml(v)}</td></tr>`
        ).join('')}</tbody>
      </table>`
    }
  }
}

function topicToHtml(t: ManualTopic): string {
  return `<section id="topic-${t.id}">
    <h2>${escapeHtml(t.title)}</h2>
    ${t.blocks.map(blockToHtml).join('\n')}
  </section>`
}

function sectionToHtml(s: ManualSection): string {
  return `<section class="section" id="section-${s.id}">
    <h1>${escapeHtml(s.title)}</h1>
    ${s.topics.map(topicToHtml).join('\n')}
  </section>`
}

const HTML_STYLES = `
  :root {
    --primary: #2563eb;
    --dark: #111827;
    --mid: #6b7280;
    --light: #e5e7eb;
    --bg-tint: #f9fafb;
    --note-bg: #fef3c7;
    --note-border: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--dark);
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 32px;
    line-height: 1.6;
    font-size: 15px;
  }
  header.cover {
    border-bottom: 4px solid var(--primary);
    padding-bottom: 24px;
    margin-bottom: 40px;
  }
  header.cover h1 { font-size: 32px; margin: 0 0 8px; }
  header.cover p  { color: var(--mid); margin: 0; }
  nav.toc {
    background: var(--bg-tint);
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 48px;
  }
  nav.toc h2 { font-size: 16px; margin: 0 0 12px; color: var(--primary); }
  nav.toc ol { padding-left: 20px; margin: 0; }
  nav.toc li { margin: 4px 0; }
  nav.toc a { color: var(--dark); text-decoration: none; }
  nav.toc a:hover { color: var(--primary); }
  section.section { margin: 48px 0; }
  section.section h1 {
    font-size: 24px;
    color: var(--primary);
    border-bottom: 2px solid var(--light);
    padding-bottom: 8px;
    margin-bottom: 24px;
  }
  section h2 { font-size: 18px; margin: 32px 0 12px; }
  section h3 { font-size: 14px; margin: 20px 0 8px; color: var(--mid); text-transform: uppercase; letter-spacing: 0.04em; }
  p { margin: 12px 0; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
  aside.note {
    background: var(--note-bg);
    border-left: 4px solid var(--note-border);
    padding: 12px 16px;
    border-radius: 4px;
    margin: 16px 0;
    color: #78350f;
    font-size: 14px;
  }
  pre {
    background: #1f2937;
    color: #f3f4f6;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  table.kbd-table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  table.kbd-table th, table.kbd-table td {
    border-bottom: 1px solid var(--light);
    padding: 8px 12px;
    text-align: left;
  }
  table.kbd-table th { font-size: 12px; color: var(--mid); text-transform: uppercase; letter-spacing: 0.04em; }
  kbd {
    background: var(--light);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
  footer { margin-top: 64px; color: var(--mid); font-size: 12px; text-align: center; border-top: 1px solid var(--light); padding-top: 24px; }
  @media print {
    body { max-width: none; padding: 24px; }
    section.section { page-break-before: always; }
    nav.toc { page-break-after: always; }
    header.cover { page-break-after: always; }
  }
`

export function renderManualHtml(): string {
  const toc = `<nav class="toc">
    <h2>Table of Contents</h2>
    <ol>${MANUAL.map(s => `
      <li><a href="#section-${s.id}">${escapeHtml(s.title)}</a>
        <ul>${s.topics.map(t =>
          `<li><a href="#topic-${t.id}">${escapeHtml(t.title)}</a></li>`
        ).join('')}</ul>
      </li>`).join('')}
    </ol>
  </nav>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(MANUAL_TITLE)}</title>
  <style>${HTML_STYLES}</style>
</head>
<body>
  <header class="cover">
    <h1>${escapeHtml(MANUAL_TITLE)}</h1>
    <p>${escapeHtml(MANUAL_SUBTITLE)}</p>
    <p style="margin-top:8px; font-size:13px;">Version ${MANUAL_VERSION}</p>
  </header>
  ${toc}
  ${MANUAL.map(sectionToHtml).join('\n')}
  <footer>
    <p>${escapeHtml(MANUAL_TITLE)} &middot; Version ${MANUAL_VERSION} &middot; Generated by BPMN Studio</p>
  </footer>
</body>
</html>`
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const PDF_PAGE_W      = 612
const PDF_PAGE_H      = 792
const PDF_MARGIN      = 56
const PDF_CONTENT_W   = PDF_PAGE_W - 2 * PDF_MARGIN
const PDF_LINE_GAP    = 4
const COLOR_PRIMARY   = '#2563eb'
const COLOR_DARK      = '#111827'
const COLOR_MID       = '#6b7280'
const COLOR_LIGHT     = '#e5e7eb'
const COLOR_NOTE_BG   = '#fef3c7'
const COLOR_NOTE_FG   = '#78350f'
const COLOR_NOTE_BAR  = '#f59e0b'
const COLOR_CODE_BG   = '#1f2937'
const COLOR_CODE_FG   = '#f3f4f6'

interface PdfCursor { y: number }

function ensureSpace(doc: jsPDF, cursor: PdfCursor, requiredHeight: number): void {
  if (cursor.y + requiredHeight > PDF_PAGE_H - PDF_MARGIN - 20) {
    doc.addPage()
    cursor.y = PDF_MARGIN
  }
}

function drawTextWrapped(
  doc: jsPDF,
  cursor: PdfCursor,
  text: string,
  options: { size?: number; color?: string; bold?: boolean; indent?: number; lineHeight?: number } = {},
): void {
  const size       = options.size       ?? 11
  const color      = options.color      ?? COLOR_DARK
  const bold       = options.bold       ?? false
  const indent     = options.indent     ?? 0
  const lineHeight = options.lineHeight ?? size + PDF_LINE_GAP

  doc.setFontSize(size)
  doc.setTextColor(color)
  doc.setFont('helvetica', bold ? 'bold' : 'normal')

  const maxW = PDF_CONTENT_W - indent
  const lines = doc.splitTextToSize(text, maxW) as string[]

  ensureSpace(doc, cursor, lines.length * lineHeight)
  doc.text(lines, PDF_MARGIN + indent, cursor.y)
  cursor.y += lines.length * lineHeight
}

function renderBlockToPdf(doc: jsPDF, cursor: PdfCursor, b: ManualBlock): void {
  switch (b.type) {
    case 'h3':
      cursor.y += 8
      drawTextWrapped(doc, cursor, (b.content as string).toUpperCase(), {
        size: 9, color: COLOR_MID, bold: true,
      })
      cursor.y += 4
      return

    case 'p':
      drawTextWrapped(doc, cursor, b.content as string, { size: 11 })
      cursor.y += 6
      return

    case 'ul':
    case 'ol': {
      const items = b.content as string[]
      items.forEach((item, i) => {
        const bullet = b.type === 'ol' ? `${i + 1}.` : '\u2022'
        // Bullet column
        doc.setFontSize(11)
        doc.setTextColor(COLOR_PRIMARY)
        doc.setFont('helvetica', 'bold')
        ensureSpace(doc, cursor, 16)
        doc.text(bullet, PDF_MARGIN + 6, cursor.y)
        // Text column (indented)
        const startY = cursor.y
        cursor.y = startY  // drawTextWrapped uses cursor.y
        drawTextWrapped(doc, cursor, item, { size: 11, indent: 26 })
        cursor.y += 2
      })
      cursor.y += 4
      return
    }

    case 'note': {
      const text = b.content as string
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(text, PDF_CONTENT_W - 24) as string[]
      const blockH = lines.length * 14 + 16
      ensureSpace(doc, cursor, blockH + 4)

      // Background
      doc.setFillColor(COLOR_NOTE_BG)
      doc.rect(PDF_MARGIN, cursor.y - 4, PDF_CONTENT_W, blockH, 'F')
      // Left bar
      doc.setFillColor(COLOR_NOTE_BAR)
      doc.rect(PDF_MARGIN, cursor.y - 4, 3, blockH, 'F')
      // Text
      doc.setTextColor(COLOR_NOTE_FG)
      doc.setFont('helvetica', 'normal')
      doc.text(lines, PDF_MARGIN + 12, cursor.y + 8)
      cursor.y += blockH + 4
      return
    }

    case 'code': {
      const text = b.content as string
      doc.setFontSize(10)
      doc.setFont('courier', 'normal')
      const lines = doc.splitTextToSize(text, PDF_CONTENT_W - 16) as string[]
      const blockH = lines.length * 14 + 16
      ensureSpace(doc, cursor, blockH + 4)

      doc.setFillColor(COLOR_CODE_BG)
      doc.rect(PDF_MARGIN, cursor.y - 4, PDF_CONTENT_W, blockH, 'F')
      doc.setTextColor(COLOR_CODE_FG)
      doc.text(lines, PDF_MARGIN + 8, cursor.y + 10)
      cursor.y += blockH + 4
      return
    }

    case 'kbd-table': {
      const rows = b.content as Array<[string, string]>
      const colKbdW = 130
      const rowH = 18
      ensureSpace(doc, cursor, rows.length * rowH + 24)

      // Header
      doc.setFontSize(8)
      doc.setTextColor(COLOR_MID)
      doc.setFont('helvetica', 'bold')
      doc.text('SHORTCUT', PDF_MARGIN, cursor.y)
      doc.text('ACTION',   PDF_MARGIN + colKbdW, cursor.y)
      cursor.y += 6

      doc.setDrawColor(COLOR_LIGHT)
      doc.setLineWidth(0.5)
      doc.line(PDF_MARGIN, cursor.y, PDF_MARGIN + PDF_CONTENT_W, cursor.y)
      cursor.y += 8

      rows.forEach(([k, v]) => {
        ensureSpace(doc, cursor, rowH)
        doc.setFont('courier', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(COLOR_DARK)
        doc.text(k, PDF_MARGIN, cursor.y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(COLOR_DARK)
        doc.text(v, PDF_MARGIN + colKbdW, cursor.y)

        cursor.y += rowH - 6
        doc.setDrawColor(COLOR_LIGHT)
        doc.line(PDF_MARGIN, cursor.y, PDF_MARGIN + PDF_CONTENT_W, cursor.y)
        cursor.y += 8
      })
      cursor.y += 4
      return
    }
  }
}

function renderTopicToPdf(doc: jsPDF, cursor: PdfCursor, t: ManualTopic): void {
  ensureSpace(doc, cursor, 32)
  cursor.y += 12
  drawTextWrapped(doc, cursor, t.title, { size: 16, bold: true })
  cursor.y += 4
  t.blocks.forEach(b => renderBlockToPdf(doc, cursor, b))
}

function renderSectionToPdf(doc: jsPDF, cursor: PdfCursor, s: ManualSection): void {
  doc.addPage()
  cursor.y = PDF_MARGIN

  // Section header
  doc.setFillColor(COLOR_PRIMARY)
  doc.rect(PDF_MARGIN, cursor.y - 30, 48, 4, 'F')
  drawTextWrapped(doc, cursor, s.title, { size: 22, bold: true, color: COLOR_DARK })
  cursor.y += 8

  s.topics.forEach(t => renderTopicToPdf(doc, cursor, t))
}

function renderCoverToPdf(doc: jsPDF): void {
  doc.setFillColor(COLOR_PRIMARY)
  doc.rect(0, 0, PDF_PAGE_W, 6, 'F')

  doc.setFontSize(11)
  doc.setTextColor(COLOR_MID)
  doc.setFont('helvetica', 'normal')
  doc.text('USER MANUAL', PDF_MARGIN, PDF_MARGIN + 24)

  doc.setFontSize(36)
  doc.setTextColor(COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(MANUAL_TITLE, PDF_MARGIN, PDF_MARGIN + 80)

  doc.setFontSize(14)
  doc.setTextColor(COLOR_MID)
  doc.setFont('helvetica', 'normal')
  const subtitleLines = doc.splitTextToSize(MANUAL_SUBTITLE, PDF_CONTENT_W) as string[]
  doc.text(subtitleLines, PDF_MARGIN, PDF_MARGIN + 110)

  doc.setFontSize(11)
  doc.setTextColor(COLOR_MID)
  doc.text(`Version ${MANUAL_VERSION}`, PDF_MARGIN, PDF_PAGE_H - 80)
}

function renderTocToPdf(doc: jsPDF): void {
  doc.addPage()
  const cursor: PdfCursor = { y: PDF_MARGIN }

  drawTextWrapped(doc, cursor, 'Contents', { size: 24, bold: true, color: COLOR_PRIMARY })
  cursor.y += 12

  MANUAL.forEach((s, i) => {
    ensureSpace(doc, cursor, 24 + s.topics.length * 16)
    doc.setFontSize(13)
    doc.setTextColor(COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(`${i + 1}. ${s.title}`, PDF_MARGIN, cursor.y)
    cursor.y += 18

    s.topics.forEach(t => {
      doc.setFontSize(10)
      doc.setTextColor(COLOR_MID)
      doc.setFont('helvetica', 'normal')
      doc.text(t.title, PDF_MARGIN + 16, cursor.y)
      cursor.y += 14
    })
    cursor.y += 6
  })
}

function addManualFooters(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    if (i === 1) continue // skip cover
    doc.setFontSize(8)
    doc.setTextColor(COLOR_MID)
    doc.setFont('helvetica', 'normal')
    doc.text(MANUAL_TITLE, PDF_MARGIN, PDF_PAGE_H - 24)
    doc.text(`Page ${i} of ${totalPages}`, PDF_PAGE_W - PDF_MARGIN, PDF_PAGE_H - 24, { align: 'right' })
  }
}

export async function renderManualPdf(): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })

  renderCoverToPdf(doc)
  renderTocToPdf(doc)
  const cursor: PdfCursor = { y: PDF_MARGIN }
  MANUAL.forEach(s => renderSectionToPdf(doc, cursor, s))
  addManualFooters(doc)

  return doc.output('blob')
}
