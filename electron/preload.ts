/**
 * Electron preload script.
 * Exposes a narrow, vetted API to the renderer via contextBridge.
 * The renderer NEVER gets Node, fs, or full IPC access.
 */

import { contextBridge, ipcRenderer } from 'electron'

interface SaveArgs {
  suggestedName: string
  mimeType:      string
  content:       string | ArrayBuffer
}

interface SaveResult {
  canceled: boolean
  filePath?: string
  reason?:   string
  message?:  string
}

interface OpenArgs {
  extensions: string[]
}

interface OpenResult {
  canceled: boolean
  filePath?: string
  content?:  string
  reason?:   string
  message?:  string
}

interface ReadArgs {
  filePath:            string
  allowedExtensions?:  string[]
}

interface ReadResult {
  canceled: boolean
  filePath?: string
  content?:  string
  reason?:   string
  message?:  string
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform:   process.platform,
  saveFile:   (args: SaveArgs): Promise<SaveResult> =>
                ipcRenderer.invoke('dialog:save', args),
  openFile:   (args: OpenArgs): Promise<OpenResult> =>
                ipcRenderer.invoke('dialog:open', args),
  readFile:   (args: ReadArgs): Promise<ReadResult> =>
                ipcRenderer.invoke('file:read', args),
})
