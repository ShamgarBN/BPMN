/**
 * Visual cleanup pass — runs on a laid-out LayoutScene before serialization.
 *
 * This is the diagram-level equivalent of the LLM verification pass on the
 * parsed model: a second, deterministic check that catches and repairs
 * visual problems the layout heuristics may have missed.
 *
 * Checks (in order, repeated until no fixes are applied or maxIterations hit):
 *   1. Edge segment passes through a non-endpoint shape  → reroute via gutter
 *   2. Edge segment lies within 6 px of a swimlane line   → shift into in-lane gutter
 *   3. Two parallel segments overlap on the same axis     → stagger by 8–16 px
 *   4. Sequence-flow label collides with a shape          → emit explicit label DI
 *
 * The fifth historical concern — long task names being clipped — is handled
 * at layout time in `computeLayoutScene` by widening tasks whose names
 * exceed the default width.
 */

import type {
  LayoutScene,
  SceneEdge,
  SceneShape,
  Pt,
  Bounds,
} from './bpmnLayoutService'

export interface CleanupReport {
  /** Iterations actually run (≤ maxIterations). */
  iterations: number
  /** Number of issues detected and fixed across all iterations. */
  fixed: number
  /** Issues still present after the final pass. */
  unresolved: number
  /** Per-check breakdown. */
  byCheck: {
    crossesShape:    { found: number; fixed: number }
    onLaneBoundary:  { found: number; fixed: number }
    parallelOverlap: { found: number; fixed: number }
    labelOnShape:    { found: number; fixed: number }
  }
}

const MAX_ITERATIONS    = 6
const SHAPE_INSET       = 2     // a segment counts as crossing only if it goes ≥2px inside a shape
const REROUTE_CLEARANCE = 10    // when rerouting, leave this much breathing room from any shape edge
const BOUNDARY_THRESH   = 6     // segment Y within this many px of a lane line is "on it"
const MIN_BOUNDARY_GAP  = 12    // shift far enough away that the line is unambiguous
const PARALLEL_OVERLAP  = 40    // overlap span (in px) before two parallel segments are flagged
const PARALLEL_NEAR     = 1.5   // axes within this many px count as collinear
const STAGGER_STEP      = 9     // px to shift one segment when staggering
const LABEL_W_PER_CHAR  = 6.5   // bpmn-js label glyph width estimate
const LABEL_H           = 14    // bpmn-js label height
const LABEL_MIN_W       = 30
const LABEL_MAX_W       = 110

// ── Public API ─────────────────────────────────────────────────────────────────
export function runVisualCleanup(scene: LayoutScene): {
  scene:  LayoutScene
  report: CleanupReport
} {
  // Operate on a deep clone so we never mutate the caller's input.
  const s = cloneScene(scene)

  const report: CleanupReport = {
    iterations: 0,
    fixed:      0,
    unresolved: 0,
    byCheck: {
      crossesShape:    { found: 0, fixed: 0 },
      onLaneBoundary:  { found: 0, fixed: 0 },
      parallelOverlap: { found: 0, fixed: 0 },
      labelOnShape:    { found: 0, fixed: 0 },
    },
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    report.iterations = iter + 1
    let changed = 0

    changed += fixEdgesCrossingShapes(s, report)
    changed += fixEdgesOnLaneBoundaries(s, report)
    changed += fixParallelSegmentOverlap(s, report)
    changed += fixLabelsOnShapes(s, report)

    if (changed === 0) break
  }

  // Final unresolved count: re-run detection without applying fixes.
  report.unresolved =
    countCrossesShape(s)
    + countOnLaneBoundary(s)
    + countParallelOverlap(s)

  return { scene: s, report }
}

// ── Check 1: edge segment crosses a non-endpoint shape ────────────────────────
function fixEdgesCrossingShapes(s: LayoutScene, report: CleanupReport): number {
  let fixedCount = 0
  for (const edge of s.edges) {
    let attempts = 0
    while (attempts < 4) {
      const blocker = findShapeBlockingEdge(edge, s.shapes)
      if (!blocker) break
      report.byCheck.crossesShape.found++
      const fixed = rerouteEdgeAroundShape(edge, blocker, s)
      if (!fixed) break
      report.byCheck.crossesShape.fixed++
      report.fixed++
      fixedCount++
      attempts++
    }
  }
  return fixedCount
}

function countCrossesShape(s: LayoutScene): number {
  let n = 0
  for (const edge of s.edges) {
    if (findShapeBlockingEdge(edge, s.shapes)) n++
  }
  return n
}

