// Build cross-platform app icons from build/icon.svg.
//
// Outputs:
//   build/icon.png    1024×1024  (Linux + electron-builder fallback)
//   build/icon.ico    multi-res  (Windows)
//   build/icon.icns   multi-res  (macOS)
//   build/icons/      individual PNG sizes (handy for previews)
//
// Run with:  npm run icons:build
// Or:        node --experimental-strip-types scripts/build-icons.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

const ROOT       = process.cwd()
const SRC_SVG    = path.join(ROOT, 'build', 'icon.svg')
const OUT_PNG    = path.join(ROOT, 'build', 'icon.png')
const OUT_ICO    = path.join(ROOT, 'build', 'icon.ico')
const OUT_ICNS   = path.join(ROOT, 'build', 'icon.icns')
const OUT_DIR    = path.join(ROOT, 'build', 'icons')

// Sizes useful for preview / debugging.  electron-builder synthesizes
// platform-required sizes from the multi-res .icns / .ico itself, so the
// individual PNGs aren't strictly needed at build time.
const PREVIEW_SIZES = [16, 32, 64, 128, 256, 512, 1024]

async function renderPng(svgString, width) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: false },
  })
  return resvg.render().asPng()
}

async function main() {
  const svg = await fs.readFile(SRC_SVG, 'utf8')
  await fs.mkdir(OUT_DIR, { recursive: true })

  // Master 1024 PNG — the source for everything downstream.
  console.log(`→ rendering ${path.basename(SRC_SVG)} @ 1024×1024`)
  const master = await renderPng(svg, 1024)
  await fs.writeFile(OUT_PNG, master)
  console.log(`  ✓ ${path.relative(ROOT, OUT_PNG)} (${(master.length / 1024).toFixed(1)} KB)`)

  // Preview sizes
  for (const size of PREVIEW_SIZES) {
    if (size === 1024) continue
    const png = await renderPng(svg, size)
    const out = path.join(OUT_DIR, `icon-${size}.png`)
    await fs.writeFile(out, png)
    console.log(`  ✓ ${path.relative(ROOT, out)} (${(png.length / 1024).toFixed(1)} KB)`)
  }

  // ICO (Windows) — png2icons embeds multiple sizes itself
  console.log('→ building Windows .ico')
  const ico = png2icons.createICO(master, png2icons.BILINEAR, 0, false)
  if (!ico) throw new Error('Failed to build .ico')
  await fs.writeFile(OUT_ICO, ico)
  console.log(`  ✓ ${path.relative(ROOT, OUT_ICO)} (${(ico.length / 1024).toFixed(1)} KB)`)

  // ICNS (macOS) — png2icons handles the multi-image container
  console.log('→ building macOS .icns')
  const icns = png2icons.createICNS(master, png2icons.BILINEAR, 0)
  if (!icns) throw new Error('Failed to build .icns')
  await fs.writeFile(OUT_ICNS, icns)
  console.log(`  ✓ ${path.relative(ROOT, OUT_ICNS)} (${(icns.length / 1024).toFixed(1)} KB)`)

  console.log('\nAll icons generated.')
}

main().catch(err => {
  console.error('Icon build failed:', err)
  process.exit(1)
})
