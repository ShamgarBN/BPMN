import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Sparkles, AlertCircle, CheckCircle2, Loader2,
  ChevronDown, ChevronRight, WifiOff, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getOllamaStatus, type OllamaStatus } from '@/services/ollamaService'
import { parseProcessText } from '@/services/nlpService'
import type { WizardState } from '@/types/wizard'

interface NLInputPanelProps {
  onClose: () => void
  onGenerate: (state: Partial<WizardState>) => void
}

type PanelPhase = 'input' | 'parsing' | 'result'

const PLACEHOLDER = `Describe your process in plain language. For example:

"When an employee needs reimbursement for a business expense, they fill out an expense report and attach their receipts, then submit it through the system. Their manager gets a notification and reviews the report. If the manager rejects it, the employee fixes and resubmits. If approved, Finance verifies receipts, checks the budget, processes the payment, and deposits the funds. Finally, the employee receives a confirmation email."`

export function NLInputPanel({ onClose, onGenerate }: NLInputPanelProps) {
  const [phase, setPhase]           = useState<PanelPhase>('input')
  const [text, setText]             = useState('')
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [streamOutput, setStreamOutput]   = useState('')
  const [parsedState, setParsedState]   = useState<Partial<WizardState> | null>(null)
  const [usedOllama, setUsedOllama]     = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [previewOpen, setPreviewOpen]     = useState(false)
  const [checkingOllama, setCheckingOllama] = useState(true)

  const abortRef = useRef<AbortController | null>(null)

  // ── Check Ollama on mount ────────────────────────────────────────────────
  const checkOllama = useCallback(async () => {
    setCheckingOllama(true)
    const status = await getOllamaStatus()
    setOllamaStatus(status)
    if (status.available && status.models.length > 0 && !selectedModel) {
      // Prefer llama3, mistral, or phi-3 variants for instruction following
      const preferred = status.models.find(m =>
        /llama3|mistral|phi|gemma|qwen/i.test(m.name)
      ) ?? status.models[0]
      setSelectedModel(preferred.name)
    }
    setCheckingOllama(false)
  }, [selectedModel])

  useEffect(() => { checkOllama() }, [checkOllama])

  // ── Parse ────────────────────────────────────────────────────────────────
  const handleParse = async () => {
    if (!text.trim()) return
    setPhase('parsing')
    setError(null)
    setStreamOutput('')

    abortRef.current = new AbortController()
    const modelToUse = ollamaStatus?.available && selectedModel ? selectedModel : undefined

    try {
      const { state, usedOllama: ua } = await parseProcessText(
        text,
        modelToUse,
        (chunk) => setStreamOutput(prev => prev + chunk),
        abortRef.current.signal,
      )
      setUsedOllama(ua)
      setParsedState(state)
      setPhase('result')
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase('input')
        return
      }
      // If Ollama fails mid-stream, fall back to rule-based
      try {
        const { state } = await parseProcessText(text, undefined)
        setParsedState(state)
        setUsedOllama(false)
        setError('Ollama parsing failed — used built-in rule-based parser instead.')
        setPhase('result')
      } catch (fallbackErr) {
        setError(`Parsing failed: ${(fallbackErr as Error).message}`)
        setPhase('input')
      }
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('input')
  }

  const handleGenerate = () => {
    if (parsedState) onGenerate(parsedState)
  }

  const handleReset = () => {
    setPhase('input')
    setParsedState(null)
    setStreamOutput('')
    setError(null)
  }

  // ── Ollama status badge ──────────────────────────────────────────────────
  const OllamaBadge = () => {
    if (checkingOllama) return (
      <span className="flex items-center gap-1 text-xs text-gray-400">
        <Loader2 size={11} className="animate-spin" /> Checking…
      </span>
    )
    if (!ollamaStatus) return null
    return ollamaStatus.available ? (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 size={11} />
        Ollama connected · {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''}
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <WifiOff size={11} />
        Ollama offline — will use built-in parser
      </span>
    )
  }

  // ── Parsed preview section ───────────────────────────────────────────────
  const PreviewSection = () => {
    const s = parsedState
    if (!s) return null
    return (
      <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden text-sm">
        <button
          className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium"
          onClick={() => setPreviewOpen(v => !v)}
        >
          <span>Parsed Process Preview</span>
          {previewOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {previewOpen && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Process Name</div>
              <div className="font-medium text-gray-900">{s.processName}</div>
            </div>

            {s.participants && s.participants.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Participants ({s.participants.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.participants.map((p, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {s.tasks && s.tasks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Tasks ({s.tasks.length})
                </div>
                <div className="space-y-1.5">
                  {s.tasks.map((t, i) => {
                    const lane = s.participants?.find(p => p.id === t.participantId)
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded flex items-center justify-center bg-blue-50 text-blue-600 text-xs font-semibold shrink-0">{i + 1}</span>
                        <span className="text-gray-800">{t.name}</span>
                        {lane && (
                          <span className="ml-auto text-xs text-gray-400 shrink-0">{lane.name}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {s.gateways && s.gateways.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Decision Points ({s.gateways.length})
                </div>
                <div className="space-y-1">
                  {s.gateways.map((g, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-amber-500">◇</span>
                      <span className="text-gray-800">{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.endEvents && s.endEvents.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  End Events ({s.endEvents.length})
                </div>
                {s.endEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-red-500">⬤</span>
                    <span className="text-gray-800">{e.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Connections
              </div>
              <div className="text-gray-600">{s.flows?.length ?? 0} sequence flows</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Sparkles size={16} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Describe Your Process</h2>
              <p className="text-xs text-gray-500">Write in plain language — AI will build the diagram</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Ollama status row */}
          <div className="flex items-center justify-between">
            <OllamaBadge />
            {ollamaStatus?.available && (
              <button onClick={checkOllama} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <RefreshCw size={10} /> Refresh
              </button>
            )}
          </div>

          {/* Model selector */}
          {ollamaStatus?.available && ollamaStatus.models.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                AI Model
              </label>
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                disabled={phase === 'parsing'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {ollamaStatus.models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Offline notice */}
          {ollamaStatus && !ollamaStatus.available && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <div>
                <strong>Ollama not detected.</strong> The built-in rule-based parser will be used instead. For best results,{' '}
                <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline">
                  install Ollama
                </a>{' '}
                and run a model locally (e.g. <code className="bg-amber-100 px-1 rounded">ollama run llama3.2</code>).
              </div>
            </div>
          )}

          {/* Text input */}
          {phase !== 'result' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Process Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={phase === 'parsing'}
                rows={10}
                placeholder={PLACEHOLDER}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none leading-relaxed"
              />
              <div className="text-right text-xs text-gray-400 mt-1">{text.length} characters</div>
            </div>
          )}

          {/* Streaming output */}
          {phase === 'parsing' && streamOutput && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> AI is thinking…
              </div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-40 text-gray-600 whitespace-pre-wrap font-mono">
                {streamOutput}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Result phase */}
          {phase === 'result' && parsedState && (
            <div>
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-3">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>
                  Process parsed successfully using{' '}
                  <strong>{usedOllama ? selectedModel : 'built-in parser'}</strong>.
                  Review below, then generate the diagram.
                </span>
              </div>

              <PreviewSection />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50">
          {phase === 'input' && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleParse}
                disabled={!text.trim()}
                className="gap-2"
              >
                <Sparkles size={14} />
                Parse Process
              </Button>
            </>
          )}

          {phase === 'parsing' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                Analyzing process…
              </div>
            </>
          )}

          {phase === 'result' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                ← Try Again
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
                <Button variant="primary" size="sm" onClick={handleGenerate} className="gap-2">
                  <Sparkles size={14} />
                  Generate Diagram
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
