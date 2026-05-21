/**
 * File I/O.
 *
 * Three backends, picked in order of availability:
 *   1. Electron bridge (window.electronAPI) — uses native dialogs
 *   2. File System Access API (Chromium browsers)
 *   3. Anchor-download fallback (any browser)
 *
 * The renderer never touches Node fs directly. In Electron, file I/O is
 * tunneled through the IPC bridge defined in `electron/preload.ts`.
 */

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer()
}

export interface SaveResult {
  /** Absolute filesystem path, when known (Electron / FS Access API). */
  path: string
  /** The basename that was actually used.  Always set. */
  name: string
}

export async function saveFile(
  content: string | Blob,
  filename: string,
  mimeType = 'application/xml',
): Promise<SaveResult> {
  // ── Electron path ────────────────────────────────────────────────────────
  if (window.electronAPI?.isElectron) {
    const payload: string | ArrayBuffer = content instanceof Blob
      ? await blobToArrayBuffer(content)
      : content
    const result = await window.electronAPI.saveFile({
      suggestedName: filename,
      mimeType,
      content: payload,
    })
    if (result.canceled && result.reason === 'write_failed') {
      throw new Error(result.message ?? 'Save failed')
    }
    const path = result.filePath ?? ''
    return {
      path,
      name: path ? (path.split(/[\\/]/).pop() ?? filename) : filename,
    }
  }

  // ── File System Access API path ──────────────────────────────────────────
  if ('showSaveFilePicker' in window) {
    const extension = filename.split('.').pop() ?? 'bpmn'
    const handle = await (window as Window & typeof globalThis & {
      showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: extension.toUpperCase() + ' file',
          accept: { [mimeType]: ['.' + extension] },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    // FS Access API gives us a name but no real path
    return { path: '', name: handle.name ?? filename }
  }

  // ── Anchor-download fallback ─────────────────────────────────────────────
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return { path: '', name: filename }
}

export interface OpenedFile {
  name:    string
  content: string
  /** Absolute filesystem path; empty in browser mode. */
  path:    string
}

export async function openFile(accept = '.bpmn,.xml'): Promise<OpenedFile | null> {
  // ── Electron path ────────────────────────────────────────────────────────
  if (window.electronAPI?.isElectron) {
    const extensions = accept.split(',').map(e => e.trim().replace(/^\./, ''))
    const result = await window.electronAPI.openFile({ extensions })
    if (result.canceled || !result.filePath || result.content === undefined) {
      return null
    }
    return {
      name:    result.filePath.split(/[\\/]/).pop() ?? 'diagram.bpmn',
      content: result.content,
      path:    result.filePath,
    }
  }

  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as Window & typeof globalThis & {
        showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>
      }).showOpenFilePicker({
        types: [
          {
            description: 'BPMN files',
            accept: { 'application/xml': ['.bpmn', '.xml'] },
          },
        ],
        multiple: false,
      })
      const file = await handle.getFile()
      const content = await file.text()
      return { name: file.name, content, path: '' }
    } catch (err) {
      // User cancelled or API error
      if ((err as { name?: string }).name === 'AbortError') return null
      throw err
    }
  } else {
    // Fallback: hidden input
    return new Promise<OpenedFile | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        const content = await file.text()
        resolve({ name: file.name, content, path: '' })
      }
      input.oncancel = () => resolve(null)
      input.click()
    })
  }
}

/**
 * Read a file by absolute filesystem path.  Used by the Recent Files menu so
 * the user can re-open without going through the OS dialog.  Only works in
 * Electron — browser builds have no concept of arbitrary paths.
 */
export async function readFileByPath(
  filePath: string,
  allowedExtensions?: string[],
): Promise<OpenedFile | null> {
  if (!window.electronAPI?.isElectron) {
    throw new Error('Recent files can only be reopened directly in the desktop app.')
  }
  const result = await window.electronAPI.readFile({ filePath, allowedExtensions })
  if (result.canceled || !result.filePath || result.content === undefined) {
    if (result.reason === 'not_found')          throw new Error('File no longer exists at that path.')
    if (result.reason === 'permission_denied')  throw new Error('Permission denied reading that file.')
    if (result.reason === 'extension_not_allowed') throw new Error('File extension is not allowed.')
    if (result.reason === 'file_too_large')     throw new Error('File is too large to open.')
    if (result.message)                         throw new Error(result.message)
    return null
  }
  return {
    name:    result.filePath.split(/[\\/]/).pop() ?? 'file',
    content: result.content,
    path:    result.filePath,
  }
}

export async function saveSvgAsPng(svgString: string, filename: string): Promise<void> {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.width * 2
  canvas.height = img.height * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, img.width, img.height)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)

  canvas.toBlob((pngBlob) => {
    if (!pngBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(pngBlob)
    a.download = filename
    a.click()
  }, 'image/png')
}