function findShapeBlockingEdge(edge: SceneEdge, shapes: SceneShape[]): SceneShape | null {
  const wp = edge.waypoints
  for (let i = 0; i < wp.length - 1; i++) {
    const p1 = wp[i]
    const p2 = wp[i + 1]
    for (const sh of shapes) {
      if (sh.id === edge.sourceId || sh.id === edge.targetId) continue
      if (segmentEntersBounds(p1, p2, sh, SHAPE_INSET)) return sh
    }
  }
  return null
}

/**
 * True if a (horizontal or vertical) segment p1→p2 passes through the inside
 * of `b`. We require the segment to enter the interior by at least `inset`
 * pixels on each side so a flow that grazes a corner isn't a false positive.
 */
function segmentEntersBounds(p1: Pt, p2: Pt, b: Bounds, inset: number): boolean {
  const left   = b.x + inset
  const right  = b.x + b.w - inset
  const top    = b.y + inset
  const bottom = b.y + b.h - inset
  if (right <= left || bottom <= top) return false

  if (Math.abs(p1.y - p2.y) < 0.5) {
    // Horizontal segment
    const y = p1.y
    if (y < top || y > bottom) return false
    const lo = Math.min(p1.x, p2.x)
    const hi = Math.max(p1.x, p2.x)
    return hi > left && lo < right
  }
  if (Math.abs(p1.x - p2.x) < 0.5) {
    // Vertical segment
    const x = p1.x
    if (x < left || x > right) return false
    const lo = Math.min(p1.y, p2.y)
    const hi = Math.max(p1.y, p2.y)
    return hi > top && lo < bottom
  }
  // Non-orthogonal segments shouldn't appear in our layout, but bail safely.
  return false
}

/**
 * Repair an edge that passes through a shape by rerouting around it.
 *
 * Strategies, in order:
 *  - Push the offending vertical bend further into the column gap (away from
 *    the blocker), if a column-gap bend exists.
 *  - Push the offending horizontal segment into a different gutter (above or
 *    below the blocker, choosing the side with more clearance).
 */
function rerouteEdgeAroundShape(edge: SceneEdge, blocker: SceneShape, scene: LayoutScene): boolean {
  const wp = edge.waypoints
  for (let i = 0; i < wp.length - 1; i++) {
    const p1 = wp[i]
    const p2 = wp[i + 1]
    if (!segmentEntersBounds(p1, p2, blocker, SHAPE_INSET)) continue

    // Vertical segment crossing the blocker → shift X. Because adjacent
    // horizontal segments share endpoints with this one, updating both
    // endpoints of the vertical segment automatically extends the adjacent
    // horizontals to the new X.
    if (Math.abs(p1.x - p2.x) < 0.5) {
      const x = p1.x
      const distRight = blocker.x + blocker.w - x
      const distLeft  = x - blocker.x
      const dirRight  = distRight < distLeft
      const target = dirRight
        ? blocker.x + blocker.w + 24
        : blocker.x - 24
      const newX = snapToNearestGap(target, scene.metadata.columnGaps, x)
      if (Math.abs(newX - x) < 1) return false
      wp[i].x     = newX
      wp[i + 1].x = newX
      return true
    }

    // Horizontal segment crossing the blocker → shift Y to a gutter that
    // doesn't overlap any shape with the same X range.
    if (Math.abs(p1.y - p2.y) < 0.5) {
      const newY = findClearGutterY(
        Math.min(p1.x, p2.x),
        Math.max(p1.x, p2.x),
        p1.y,
        scene,
        edge,
      )
      if (newY === null || Math.abs(newY - p1.y) < 1) return false
      wp[i].y     = newY
      wp[i + 1].y = newY
      return true
    }
  }
  return false
}

/**
 * Find a clear horizontal Y at which a segment from x1..x2 doesn't pass
 * through any shape. Prefers the in-lane gutter zones (between elements and
 * the lane boundary), and avoids riding on a lane boundary.
 */
function findClearGutterY(
  x1: number,
  x2: number,
  currentY: number,
  scene: LayoutScene,
  edge: SceneEdge,
): number | null {
  const lo = Math.min(x1, x2)
  const hi = Math.max(x1, x2)

  // Don't escape the pool — keep candidates inside the canvas band.
  const minY = scene.metadata.laneTops[0] - 20    // a touch above the pool top
  const maxY = scene.metadata.poolBottom + 80     // below pool for backward routes

  const candidates: number[] = []
  for (let dy = 8; dy <= 100; dy += 8) {
    candidates.push(currentY - dy)
    candidates.push(currentY + dy)
  }

  for (const y of candidates) {
    if (y < minY || y > maxY) continue
    if (isOnLaneBoundary(y, scene.metadata.laneTops, scene.metadata.poolBottom)) {
      continue
    }
    if (segmentXrangeCrossesAnyShape(lo, hi, y, scene.shapes, edge.sourceId, edge.targetId)) {
      continue
    }
    return y
  }
  return null
}

