/**
 * Recent files tracker.
 *
 * Stores the most-recently opened/saved files in localStorage so the toolbar
 * can offer a quick-pick list.  We persist only file *metadata* (path, name,
 * kind, timestamp); the file contents themselves stay on disk.
 *
 * On Electron we have a real filesystem path and can re-open recents on
 * click via the `file:read` IPC handler.  In a plain browser environment
 * the `path` is empty and recents are informational only — the user must
 * use the regular Open dialog to pick the file again.
 */

const LS_KEY        = 'bpmnstudio.recentFiles.v1'
const MAX_RECENT    = 10
const MAX_PATH_LEN  = 4096

export type RecentFileKind = 'project' | 'bpmn'

export interface RecentFile {
  /** Display name (typically the basename). */
  name:       string
  /** Absolute filesystem path; empty in browser mode. */
  path:       string
  kind:       RecentFileKind
  /** ISO-8601 timestamp of last open/save. */
  openedAt:   string
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

function readAll(): RecentFile[] {
  if (typeof localStorage === 'undefined') return []
  const raw = safe(() => localStorage.getItem(LS_KEY), null)
  if (!raw) return []
  const parsed = safe<unknown>(() => JSON.parse(raw), null)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isValidRecentFile).slice(0, MAX_RECENT)
}

function writeAll(list: RecentFile[]): void {
  if (typeof localStorage === 'undefined') return
  safe(() => localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_RECENT))), undefined)
}

function isValidRecentFile(x: unknown): x is RecentFile {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.name === 'string' && r.name.length > 0 && r.name.length < 256 &&
    typeof r.path === 'string' && r.path.length < MAX_PATH_LEN &&
    (r.kind === 'project' || r.kind === 'bpmn') &&
    typeof r.openedAt === 'string'
  )
}

/** Returns the current list (most-recent first). */
export function listRecents(): RecentFile[] {
  return readAll()
}

/** Bumps a file to the top of the list (or inserts it). */
export function recordRecent(input: Omit<RecentFile, 'openedAt'> & { openedAt?: string }): void {
  const entry: RecentFile = {
    name:     input.name.slice(0, 255),
    path:     input.path.slice(0, MAX_PATH_LEN),
    kind:     input.kind,
    openedAt: input.openedAt ?? new Date().toISOString(),
  }
  if (!isValidRecentFile(entry)) return

  const existing = readAll()
  // Dedupe: prefer path equality; fall back to (kind, name) when path is empty
  const dedup = existing.filter((e) => {
    if (entry.path && e.path) return e.path !== entry.path
    return !(e.kind === entry.kind && e.name === entry.name)
  })
  writeAll([entry, ...dedup])
}

/** Removes a single entry by path (or by name when path is empty). */
export function removeRecent(target: Pick<RecentFile, 'path' | 'name'>): void {
  const existing = readAll()
  const next = existing.filter((e) => {
    if (target.path && e.path) return e.path !== target.path
    return e.name !== target.name
  })
  writeAll(next)
}

/** Empties the recents list. */
export function clearRecents(): void {
  writeAll([])
}
