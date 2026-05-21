import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X as XIcon } from 'lucide-react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id:       string
  tone:     ToastTone
  title:    string
  message?: string
  /** Auto-dismiss after this many ms.  0 (or undefined) means no auto-dismiss. */
  durationMs?: number
}

interface ToastViewProps {
  toast:     Toast
  onDismiss: (id: string) => void
}

const TONE_STYLES: Record<ToastTone, { wrapper: string; iconColor: string; Icon: typeof Info }> = {
  info:    { wrapper: 'border-blue-200    bg-blue-50    text-blue-900',    iconColor: 'text-blue-500',    Icon: Info },
  success: { wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900', iconColor: 'text-emerald-500', Icon: CheckCircle2 },
  warning: { wrapper: 'border-amber-200   bg-amber-50   text-amber-900',   iconColor: 'text-amber-500',   Icon: AlertTriangle },
  error:   { wrapper: 'border-rose-200    bg-rose-50    text-rose-900',    iconColor: 'text-rose-500',    Icon: AlertTriangle },
}

function ToastView({ toast, onDismiss }: ToastViewProps) {
  const { id, tone, title, message, durationMs } = toast
  const { wrapper, iconColor, Icon } = TONE_STYLES[tone]

  useEffect(() => {
    if (!durationMs || durationMs <= 0) return
    const handle = setTimeout(() => onDismiss(id), durationMs)
    return () => clearTimeout(handle)
  }, [id, durationMs, onDismiss])

  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      aria-live={tone === 'error' || tone === 'warning' ? 'assertive' : 'polite'}
      className={`flex items-start gap-2.5 px-3 py-2.5 border rounded-lg shadow-sm text-sm w-[320px] ${wrapper}`}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium leading-tight">{title}</div>
        {message ? (
          <div className="text-xs opacity-80 mt-1 leading-snug whitespace-pre-line">{message}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-black/5 transition-colors"
      >
        <XIcon size={14} />
      </button>
    </div>
  )
}

interface ToastStackProps {
  toasts:    Toast[]
  onDismiss: (id: string) => void
}

/**
 * Floating top-right stack of toasts.  Stays out of the way of the editor
 * canvas and the wizard form by anchoring beneath the toolbar.
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-auto">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
