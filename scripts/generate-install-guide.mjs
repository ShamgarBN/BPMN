/**
 * Generates BPMN_Studio_Installation_Guide.pdf — an end-user install walkthrough
 * intended to be sent to colleagues alongside the .dmg / .exe installers.
 *
 * Run with: node scripts/generate-install-guide.mjs
 *
 * Output: release/<version>/BPMN_Studio_Installation_Guide.pdf
 */

import { jsPDF } from 'jspdf'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const ROOT       = path.resolve(__dirname, '..')

// ── Read version from package.json ──────────────────────────────────────────
const pkgRaw = await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')
const pkg    = JSON.parse(pkgRaw)
const VERSION = pkg.version

// ── Layout constants ────────────────────────────────────────────────────────
const PAGE_W      = 612                      // US Letter, 8.5"
const PAGE_H      = 792                      // US Letter, 11"
const MARGIN      = 54
const CONTENT_W   = PAGE_W - 2 * MARGIN
const COLOR_PRIMARY = '#2563eb'
const COLOR_DARK    = '#111827'
const COLOR_MID     = '#6b7280'
const COLOR_LIGHT   = '#e5e7eb'
const COLOR_NOTE_BG = '#fef3c7'
const COLOR_NOTE_FG = '#78350f'
const COLOR_NOTE_BAR = '#f59e0b'
const COLOR_OK_BG   = '#dcfce7'
const COLOR_OK_FG   = '#14532d'
const COLOR_OK_BAR  = '#22c55e'

const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })

// ── Helpers ─────────────────────────────────────────────────────────────────
const cursor = { y: MARGIN }

function nextPage() {
  doc.addPage()
  cursor.y = MARGIN
}

function ensureSpace(h) {
  if (cursor.y + h > PAGE_H - MARGIN - 20) nextPage()
}

function setText(opts) {
  doc.setFontSize(opts.size ?? 11)
  doc.setTextColor(opts.color ?? COLOR_DARK)
  doc.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : (opts.italic ? 'italic' : 'normal'))
}

function writeLine(text, opts = {}) {
  setText(opts)
  const indent = opts.indent ?? 0
  const lh     = opts.lineHeight ?? (opts.size ?? 11) + 4
  const lines = doc.splitTextToSize(text, CONTENT_W - indent)
  ensureSpace(lines.length * lh)
  doc.text(lines, MARGIN + indent, cursor.y)
  cursor.y += lines.length * lh
}

function spacer(h = 8) { cursor.y += h }

function divider() {
  ensureSpace(8)
  doc.setDrawColor(COLOR_LIGHT)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, cursor.y, MARGIN + CONTENT_W, cursor.y)
  cursor.y += 14
}

function sectionHeading(text) {
  spacer(12)
  ensureSpace(40)
  // Accent bar
  doc.setFillColor(COLOR_PRIMARY)
  doc.rect(MARGIN, cursor.y - 12, 28, 3, 'F')
  writeLine(text, { size: 18, bold: true, color: COLOR_DARK })
  spacer(6)
}

function subHeading(text) {
  spacer(8)
  writeLine(text, { size: 13, bold: true, color: COLOR_DARK })
  spacer(2)
}

function paragraph(text) {
  writeLine(text, { size: 11, lineHeight: 16 })
  spacer(4)
}

function bullet(text) {
  setText({ size: 11, color: COLOR_PRIMARY, bold: true })
  ensureSpace(18)
  doc.text('\u2022', MARGIN + 4, cursor.y)
  writeLine(text, { size: 11, lineHeight: 16, indent: 18 })
  spacer(2)
}

function numberedStep(num, title, body) {
  spacer(8)
  ensureSpace(60)
  // Number circle
  setText({ size: 14, bold: true, color: '#ffffff' })
  doc.setFillColor(COLOR_PRIMARY)
  doc.circle(MARGIN + 12, cursor.y - 4, 12, 'F')
  doc.text(String(num), MARGIN + 12, cursor.y, { align: 'center' })
  // Title
  setText({ size: 13, bold: true, color: COLOR_DARK })
  doc.text(title, MARGIN + 34, cursor.y)
  cursor.y += 18
  // Body (indented to align under title)
  if (body) writeLine(body, { size: 11, indent: 34, lineHeight: 16, color: COLOR_DARK })
  spacer(6)
}

