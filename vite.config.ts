import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import { readFileSync } from 'node:fs'

// Toggle Electron build via env: ELECTRON=1 npm run build
const isElectronBuild = process.env.ELECTRON === '1' || process.env.ELECTRON === 'true'

// Inject the package.json version as a build-time constant so the renderer
// can stamp project files with the version that wrote them.  Read here
// rather than via `import pkg from "../package.json" assert {...}` so we
// don't have to plumb assertions through tsconfig.
const pkgVersion = (() => {
  try {
    const raw = readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
    return JSON.parse(raw).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isElectronBuild
      ? [electron({
          main:    { entry: 'electron/main.ts'    },
          preload: { input: 'electron/preload.ts' },
          renderer: undefined,
        })]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  base: isElectronBuild ? './' : '/',  // file:// loads need relative paths
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
