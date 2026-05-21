/**
 * Iterative refinement panel.
 *
 * Lets the user tweak an existing diagram using natural-language instructions
 * (e.g. "The VP handles this task", "Change the threshold to $10,000").
 * Sends current model + instruction to Ollama, applies returned JSON.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Wand2, AlertCircle, CheckCircle2, Loader2,
  WifiOff, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getOllamaStatus, type OllamaStatus } from '@/services/ollamaService'
import {
  refineProcess,
  refineWithRules,
  wizardStateToParsedProcess,
  parsedToWizardState,
  type ParsedProcess,
} from '@/services/nlpService'
import type { WizardState } from '@/types/wizard'

interface NLRefinePanelProps {
  currentState: WizardState
  onClose:    () => void
  onApply:    (newState: Partial<WizardState>) => void
}

type Phase = 'input' | 'applying' | 'success'

const EXAMPLES = [
  'The VP handles the over-$25k approval task',
  'The auto-approval threshold should be $10,000',
  'Add a compliance check after vendor verification',
  'Remove the manager approval step for purchases under $1,000',
  'Rename "Approve Request" to "Manager Approves Request"',
  'Make verification and risk assessment happen in parallel',
]

export function NLRefinePanel({ currentState, onClose, onApply }: NLRefinePanelProps) {
  const [phase, setPhase]                 = useState<Phase>('input')
  const [text, setText]                   = useState('')
  const [ollamaStatus, setOllamaStatus]   = useState<OllamaStatus | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [streamOutput, setStreamOutput]   = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [checkingOllama, setCheckingOllama] = useState(true)

  const abortRef = useRef<AbortController | null>(null)

  const checkOllama = useCallback(async () => {
    setCheckingOllama(true)
    const status = await getOllamaStatus()
    setOllamaStatus(status)
    if (status.available && status.models.length > 0 && !selectedModel) {
      const preferred = status.models.find(m =>
        /llama3|mistral|phi|gemma|qwen/i.test(m.name)
      ) ?? status.models[0]
      setSelectedModel(preferred.name)
    }
    setCheckingOllama(false)
  }, [selectedModel])

  useEffect(() => { checkOllama() }, [checkOllama])

  const handleApply = async () => {
    if (!text.trim()) return
    const ollamaReady = ollamaStatus?.available && selectedModel

    // If Ollama is down, try the deterministic refiner first — covers common
    // patterns like "rename X to Y", "<actor> handles <task>", threshold
    // tweaks, and "remove <task>".  Anything else needs the LLM.
    if (!ollamaReady) {
      const currentParsed = wizardStateToParsedProcess(currentState)
      const offline = refineWithRules(currentParsed, text)
      if (offline.applied) {
        setPhase('applying')
        setError(null)
        setStreamOutput(`Applied offline: ${offline.description}\n`)
        const newWizardState = parsedToWizardState(offline.model)
        setPhase('success')
        setTimeout(() => onApply(newWizardState), 400)
        return
      }
      setError(
        'Ollama is offline. The built-in offline refiner handles simple ' +
        'patterns like "Rename X to Y", "<Role> handles the <Task> task", ' +
        '"Remove the <Task> task", and "Change the threshold to $X". For ' +
        'anything more complex, install Ollama and pull a model.'
      )
      return
    }

    setPhase('applying')
    setError(null)
    setStreamOutput('')
    abortRef.current = new AbortController()

    try {
      const currentParsed = wizardStateToParsedProcess(currentState)
      const refined: ParsedProcess = await refineProcess(
        currentParsed,
        text,
        selectedModel!,
        (chunk) => setStreamOutput(prev => prev + chunk),
        abortRef.current.signal,
      )
      const newWizardState = parsedToWizardState(refined)
      setPhase('success')
      // Brief success flash, then apply
      setTimeout(() => onApply(newWizardState), 400)
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase('input')
        return
      }
      setError(`Refinement failed: ${(err as Error).message}`)
      setPhase('input')
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('input')
  }

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
        Ollama offline — offline refiner only (rename / re-assign / threshold / remove)
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Wand2 size={16} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Refine Diagram</h2>
              <p className="text-xs text-gray-500">Make changes in plain language — AI will apply them</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Ollama status */}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">AI Model</label>
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                disabled={phase === 'applying'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {ollamaStatus.models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Current model summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600">
            <div className="font-semibold text-gray-700 mb-2">Current Diagram</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-4">
              <div>
                <span className="text-gray-400">Tasks:</span>{' '}
                <strong>{currentState.tasks?.length ?? 0}</strong>
              </div>
              <div>
                <span className="text-gray-400">Gateways:</span>{' '}
                <strong>{currentState.gateways?.length ?? 0}</strong>
              </div>
              <div>
                <span className="text-gray-400">Participants:</span>{' '}
                <strong>{currentState.participants?.length ?? 0}</strong>
              </div>
              <div>
                <span className="text-gray-400">Flows:</span>{' '}
                <strong>{currentState.flows?.length ?? 0}</strong>
              </div>
            </div>
          </div>

          {/* Input */}
          {phase !== 'success' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  What would you like to change? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  disabled={phase === 'applying'}
                  rows={4}
                  placeholder='e.g. "The VP handles the over-$25k approval task" or "Change the threshold to $10,000"'
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 bg-white text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"
                />
              </div>

              {/* Examples */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Examples — click to use:</div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setText(ex)}
                      disabled={phase === 'applying'}
                      className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors text-left disabled:opacity-50"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Streaming output */}
          {phase === 'applying' && streamOutput && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> AI is applying changes…
              </div>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-32 text-gray-600 whitespace-pre-wrap font-mono">
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

          {/* Success */}
          {phase === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <CheckCircle2 size={14} className="shrink-0" />
              Refinement applied — regenerating diagram…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
          {phase === 'input' && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApply}
                disabled={!text.trim()}
                className="gap-2 bg-amber-500 hover:bg-amber-600"
              >
                <Wand2 size={14} />
                Apply Refinement
              </Button>
            </>
          )}
          {phase === 'applying' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin text-amber-500" />
                Applying…
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