function calloutBox({ title, body, kind = 'note' }) {
  const palette = kind === 'ok'
    ? { bg: COLOR_OK_BG, fg: COLOR_OK_FG, bar: COLOR_OK_BAR }
    : { bg: COLOR_NOTE_BG, fg: COLOR_NOTE_FG, bar: COLOR_NOTE_BAR }

  setText({ size: 11 })
  const titleH = title ? 16 : 0
  const bodyLines = doc.splitTextToSize(body, CONTENT_W - 28)
  const bodyH = bodyLines.length * 15
  const blockH = titleH + bodyH + 18

  ensureSpace(blockH + 4)

  // Background
  doc.setFillColor(palette.bg)
  doc.rect(MARGIN, cursor.y - 8, CONTENT_W, blockH, 'F')
  // Left bar
  doc.setFillColor(palette.bar)
  doc.rect(MARGIN, cursor.y - 8, 4, blockH, 'F')

  let y = cursor.y + 4
  if (title) {
    setText({ size: 11, bold: true, color: palette.fg })
    doc.text(title, MARGIN + 14, y)
    y += titleH
  }
  setText({ size: 11, color: palette.fg })
  doc.text(bodyLines, MARGIN + 14, y)
  cursor.y += blockH + 6
}

function codeFile(name) {
  setText({ size: 10, font: 'courier', bold: true })
  ensureSpace(18)
  doc.setFillColor('#f3f4f6')
  const w = doc.getTextWidth(name) + 14
  doc.roundedRect(MARGIN, cursor.y - 10, w, 16, 3, 3, 'F')
  setText({ size: 10, font: 'courier', color: COLOR_DARK })
  doc.text(name, MARGIN + 7, cursor.y)
  cursor.y += 18
}

// ────────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ────────────────────────────────────────────────────────────────────────────

doc.setFillColor(COLOR_PRIMARY)
doc.rect(0, 0, PAGE_W, 8, 'F')

setText({ size: 11, color: COLOR_MID, bold: true })
doc.text('GETTING STARTED', MARGIN, MARGIN + 24)

setText({ size: 36, bold: true, color: COLOR_DARK })
doc.text('BPMN Studio', MARGIN, MARGIN + 90)

setText({ size: 22, color: COLOR_DARK })
doc.text('Installation Guide', MARGIN, MARGIN + 124)

setText({ size: 13, color: COLOR_MID })
const subtitle = 'Build BPMN 2.0 process diagrams with guided forms or natural language. Runs entirely on your machine.'
const subLines = doc.splitTextToSize(subtitle, CONTENT_W)
doc.text(subLines, MARGIN, MARGIN + 168)

// Big "what you need" box near the bottom
setText({ size: 9, color: COLOR_MID, bold: true })
doc.text('WHAT YOU NEED', MARGIN, PAGE_H - 250)

const bullets = [
  'A Mac (any model from 2017 or newer) or a Windows 10/11 PC',
  'About 5 minutes',
  'The installer file your colleague sent you (a .dmg or .exe)',
]
let by = PAGE_H - 230
bullets.forEach(b => {
  setText({ size: 12, bold: true, color: COLOR_PRIMARY })
  doc.text('\u2022', MARGIN + 4, by)
  setText({ size: 12, color: COLOR_DARK })
  const lines = doc.splitTextToSize(b, CONTENT_W - 24)
  doc.text(lines, MARGIN + 18, by)
  by += lines.length * 18
})

setText({ size: 10, color: COLOR_MID })
doc.text(`Version ${VERSION}`, MARGIN, PAGE_H - 60)

// ────────────────────────────────────────────────────────────────────────────
// PAGE — CHOOSE YOUR INSTALLER
// ────────────────────────────────────────────────────────────────────────────

nextPage()
sectionHeading('Step 1 — Pick the right installer')

paragraph(
  'You should have received one or more installer files from your colleague. ' +
  'Pick the one that matches your computer:'
)

spacer(4)

