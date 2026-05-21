/**
 * PDF export — diagram only.
 *
 * Produces a single-page PDF that contains just the BPMN diagram, sized to
 * the diagram's aspect ratio. Equivalent to the PNG export, but in PDF.
 */

import jsPDF from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'

export interface PdfExportOptions {
  /** SVG markup of the diagram, as returned by bpmn-js saveSVG. */
  svg: string
}

const MARGIN = 24       // pt — small breathing room around the diagram
const MAX_W  = 2400     // pt — cap absurdly wide diagrams
const MAX_H  = 1800     // pt — cap absurdly tall diagrams

/** Parse SVG width / height (or viewBox) for proper scaling. */
function getSvgDimensions(svgString: string): { width: number; height: number } {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(svgString, 'image/svg+xml')
  const svg    = doc.documentElement as unknown as SVGSVGElement

  const widthAttr  = svg.getAttribute('width')
  const heightAttr = svg.getAttribute('height')
  const viewBox    = svg.getAttribute('viewBox')

  let width  = parseFloat(widthAttr  ?? '0')
  let height = parseFloat(heightAttr ?? '0')

  if ((!width || !height) && viewBox) {
    const parts = viewBox.split(/\s+/).map(Number)
    if (parts.length === 4) {
      width  = width  || parts[2]
      height = height || parts[3]
    }
  }
  return { width: width || 800, height: height || 600 }
}

/** Rasterize SVG → PNG data URL as a fallback. */
async function rasterizeSvgToPng(svgString: string, w: number, h: number): Promise<string | null> {
  try {
    const scale  = 2
    const canvas = document.createElement('canvas')
    canvas.width  = Math.ceil(w * scale)
    canvas.height = Math.ceil(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve()
        img.onerror = (e) => reject(new Error(String(e)))
        img.src = url
      })
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.warn('SVG rasterization failed:', err)
    return null
  }
}

/**
 * Build a PDF containing only the diagram, returned as a Blob.
 */
export async function generatePdf(opts: PdfExportOptions): Promise<Blob> {
  const { width: nativeW, height: nativeH } = getSvgDimensions(opts.svg)

  // Scale down if the diagram is enormous, preserving aspect ratio
  const scale = Math.min(1, MAX_W / nativeW, MAX_H / nativeH)
  const drawW = nativeW * scale
  const drawH = nativeH * scale

  // Page dimensions = diagram + margin on each side
  const pageW = drawW + 2 * MARGIN
  const pageH = drawH + 2 * MARGIN

  const orientation: 'portrait' | 'landscape' = pageW >= pageH ? 'landscape' : 'portrait'

  const doc = new jsPDF({
    unit:        'pt',
    format:      [pageW, pageH],
    orientation,
    compress:    true,
  })

  // White background to match PNG export
  doc.setFillColor('#ffffff')
  doc.rect(0, 0, pageW, pageH, 'F')

  // Embed SVG offscreen so svg2pdf can read it
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left     = '-99999px'
  host.style.top      = '-99999px'
  host.innerHTML      = opts.svg
  document.body.appendChild(host)

  try {
    const svgEl = host.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) throw new Error('No <svg> element found in export')

    await svg2pdf(svgEl, doc, {
      x:      MARGIN,
      y:      MARGIN,
      width:  drawW,
      height: drawH,
    })
  } catch (err) {
    // Vector embedding failed — fall back to a rasterized PNG
    console.warn('Vector SVG embed failed, falling back to PNG:', err)
    const png = await rasterizeSvgToPng(opts.svg, drawW, drawH)
    if (png) {
      doc.addImage(png, 'PNG', MARGIN, MARGIN, drawW, drawH)
    } else {
      throw new Error('Could not render diagram to PDF')
    }
  } finally {
    host.remove()
  }

  return doc.output('blob')
}
