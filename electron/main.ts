/**
 * Electron main process for BPMN Studio.
 *
 * Hardening choices (per app security guidelines):
 *   - context isolation enabled, node integration disabled in the renderer
 *   - sandbox enabled
 *   - no remote module
 *   - external links open in the OS default browser, not in-app
 *   - all file I/O happens in the main process via IPC; renderer never gets fs access
 */

import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// In dev, Vite serves at localhost; in prod, we load the built index.html.
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST       = path.join(__dirname, '../dist')

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'BPMN Studio',
    width:  1400,
    height: 900,
    minWidth:  1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
    },
  })

  // Hardening: prevent navigation to external sites within the app window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    shell.openExternal(url)
  })

  // Hardening: open _blank links / window.open in the OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ── App menu ─────────────────────────────────────────────────────────────────

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About BPMN Studio',
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: 'About BPMN Studio',
              message: 'BPMN Studio',
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Build BPMN 2.0 process diagrams with guided forms or natural language. ' +
                'All data stays on your machine.',
              buttons: ['OK'],
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC: secure file I/O ─────────────────────────────────────────────────────
// Renderer cannot read/write the filesystem directly. It calls these handlers
// which validate inputs and use Electron's user-mediated dialogs.

ipcMain.handle(
  'dialog:save',
  async (_event, args: { suggestedName: string; mimeType: string; content: string | ArrayBuffer }) => {
    const { suggestedName, content } = args ?? {}
    if (typeof suggestedName !== 'string' || suggestedName.length > 255) {
      return { canceled: true, reason: 'invalid_name' }
    }
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: suggestedName })
      : await dialog.showSaveDialog({ defaultPath: suggestedName })
    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const buffer = content instanceof ArrayBuffer
        ? Buffer.from(content)
        : Buffer.from(String(content), 'utf8')
      await fs.writeFile(result.filePath, buffer)
      return { canceled: false, filePath: result.filePath }
    } catch (err) {
      return { canceled: true, reason: 'write_failed', message: (err as Error).message }
    }
  },
)

ipcMain.handle('dialog:open', async (_event, args: { extensions: string[] }) => {
  const ext = (args?.extensions ?? ['bpmn', 'xml']).map(e => e.replace(/^\./, ''))
  const win = BrowserWindow.getFocusedWindow()
  const openOpts = {
    properties: ['openFile' as const],
    filters: [{ name: 'BPMN files', extensions: ext }],
  }
  const result = win
    ? await dialog.showOpenDialog(win, openOpts)
    : await dialog.showOpenDialog(openOpts)
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  try {
    const filePath = result.filePaths[0]
    const content  = await fs.readFile(filePath, 'utf8')
    return { canceled: false, filePath, content }
  } catch (err) {
    return { canceled: true, reason: 'read_failed', message: (err as Error).message }
  }
})

// ── file:read ────────────────────────────────────────────────────────────────
// Read a known file path on behalf of the renderer (used by Recent Files).
//
// Hardening:
//   • path must be a non-empty string under MAX_PATH bytes
//   • extension must match one supplied by the renderer (allow-list)
//   • file size capped at MAX_BYTES; we stat() before reading so we never
//     buffer enormous files into memory
//   • paths are normalised but not sandboxed to a particular directory — the
//     user already authorised the original open via Electron's dialog, and
//     they retain full control of their own filesystem.

const MAX_PATH  = 4096
const MAX_BYTES = 50 * 1024 * 1024  // 50 MB

ipcMain.handle(
  'file:read',
  async (_event, args: { filePath: string; allowedExtensions?: string[] }) => {
    const filePath = typeof args?.filePath === 'string' ? args.filePath.trim() : ''
    if (!filePath || filePath.length > MAX_PATH) {
      return { canceled: true, reason: 'invalid_path' }
    }
    // Reject anything that smells like NUL injection or control bytes
    if (/[\u0000-\u001f]/.test(filePath)) {
      return { canceled: true, reason: 'invalid_path' }
    }

    const normalised = path.normalize(filePath)
    const ext = path.extname(normalised).replace(/^\./, '').toLowerCase()
    const allow = (args?.allowedExtensions ?? ['bpmn', 'xml', 'bpmnstudio', 'json'])
      .map((e) => e.replace(/^\./, '').toLowerCase())
    if (allow.length > 0 && !allow.includes(ext)) {
      return { canceled: true, reason: 'extension_not_allowed' }
    }

    try {
      const stat = await fs.stat(normalised)
      if (!stat.isFile()) {
        return { canceled: true, reason: 'not_a_file' }
      }
      if (stat.size > MAX_BYTES) {
        return { canceled: true, reason: 'file_too_large' }
      }
      const content = await fs.readFile(normalised, 'utf8')
      return { canceled: false, filePath: normalised, content }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { canceled: true, reason: 'not_found' }
      if (code === 'EACCES' || code === 'EPERM') return { canceled: true, reason: 'permission_denied' }
      return { canceled: true, reason: 'read_failed', message: (err as Error).message }
    }
  },
)

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow()
  buildMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Hardening: deny attempted creation of any new web contents we don't own
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