// Mini "card" for each option
function installerCard(label, file, who) {
  ensureSpace(60)
  doc.setFillColor('#f9fafb')
  doc.setDrawColor(COLOR_LIGHT)
  doc.setLineWidth(0.6)
  doc.roundedRect(MARGIN, cursor.y - 6, CONTENT_W, 56, 6, 6, 'FD')

  setText({ size: 12, bold: true, color: COLOR_PRIMARY })
  doc.text(label, MARGIN + 14, cursor.y + 8)

  setText({ size: 10, font: 'courier', color: COLOR_DARK })
  doc.text(file, MARGIN + 14, cursor.y + 26)

  setText({ size: 10, color: COLOR_MID, italic: true })
  doc.text(who, MARGIN + 14, cursor.y + 42)

  cursor.y += 64
}

installerCard(
  'Mac with Apple Silicon (M1, M2, M3, M4)',
  'BPMN Studio-1.0.0-arm64.dmg',
  'Most Macs sold from late 2020 onward.'
)
installerCard(
  'Mac with Intel processor',
  'BPMN Studio-1.0.0-x64.dmg',
  'Macs sold before late 2020.'
)
installerCard(
  'Windows 10 or 11',
  'BPMN Studio-Setup-1.0.0.exe',
  'Any modern PC, 64-bit Windows.'
)

calloutBox({
  title: 'How to check your Mac chip',
  body:
    'Click the Apple logo (top-left) → "About This Mac" → look at the "Chip" or ' +
    '"Processor" line. If it says Apple M1/M2/M3/M4, use the arm64 installer. ' +
    'If it says Intel, use the x64 installer.',
})

// ────────────────────────────────────────────────────────────────────────────
// PAGE — INSTALL ON MAC
// ────────────────────────────────────────────────────────────────────────────

nextPage()
sectionHeading('Step 2A — Install on Mac')

paragraph('If you have a Windows PC, skip to Step 2B on the next page.')
spacer(4)

numberedStep(1,
  'Double-click the .dmg file',
  'A small Finder window opens showing the BPMN Studio app and a shortcut to your Applications folder.'
)
numberedStep(2,
  'Drag BPMN Studio into Applications',
  'This installs the app. Once the copy finishes, you can close the Finder window and eject the disk image (drag it to the Trash from the desktop).'
)
numberedStep(3,
  'First launch — right-click instead of double-click',
  'Open your Applications folder, RIGHT-CLICK (or Control-click) "BPMN Studio", and choose "Open" from the menu. A warning will appear — click "Open" again.'
)
numberedStep(4,
  'You\'re done',
  'Future launches work normally. You can pin BPMN Studio to your Dock by right-clicking its Dock icon → Options → Keep in Dock.'
)

calloutBox({
  title: 'Why the warning?',
  body:
    'macOS shows "cannot be opened because it is from an unidentified developer" ' +
    'because this app is distributed internally without an Apple Developer ID. ' +
    'Right-clicking and choosing Open is Apple\'s built-in way to approve internal ' +
    'apps. You only have to do this once — every future launch is normal.',
})

// ────────────────────────────────────────────────────────────────────────────
// PAGE — INSTALL ON WINDOWS
// ────────────────────────────────────────────────────────────────────────────

nextPage()
sectionHeading('Step 2B — Install on Windows')

paragraph('If you already installed on Mac, skip to Step 3.')
spacer(4)

numberedStep(1,
  'Double-click the .exe file',
  'Windows SmartScreen will probably show a blue dialog that says "Windows protected your PC".'
)
numberedStep(2,
  'Click "More info", then "Run anyway"',
  'The "More info" link is small but it\'s in the dialog. Click it to reveal the "Run anyway" button.'
)
numberedStep(3,
  'Choose where to install',
  'The default location works for everyone (no admin password needed). Click Next, then Install.'
)
numberedStep(4,
  'Pick your shortcut options',
  'Decide if you want a desktop icon and/or a Start menu entry. Both are checked by default.'
)
numberedStep(5,
  'Done — BPMN Studio launches',
  'You\'ll find it in the Start menu under "BPMN Studio" and on your desktop if you kept that option.'
)

calloutBox({
  title: 'Why the warning?',
  body:
    'Windows SmartScreen flags installers that aren\'t code-signed with a paid ' +
    'certificate. This is normal for internal company apps. The "Run anyway" ' +
    'option exists specifically for this situation — you only need to do it once.',
})

// ────────────────────────────────────────────────────────────────────────────
// PAGE — FIRST LAUNCH
// ────────────────────────────────────────────────────────────────────────────

