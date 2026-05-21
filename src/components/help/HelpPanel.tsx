/**
 * In-app help panel.
 *
 * Renders the user manual in a slide-out drawer with:
 *   - Section / topic navigation
 *   - Live full-text search
 *   - Export to Markdown, HTML, and PDF
 */

import { useState, useMemo } from 'react'
import {
  X, Search, Download, FileText, Globe, FileDown, ChevronRight,
  HelpCircle, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  MANUAL, MANUAL_TITLE, MANUAL_SUBTITLE, MANUAL_VERSION,
  type ManualBlock, type ManualSection, type ManualTopic,
} from '@/docs/userManual'
import {
  renderManualMarkdown, renderManualHtml, renderManualPdf,
} from '@/services/manualRenderer'
import { saveFile } from '@/services/fileService'

interface HelpPanelProps {
  onClose: () => void
}

// ── Search helpers ───────────────────────────────────────────────────────────

function blockToText(b: ManualBlock): string {
  if (typeof b.content === 'string') return b.content
  if (Array.isArray(b.content)) {
    if (b.content.length && Array.isArray(b.content[0])) {
      return (b.content as Array<[string, string]>).map(r => r.join(' ')).join(' ')
    }
    return (b.content as string[]).join(' ')
  }
  return ''
}

function topicToSearchString(t: ManualTopic): string {
  return (t.title + ' ' + t.blocks.map(blockToText).join(' ')).toLowerCase()
}

// ── Block renderers (in-app) ─────────────────────────────────────────────────

function BlockView({ block }: { block: ManualBlock }) {
  switch (block.type) {
    case 'h3':
      return <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-5 mb-1.5">
        {block.content as string}
      </h3>
    case 'p':
      return <p className="text-sm text-gray-700 leading-relaxed my-2">
        {block.content as string}
      </p>
    case 'ul':
      return <ul className="my-2 space-y-1.5 ml-1">
        {(block.content as string[]).map((s, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-blue-500 shrink-0 mt-1">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    case 'ol':
      return <ol className="my-2 space-y-1.5 ml-1">
        {(block.content as string[]).map((s, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-blue-500 shrink-0 mt-0.5 font-semibold w-5 text-right">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    case 'note':
      return <aside className="my-3 bg-amber-50 border-l-4 border-amber-400 text-amber-900 px-3 py-2 rounded-r text-sm">
        <strong className="font-semibold">Note: </strong>
        {block.content as string}
      </aside>
    case 'code':
      return <pre className="my-3 bg-gray-900 text-gray-100 rounded-lg p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono">
        {block.content as string}
      </pre>
    case 'kbd-table': {
      const rows = block.content as Array<[string, string]>
      return <table className="my-3 w-full text-sm">
        <thead>
          <tr>
            <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-semibold pb-2 border-b border-gray-200">Shortcut</th>
            <th className="text-left text-xs uppercase tracking-wider text-gray-500 font-semibold pb-2 border-b border-gray-200">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100">
              <td className="py-2 pr-4">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">{k}</kbd>
              </td>
              <td className="py-2 text-gray-700">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    }
  }
}

// ── Topic / section renderers ────────────────────────────────────────────────

function TopicView({ topic }: { topic: ManualTopic }) {
  return (
    <article id={`topic-${topic.id}`} className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{topic.title}</h2>
      <div>{topic.blocks.map((b, i) => <BlockView key={i} block={b} />)}</div>
    </article>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function HelpPanel({ onClose }: HelpPanelProps) {
  const [query, setQuery]     = useState('')
  const [activeSection, setActiveSection] = useState<string>(MANUAL[0].id)
  const [exporting, setExporting] = useState<string | null>(null)

  const lcQuery = query.trim().toLowerCase()

  // Filter sections / topics by search query
  const filteredSections = useMemo(() => {
    if (!lcQuery) return MANUAL
    return MANUAL.map(s => ({
      ...s,
      topics: s.topics.filter(t => topicToSearchString(t).includes(lcQuery)),
    })).filter(s => s.topics.length > 0)
  }, [lcQuery])

  const visibleSection: ManualSection | undefined =
    filteredSections.find(s => s.id === activeSection) ?? filteredSections[0]

  const handleExport = async (format: 'md' | 'html' | 'pdf') => {
    setExporting(format)
    try {
      if (format === 'md') {
        const md = renderManualMarkdown()
        await saveFile(md, 'BPMN_Studio_Manual.md', 'text/markdown')
      } else if (format === 'html') {
        const html = renderManualHtml()
        await saveFile(html, 'BPMN_Studio_Manual.html', 'text/html')
      } else {
        const blob = await renderManualPdf()
        await saveFile(blob, 'BPMN_Studio_Manual.pdf', 'application/pdf')
      }
    } catch (err) {
      // Ignore user-cancelled save dialogs
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('Manual export failed:', err)
        alert(`Export failed: ${(err as Error).message}`)
      }
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm">
      {/* Click-outside backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer */}
      <div className="bg-white w-full max-w-4xl h-full shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-violet-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <HelpCircle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{MANUAL_TITLE}</h2>
              <p className="text-xs text-gray-500">{MANUAL_SUBTITLE} · v{MANUAL_VERSION}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/60 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="Close help"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the manual..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">

          {/* Sidebar */}
          <nav className="w-64 border-r border-gray-100 overflow-y-auto bg-gray-50 px-3 py-4 shrink-0">
            {filteredSections.length === 0 ? (
              <div className="text-sm text-gray-500 px-2 py-3">No matches found.</div>
            ) : (
              filteredSections.map(s => (
                <div key={s.id} className="mb-1">
                  <button
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === s.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="truncate">{s.title}</span>
                    {activeSection === s.id && <ChevronRight size={14} />}
                  </button>
                  {activeSection === s.id && (
                    <ul className="ml-4 mt-1 space-y-0.5">
                      {s.topics.map(t => (
                        <li key={t.id}>
                          <a
                            href={`#topic-${t.id}`}
                            onClick={(e) => {
                              e.preventDefault()
                              const el = document.getElementById(`topic-${t.id}`)
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }}
                            className="block px-3 py-1.5 text-xs text-gray-600 hover:text-blue-600 truncate"
                          >
                            {t.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </nav>

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-8 py-6">
            {visibleSection ? (
              <>
                <h1 className="text-2xl font-bold text-blue-700 border-b border-gray-200 pb-3 mb-6">
                  {visibleSection.title}
                </h1>
                {visibleSection.topics.map(t => <TopicView key={t.id} topic={t} />)}
              </>
            ) : (
              <div className="text-gray-500 italic mt-12 text-center">
                <Layers size={32} className="mx-auto mb-3 opacity-40" />
                Try a different search term.
              </div>
            )}
          </main>
        </div>

        {/* Footer — export actions */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Download the full manual:</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('md')}
              disabled={exporting !== null}
              className="gap-1.5"
              title="Markdown — for wikis and version control"
            >
              <FileText size={13} className="text-gray-600" />
              <span className="hidden sm:inline">Markdown</span>
              {exporting === 'md' && <span className="ml-1">…</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('html')}
              disabled={exporting !== null}
              className="gap-1.5"
              title="Self-contained styled HTML"
            >
              <Globe size={13} className="text-green-600" />
              <span className="hidden sm:inline">HTML</span>
              {exporting === 'html' && <span className="ml-1">…</span>}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="gap-1.5"
              title="Print-ready PDF"
            >
              <FileDown size={13} />
              <span className="hidden sm:inline">PDF</span>
              {exporting === 'pdf' ? <span className="ml-1">…</span> : <Download size={11} className="ml-0.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
