/**
 * File I/O using the File System Access API (Chromium / Electron).
 * Falls back to programmatic anchor-download when the API is unavailable.
 */

export async function saveFile(content: string, filename: string, mimeType = 'application/xml'): Promise<void> {
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
  } else {
    // Fallback: anchor download
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

export async function openFile(accept = '.bpmn,.xml'): Promise<{ name: string; content: string } | null> {
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
      return { name: file.name, content }
    } catch (err) {
      // User cancelled or API error
      if ((err as { name?: string }).name === 'AbortError') return null
      throw err
    }
  } else {
    // Fallback: hidden input
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        const content = await file.text()
        resolve({ name: file.name, content })
      }
      input.oncancel = () => resolve(null)
      input.click()
    })
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
