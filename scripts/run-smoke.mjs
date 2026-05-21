/**
 * Smoke-test runner.
 *
 * Discovers every `scripts/*-smoke.mjs` file, runs it under
 * `node --experimental-strip-types`, and exits non-zero if any of them
 * fail.  Used by CI (`npm run test:smoke`) and convenient for local runs.
 *
 * We intentionally run each script in a separate child process so a hang or
 * crash in one doesn't take the rest with it.
 */
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SKIP = new Set([
  // run-smoke.mjs is this script itself; never include it.
  path.basename(fileURLToPath(import.meta.url)),
])

const files = (await readdir(__dirname))
  .filter(f => f.endsWith('-smoke.mjs') && !SKIP.has(f))
  .sort()

if (files.length === 0) {
  console.log('No smoke tests to run.')
  process.exit(0)
}

let failed = 0
for (const file of files) {
  const rel = path.join('scripts', file)
  console.log(`\n=== ${rel} ===`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', rel], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('close', (c) => resolve(c ?? 1))
    child.on('error', () => resolve(1))
  })
  if (code !== 0) {
    failed++
    console.error(`✗ ${rel} exited with code ${code}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} smoke test(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${files.length} smoke test(s) passed.`)
