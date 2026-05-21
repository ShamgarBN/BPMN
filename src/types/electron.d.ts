/**
 * Type declarations for the bridge API exposed by `electron/preload.ts`.
 * Available on `window.electronAPI` only when running in Electron.
 */

declare global {
  interface ElectronSaveArgs {
    suggestedName: string
    mimeType:      string
    content:       string | ArrayBuffer
  }

  interface ElectronSaveResult {
    canceled: boolean
    filePath?: string
    reason?:   string
    message?:  string
  }

  interface ElectronOpenArgs {
    extensions: string[]
  }

  interface ElectronOpenResult {
    canceled:  boolean
    filePath?: string
    content?:  string
    reason?:   string
    message?:  string
  }

  interface ElectronReadArgs {
    filePath:            string
    allowedExtensions?:  string[]
  }

  interface ElectronReadResult {
    canceled:  boolean
    filePath?: string
    content?:  string
    reason?:   string
    message?:  string
  }

  interface ElectronAPI {
    isElectron: true
    platform:   NodeJS.Platform
    saveFile:   (args: ElectronSaveArgs) => Promise<ElectronSaveResult>
    openFile:   (args: ElectronOpenArgs) => Promise<ElectronOpenResult>
    readFile:   (args: ElectronReadArgs) => Promise<ElectronReadResult>
  }

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