/**
 * True if a horizontal segment at `y` from `lo`..`hi` is within `pad` pixels
 * of any shape (other than source/target). Used when picking a new position
 * for a segment, so the default pad is `REROUTE_CLEARANCE` — fresh routing
 * should keep visible breathing room around every shape, not just narrowly
 * avoid interior crossings.
 */
function segmentXrangeCrossesAnyShape(
  lo: number, hi: number, y: number,
  shapes: SceneShape[],
  exceptSrc: string, exceptTgt: string,
  pad: number = REROUTE_CLEARANCE,
): boolean {
  for (const s of shapes) {
    if (s.id === exceptSrc || s.id === exceptTgt) continue
    if (y < s.y - pad || y > s.y + s.h + pad) continue
    if (s.x + s.w < lo - pad) continue
    if (s.x > hi + pad) continue
    return true
  }
  return false
}

function verticalCrossesAnyShape(
  x: number, lo: number, hi: number,
  shapes: SceneShape[],
  exceptSrc: string, exceptTgt: string,
  pad: number = REROUTE_CLEARANCE,
): boolean {
  for (const s of shapes) {
    if (s.id === exceptSrc || s.id === exceptTgt) continue
    if (x < s.x - pad || x > s.x + s.w + pad) continue
    if (s.y + s.h < lo - pad) continue
    if (s.y > hi + pad) continue
    return true
  }
  return false
}

function snapToNearestGap(target: number, gaps: number[], fallback: number): number {
  if (!gaps.length) return target
  let best = gaps[0]
  let bestDist = Math.abs(gaps[0] - target)
  for (const g of gaps) {
    const d = Math.abs(g - target)
    if (d < bestDist) { best = g; bestDist = d }
  }
  // Only accept the snap if it doesn't undo the move
  if (Math.abs(best - fallback) < 5) return target
  return best
}

// ── Check 2: edge segment riding on a swimlane boundary ───────────────────────
function fixEdgesOnLaneBoundaries(s: LayoutScene, report: CleanupReport): number {
  let fixedCount = 0
  const { laneTops, poolBottom } = s.metadata
  for (const edge of s.edges) {
    const wp = edge.waypoints
    for (let i = 0; i < wp.length - 1; i++) {
      const p1 = wp[i]
      const p2 = wp[i + 1]
      if (Math.abs(p1.y - p2.y) > 0.5) continue          // not horizontal
      if (Math.abs(p1.x - p2.x) < 5) continue            // tiny stub
      const y = p1.y
      const boundary = nearbyLaneBoundary(y, laneTops, poolBottom, BOUNDARY_THRESH)
      if (boundary === null) continue

      report.byCheck.onLaneBoundary.found++
      // Shift the segment away from the boundary by MIN_BOUNDARY_GAP, in
      // whichever direction gives more in-lane clearance and doesn't cross a shape.
      const above = boundary - MIN_BOUNDARY_GAP
      const below = boundary + MIN_BOUNDARY_GAP
      const tryFirst = (y < boundary) ? above : below
      const trySecond = tryFirst === above ? below : above

      const lo = Math.min(p1.x, p2.x)
      const hi = Math.max(p1.x, p2.x)
      let chosen: number | null = null
      for (const cand of [tryFirst, trySecond]) {
        // Don't push outside the pool
        if (cand < laneTops[0] + 4 || cand > poolBottom - 4) continue
        if (segmentXrangeCrossesAnyShape(lo, hi, cand, s.shapes, edge.sourceId, edge.targetId)) continue
        if (isOnLaneBoundary(cand, laneTops, poolBottom)) continue
        chosen = cand
        break
      }
      if (chosen === null) continue
      wp[i].y     = chosen
      wp[i + 1].y = chosen
      report.byCheck.onLaneBoundary.fixed++
      report.fixed++
      fixedCount++
    }
  }
  return fixedCount
}

