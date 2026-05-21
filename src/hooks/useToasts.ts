import { useCallback, useState } from 'react'
import type { Toast, ToastTone } from '@/components/ui/Toast'

let __toastSeq = 0

/**
 * Lightweight toast manager.  Returns the live list of toasts plus helpers to
 * show / dismiss them.  No global store — toasts are scoped to whichever
 * component holds the hook (we mount it once in <App/>).
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (tone: ToastTone, title: string, opts: { message?: string; durationMs?: number } = {}) => {
      const id = `toast_${++__toastSeq}`
      setToasts((prev) => [
        ...prev,
        {
          id,
          tone,
          title,
          message:    opts.message,
          // Errors stay until dismissed; informational toasts auto-clear.
          durationMs: opts.durationMs ?? (tone === 'error' || tone === 'warning' ? 0 : 5000),
        },
      ])
      return id
    },
    [],
  )

  // Convenience wrappers
  const info    = useCallback((title: string, message?: string) => show('info',    title, { message }), [show])
  const success = useCallback((title: string, message?: string) => show('success', title, { message }), [show])
  const warning = useCallback((title: string, message?: string) => show('warning', title, { message }), [show])
  const error   = useCallback((title: string, message?: string) => show('error',   title, { message }), [show])

  return { toasts, show, dismiss, info, success, warning, error }
}