nextPage()
sectionHeading('Step 3 — Your first diagram')

paragraph(
  'When BPMN Studio opens, you\'ll see a toolbar at the top and a canvas in the ' +
  'middle. There are two ways to create a diagram:'
)

subHeading('Option A — Use the wizard')
bullet('In the top-right of the toolbar, make sure "Wizard" is selected.')
bullet('Walk through the six steps: Identity, Participants, Trigger, Tasks, Gateways, Flows.')
bullet('Click "Generate Diagram" at the end to render it.')

subHeading('Option B — Describe your process in plain English (AI Assist)')
bullet('Click "AI Assist" in the toolbar (the violet button with the sparkle icon).')
bullet('Type or paste a description of your process — write it the way you\'d explain it to a coworker.')
bullet('Click "Parse Process" — the AI extracts the elements (this takes 10-60 seconds).')
bullet('Review the preview, then click "Generate Diagram".')

calloutBox({
  kind: 'ok',
  title: 'Tip — refine, don\'t restart',
  body:
    'After a diagram exists, an amber "Refine" button appears in the toolbar. Use it to make ' +
    'targeted changes in plain English ("The VP handles the over-$25k approval", ' +
    '"Add a compliance check after vendor verification"). Refinement preserves ' +
    'everything else, so you don\'t lose your work.',
})

calloutBox({
  title: 'AI Assist requires Ollama (optional)',
  body:
    'If the AI Assist button shows "Ollama offline", you can either use the wizard ' +
    'instead, or install Ollama (free, local, no cloud) by following the in-app ' +
    'instructions: click the help icon (?) in the top-right and read the "Install ' +
    'Ollama" section.',
})

// ────────────────────────────────────────────────────────────────────────────
// PAGE — GETTING HELP & EXPORTING
// ────────────────────────────────────────────────────────────────────────────

nextPage()
sectionHeading('Step 4 — Save and share your work')

subHeading('Exporting')
paragraph('Click the "Export" dropdown in the toolbar to save your diagram as:')
bullet('BPMN 2.0 (.bpmn) — the open standard, opens in Camunda, Signavio, bpmn.io, etc.')
bullet('PDF document — print-ready single-page image of the diagram.')
bullet('SVG image — scalable vector for slides and docs.')
bullet('PNG image — raster image for tickets, wikis, chat.')

subHeading('Opening existing diagrams')
paragraph(
  'Click "Open" in the toolbar to load any .bpmn file someone sends you. ' +
  'You can edit it in the visual editor and re-export.'
)

sectionHeading('Step 5 — Where to find help')

bullet('Click the help icon (?) on the far right of the toolbar to open the full user manual.')
bullet('Search the manual using the search bar at the top of the help drawer.')
bullet('Export the manual as PDF, HTML, or Markdown using the buttons at the bottom of the drawer.')

calloutBox({
  kind: 'ok',
  title: 'Privacy',
  body:
    'BPMN Studio runs entirely on your machine. No data is sent to the cloud. ' +
    'No accounts, no analytics, no telemetry. The optional AI Assist feature ' +
    'uses a local Ollama server you install yourself — your prompts never leave ' +
    'your computer.',
})

spacer(20)
divider()
setText({ size: 9, color: COLOR_MID, italic: true })
doc.text(
  `BPMN Studio Installation Guide \u00B7 Version ${VERSION}`,
  MARGIN, cursor.y
)

// ────────────────────────────────────────────────────────────────────────────
// FOOTERS
// ────────────────────────────────────────────────────────────────────────────

const totalPages = doc.getNumberOfPages()
for (let i = 2; i <= totalPages; i++) {
  doc.setPage(i)
  setText({ size: 9, color: COLOR_MID })
  doc.text('BPMN Studio Installation Guide', MARGIN, PAGE_H - 30)
  doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' })
}

// ────────────────────────────────────────────────────────────────────────────
// WRITE OUTPUT
// ────────────────────────────────────────────────────────────────────────────

const outDir  = path.join(ROOT, 'release', VERSION)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'BPMN_Studio_Installation_Guide.pdf')

const buffer = doc.output('arraybuffer')
await fs.writeFile(outPath, Buffer.from(buffer))

console.log(`\n  \u2713 Installation guide written to:`)
console.log(`    ${outPath}\n`)