function countOnLaneBoundary(s: LayoutScene): number {
  let n = 0
  const { laneTops, poolBottom } = s.metadata
  for (const edge of s.edges) {
    const wp = edge.waypoints
    for (let i = 0; i < wp.length - 1; i++) {
      const p1 = wp[i]
      const p2 = wp[i + 1]
      if (Math.abs(p1.y - p2.y) > 0.5) continue
      if (Math.abs(p1.x - p2.x) < 5) continue
      if (nearbyLaneBoundary(p1.y, laneTops, poolBottom, BOUNDARY_THRESH) !== null) n++
    }
  }
  return n
}

function nearbyLaneBoundary(
  y: number, laneTops: number[], poolBottom: number, thresh: number,
): number | null {
  // Lane boundaries are the inner lines between lanes (not the pool top or bottom).
  for (let i = 1; i < laneTops.length; i++) {
    const b = laneTops[i]
    if (Math.abs(y - b) <= thresh) return b
  }
  if (Math.abs(y - poolBottom) <= thresh) return poolBottom
  return null
}

function isOnLaneBoundary(y: number, laneTops: number[], poolBottom: number): boolean {
  return nearbyLaneBoundary(y, laneTops, poolBottom, 3) !== null
}

// ── Check 3: parallel segments overlapping on the same axis ───────────────────
interface SegRef {
  edge: SceneEdge
  segIdx: number
  axis: 'h' | 'v'
  fixedCoord: number
  rangeLo: number
  rangeHi: number
}

function collectSegments(scene: LayoutScene): SegRef[] {
  const out: SegRef[] = []
  for (const edge of scene.edges) {
    const wp = edge.waypoints
    for (let i = 0; i < wp.length - 1; i++) {
      const p1 = wp[i]
      const p2 = wp[i + 1]
      if (Math.abs(p1.y - p2.y) < 0.5 && Math.abs(p1.x - p2.x) >= 5) {
        out.push({
          edge,
          segIdx:    i,
          axis:      'h',
          fixedCoord: p1.y,
          rangeLo:   Math.min(p1.x, p2.x),
          rangeHi:   Math.max(p1.x, p2.x),
        })
      } else if (Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p1.y - p2.y) >= 5) {
        out.push({
          edge,
          segIdx:    i,
          axis:      'v',
          fixedCoord: p1.x,
          rangeLo:   Math.min(p1.y, p2.y),
          rangeHi:   Math.max(p1.y, p2.y),
        })
      }
    }
  }
  return out
}

function fixParallelSegmentOverlap(s: LayoutScene, report: CleanupReport): number {
  const segs = collectSegments(s)
  let fixedCount = 0

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]
      const b = segs[j]
      if (a.axis !== b.axis) continue
      if (a.edge === b.edge) continue
      if (Math.abs(a.fixedCoord - b.fixedCoord) > PARALLEL_NEAR) continue

      const overlap = Math.min(a.rangeHi, b.rangeHi) - Math.max(a.rangeLo, b.rangeLo)
      if (overlap < PARALLEL_OVERLAP) continue

      report.byCheck.parallelOverlap.found++

      // Shift the segment that has the higher-indexed edge ID by STAGGER_STEP.
      const target = b
      const newCoord = target.fixedCoord + chooseStaggerDirection(target)
      if (target.axis === 'h') {
        if (segmentXrangeCrossesAnyShape(
          target.rangeLo, target.rangeHi, newCoord, s.shapes,
          target.edge.sourceId, target.edge.targetId,
        )) continue
        if (isOnLaneBoundary(newCoord, s.metadata.laneTops, s.metadata.poolBottom)) continue
        target.edge.waypoints[target.segIdx].y     = newCoord
        target.edge.waypoints[target.segIdx + 1].y = newCoord
      } else {
        // Vertical: the new X must not slice through any shape's interior
        if (verticalCrossesAnyShape(
          newCoord, target.rangeLo, target.rangeHi, s.shapes,
          target.edge.sourceId, target.edge.targetId,
        )) continue
        target.edge.waypoints[target.segIdx].x     = newCoord
        target.edge.waypoints[target.segIdx + 1].x = newCoord
      }
      target.fixedCoord = newCoord
      report.byCheck.parallelOverlap.fixed++
      report.fixed++
      fixedCount++
    }
  }
  return fixedCount
}

function chooseStaggerDirection(seg: SegRef): number {
  // Alternate up/down by edge id hash so two flows in a group separate cleanly
  let h = 0
  for (let i = 0; i < seg.edge.id.length; i++) h = (h * 31 + seg.edge.id.charCodeAt(i)) | 0
  return ((h & 1) ? +1 : -1) * STAGGER_STEP
}

