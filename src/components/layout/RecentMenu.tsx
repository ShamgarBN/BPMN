import { useEffect, useRef, useState, useCallback } from 'react'
import { Clock, FileJson, FileText, X as XIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { listRecents, removeRecent, clearRecents, type RecentFile } from '@/services/recentFilesService'

interface RecentMenuProps {
  onOpen: (file: RecentFile) => Promise<void> | void
}

/**
 * Dropdown that surfaces the user's recently opened/saved files.  The list
 * lives in localStorage; we re-read it whenever the menu opens so changes
 * made elsewhere (e.g. another save) are reflected immediately.
 */
export function RecentMenu({ onOpen }: RecentMenuProps) {
  const [open, setOpen]       = useState(false)
  const [items, setItems]     = useState<RecentFile[]>([])
  const rootRef               = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => setItems(listRecents()), [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  // Close on outside click & Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  const handleSelect = async (f: RecentFile) => {
    setOpen(false)
    try {
      await onOpen(f)
    } catch (err) {
      console.error('[RecentMenu] open failed:', err)
    }
  }

  const handleRemove = (e: React.MouseEvent, f: RecentFile) => {
    e.preventDefault()
    e.stopPropagation()
    removeRecent({ path: f.path, name: f.name })
    refresh()
  }

  const handleClear = () => {
    clearRecents()
    refresh()
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        title="Open a recent file"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Clock size={14} />
        <span className="hidden md:inline">Recent</span>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden"
        >
          {items.length === 0 ? (
            <div className="px-4 py-6 text-xs text-gray-500 text-center">
              No recent files yet.
              <div className="text-[11px] text-gray-400 mt-1">
                Save or open a project to populate this list.
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto py-1">
                {items.map((f) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={`${f.kind}|${f.path}|${f.name}`}
                    onClick={() => handleSelect(f)}
                    className="flex items-center w-full gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 group"
                  >
                    {f.kind === 'project'
                      ? <FileJson size={13} className="text-violet-500 flex-shrink-0" />
                      : <FileText size={13} className="text-blue-500   flex-shrink-0" />}
                    <span className="flex-1 truncate" title={f.path || f.name}>
                      {f.name}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {relativeTime(f.openedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemove(e, f)}
                      title="Remove from list"
                      aria-label="Remove from recent files"
                      className="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-opacity flex-shrink-0"
                    >
                      <XIcon size={11} />
                    </button>
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center w-full gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                >
                  <Trash2 size={11} />
                  Clear recent files
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Human-friendly time delta ("5m ago", "2d ago").  Plain JS to keep the
 * component dependency-light — no need to pull in date-fns for this.
 */
function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const seconds = Math.max(1, Math.floor((Date.now() - t) / 1000))
  if (seconds < 60)      return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)      return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)        return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30)         return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12)       return `${months}mo`
  return `${Math.floor(months / 12)}y`
}