function countParallelOverlap(s: LayoutScene): number {
  const segs = collectSegments(s)
  let n = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]
      const b = segs[j]
      if (a.axis !== b.axis) continue
      if (a.edge === b.edge) continue
      if (Math.abs(a.fixedCoord - b.fixedCoord) > PARALLEL_NEAR) continue
      const overlap = Math.min(a.rangeHi, b.rangeHi) - Math.max(a.rangeLo, b.rangeLo)
      if (overlap >= PARALLEL_OVERLAP) n++
    }
  }
  return n
}

// ── Check 4: edge labels covering shapes ──────────────────────────────────────
function fixLabelsOnShapes(
  s: LayoutScene,
  report: CleanupReport,
): number {
  let fixedCount = 0
  for (const edge of s.edges) {
    if (!edge.labelText) continue
    if (edge.label) continue   // already explicitly placed by a previous iteration

    const labelBox = predictLabelBox(edge, edge.labelText)
    if (!labelBox) continue
    const blocker = s.shapes.find(sh =>
      sh.id !== edge.sourceId &&
      sh.id !== edge.targetId &&
      rectsOverlap(labelBox, sh, 1),
    )
    if (!blocker) continue

    report.byCheck.labelOnShape.found++

    // Try shifting the label up, down, left, right until clear of every shape.
    const offsets: Array<[number, number]> = [
      [0, -LABEL_H - 4],   // above
      [0,  LABEL_H + 4],   // below
      [-labelBox.w - 6, 0],  // left
      [ labelBox.w + 6, 0],  // right
    ]
    let placed = false
    for (const [dx, dy] of offsets) {
      const candidate: Bounds = { x: labelBox.x + dx, y: labelBox.y + dy, w: labelBox.w, h: labelBox.h }
      const overlapsAny = s.shapes.some(sh =>
        sh.id !== edge.sourceId &&
        sh.id !== edge.targetId &&
        rectsOverlap(candidate, sh, 1),
      )
      if (!overlapsAny) {
        edge.label = candidate
        placed = true
        break
      }
    }
    if (placed) {
      report.byCheck.labelOnShape.fixed++
      report.fixed++
      fixedCount++
    }
  }
  return fixedCount
}

function predictLabelBox(edge: SceneEdge, text: string): Bounds | null {
  const wp = edge.waypoints
  if (wp.length < 2) return null
  // bpmn-js places the label at the geometric midpoint of the polyline.
  const mid = midpointOnPolyline(wp)
  if (!mid) return null
  const w = clamp(text.length * LABEL_W_PER_CHAR, LABEL_MIN_W, LABEL_MAX_W)
  return { x: mid.x - w / 2, y: mid.y - LABEL_H / 2, w, h: LABEL_H }
}

function midpointOnPolyline(wp: Pt[]): Pt | null {
  let total = 0
  for (let i = 0; i < wp.length - 1; i++) {
    total += distance(wp[i], wp[i + 1])
  }
  if (total === 0) return null
  let target = total / 2
  for (let i = 0; i < wp.length - 1; i++) {
    const segLen = distance(wp[i], wp[i + 1])
    if (target <= segLen) {
      const t = target / segLen
      return {
        x: wp[i].x + (wp[i + 1].x - wp[i].x) * t,
        y: wp[i].y + (wp[i + 1].y - wp[i].y) * t,
      }
    }
    target -= segLen
  }
  return wp[wp.length - 1]
}

function distance(a: Pt, b: Pt): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function rectsOverlap(a: Bounds, b: Bounds, margin: number): boolean {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w + margin > b.x &&
    a.y < b.y + b.h + margin &&
    a.y + a.h + margin > b.y
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// ── Deep clone ─────────────────────────────────────────────────────────────────
function cloneScene(scene: LayoutScene): LayoutScene {
  return {
    pool:  { ...scene.pool },
    lanes: scene.lanes.map(l => ({ ...l })),
    shapes: scene.shapes.map(sh => ({ ...sh })),
    edges: scene.edges.map(e => ({
      id:        e.id,
      sourceId:  e.sourceId,
      targetId:  e.targetId,
      waypoints: e.waypoints.map(p => ({ ...p })),
      label:     e.label ? { ...e.label } : undefined,
    })),
    metadata: {
      ...scene.metadata,
      columnCenters: [...scene.metadata.columnCenters],
      columnGaps:    [...scene.metadata.columnGaps],
      laneTops:      [...scene.metadata.laneTops],
    },
  }
}
