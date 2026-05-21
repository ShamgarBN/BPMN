/**
 * Manual swimlane layout for BPMN diagrams.
 *
 * The pipeline is split in three stages so a post-layout visual cleanup pass
 * can sit between the layout and the DI serialization:
 *
 *   computeLayoutScene(state)  →  LayoutScene  →  serializeScene(scene)
 *
 * `LayoutScene` is a fully-coordinate intermediate form (pool, lanes, shapes,
 * edge waypoints) that is easy to inspect and mutate. `serializeScene` turns
 * it into BPMN DI XML.
 *
 * Column assignment strategy (in priority order):
 *   1. Flow-based BFS (longest-path from start) — when flows resolve correctly
 *   2. Sequential fallback — when fewer than 40% of expected flows resolve,
 *      assign each node a unique sequential column in task-list order
 *
 * Lane heights are computed dynamically so stacked elements always fit.
 */

import type { WizardState, FlowConnection } from '@/types/wizard'

// ── Static layout constants ────────────────────────────────────────────────────
const POOL_LABEL_W  = 30     // pool's left vertical label bar
const LANE_LABEL_W  = 30     // each lane's left vertical label bar
const COL_W         = 200    // centre-to-centre column spacing
const MIN_LANE_H    = 160    // minimum lane height
const FIRST_COL_OFF = 90     // content-area left → col-0 centre
const LAST_COL_PAD  = 70     // right padding after last column
const POOL_X        = 160
const POOL_Y        = 80
const LOOP_MARGIN   = 50     // space below pool for backward-flow routing
const STACK_GAP     = 20     // vertical gap between stacked elements

// Element dimensions
const TASK_W  = 120
const TASK_H  = 80
const EVENT_D = 36
const GW_SIZE = 50

// Average glyph width used to widen tasks whose names won't fit. bpmn-js
// renders task labels at ~12px Roboto, so each character takes roughly 7px.
const CHAR_W      = 7
const TASK_PAD_X  = 16     // padding between text bounds and task edge
const TASK_W_MAX  = 220    // hard cap so wide tasks don't overflow column

// ── Geometry helpers ───────────────────────────────────────────────────────────
export interface Pt { x: number; y: number }
export interface Bounds { x: number; y: number; w: number; h: number }

export type ShapeKind = 'event' | 'task' | 'gateway'

export interface SceneShape {
  id:        string
  kind:      ShapeKind
  x:         number
  y:         number
  w:         number
  h:         number
  /** Indicates a gateway should render with the marker visible. */
  isMarkerVisible?: boolean
}

export interface SceneEdge {
  id:        string
  sourceId:  string
  targetId:  string
  /** Ordered orthogonal waypoints, source-side first. */
  waypoints: Pt[]
  /** Optional explicit label bounds. When omitted, bpmn-js auto-places the label. */
  label?:    Bounds
  /** The flow's display label (used by the cleanup pass to predict label collisions). */
  labelText?: string
}

export interface SceneLane {
  id:   string
  name: string
  x:    number
  y:    number
  w:    number
  h:    number
}

export interface ScenePool {
  id:   string
  name: string
  x:    number
  y:    number
  w:    number
  h:    number
}

export interface LayoutScene {
  pool:   ScenePool
  lanes:  SceneLane[]
  shapes: SceneShape[]
  edges:  SceneEdge[]
  /** Layout metadata used by downstream cleanup passes. */
  metadata: {
    columnCenters: number[]   // centre X of each column
    columnGaps:    number[]   // X positions exactly between adjacent columns
    laneTops:      number[]   // Y position of each lane's top edge
    laneH:         number     // shared lane height
    poolBottom:    number     // Y of pool's bottom edge
    contentX:      number     // left edge of content area inside pool
    colW:          number     // centre-to-centre column spacing
  }
}

const cy  = (b: Bounds) => b.y + b.h / 2
const rpt = (b: Bounds): Pt => ({ x: b.x + b.w, y: cy(b) })
const lpt = (b: Bounds): Pt => ({ x: b.x,        y: cy(b) })
const cx  = (b: Bounds) => b.x + b.w / 2
const bpt = (b: Bounds): Pt => ({ x: cx(b),       y: b.y + b.h })

// ── All node IDs in a fixed traversal order ────────────────────────────────────
function allNodeIds(state: WizardState): string[] {
  const { startEvent, tasks, gateways, endEvents } = state
  const intermediates = state.intermediateEvents ?? []
  return [
    startEvent.id,
    ...tasks.map(t => t.id),
    ...gateways.map(g => g.id),
    ...intermediates.map(ie => ie.id),
    ...endEvents.map(e => e.id),
  ]
}

// ── DFS-based back-edge detection ─────────────────────────────────────────────
// Cycles in BFS cause column numbers to grow unboundedly.  We break cycles by
// identifying back edges (an edge whose target is already on the current DFS
// stack) and excluding them from the column-assignment propagation.
function detectBackEdges(
  ids: string[],
  flows: WizardState['flows'],
): Set<string> {
  const adj = new Map<string, { edgeId: string; targetId: string }[]>()
  for (const id of ids) adj.set(id, [])
  for (const f of flows) {
    const srcList = adj.get(f.sourceId)
    if (srcList) srcList.push({ edgeId: f.id, targetId: f.targetId })
  }

  const backEdges = new Set<string>()
  const visited  = new Set<string>()
  const inStack  = new Set<string>()

  function dfs(id: string) {
    visited.add(id)
    inStack.add(id)
    for (const { edgeId, targetId } of (adj.get(id) ?? [])) {
      if (inStack.has(targetId)) {
        backEdges.add(edgeId)       // target is an ancestor → cycle back-edge
      } else if (!visited.has(targetId)) {
        dfs(targetId)
      }
    }
    inStack.delete(id)
  }

  for (const id of ids) {
    if (!visited.has(id)) dfs(id)
  }
  return backEdges
}

// ── Column assignment ──────────────────────────────────────────────────────────
function assignColumns(state: WizardState): {
  colMap: Map<string, number>
  backEdgeIds: Set<string>
} {
  const { flows } = state
  const ids = allNodeIds(state)
  const cols = new Map<string, number>()
  for (const id of ids) cols.set(id, 0)

  // 1. Find back edges (cycle-forming edges) so BFS propagation is acyclic
  const backEdgeIds   = detectBackEdges(ids, flows)
  const forwardFlows  = flows.filter(f => !backEdgeIds.has(f.id))

  // 2. BFS longest-path on the acyclic forward graph
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false
    for (const f of forwardFlows) {
      const sc = cols.get(f.sourceId) ?? 0
      const tc = cols.get(f.targetId) ?? 0
      if (sc + 1 > tc) { cols.set(f.targetId, sc + 1); changed = true }
    }
    if (!changed) break
  }

  // 3. Sanity check: if fewer than 40 % of nodes got unique columns the flows
  //    probably didn't resolve → fall back to sequential order
  const usedCols = new Set(cols.values()).size
  if (ids.length > 2 && usedCols < Math.max(2, Math.floor(ids.length * 0.4))) {
    let col = 0
    const { startEvent, tasks, gateways, endEvents } = state
    cols.set(startEvent.id, col++)
    tasks.forEach(t    => { cols.set(t.id, col++) })
    gateways.forEach(g => { cols.set(g.id, col++) })
    endEvents.forEach(e => { cols.set(e.id, col++) })
    return { colMap: cols, backEdgeIds: new Set() }
  }

  // 4. Offset isolated subgraphs (not reachable from startEvent via forward flows)
  //    so they appear to the right of the main flow rather than at column 0.
  offsetIsolatedComponents(ids, cols, forwardFlows, state.startEvent.id)

  // 5. End events with no resolved incoming flows get pushed to the rightmost column + 1
  //    so they render at the end of the diagram rather than beside the start event.
  const resolvedTargets = new Set(flows.map(f => f.targetId))
  const maxCol = Math.max(0, ...Array.from(cols.values()))
  for (const e of state.endEvents) {
    if (!resolvedTargets.has(e.id) && (cols.get(e.id) ?? 0) === 0) {
      cols.set(e.id, maxCol + 1)
    }
  }

  return { colMap: cols, backEdgeIds }
}

// ── Offset disconnected subgraphs ─────────────────────────────────────────────
// Finds nodes not reachable from startId via resolved forward flows and shifts
// their column numbers so they appear after the main flow, not overlapping col 0.
function offsetIsolatedComponents(
  ids: string[],
  cols: Map<string, number>,
  forwardFlows: WizardState['flows'],
  startId: string,
): void {
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const f of forwardFlows) {
    adj.get(f.sourceId)?.push(f.targetId)
    adj.get(f.targetId)?.push(f.sourceId)
  }

  const mainComp = new Set<string>()
  const queue = [startId]
  mainComp.add(startId)
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of (adj.get(cur) ?? [])) {
      if (!mainComp.has(nb)) { mainComp.add(nb); queue.push(nb) }
    }
  }

  const isolated = ids.filter(id => !mainComp.has(id))
  if (!isolated.length) return

  const maxMainCol = Math.max(0, ...Array.from(mainComp).map(id => cols.get(id) ?? 0))
  const minIsolatedCol = Math.min(...isolated.map(id => cols.get(id) ?? 0))
  const shift = maxMainCol + 2 - minIsolatedCol
  for (const id of isolated) {
    cols.set(id, (cols.get(id) ?? 0) + shift)
  }
}

// ── Lane assignment for start/end/gateway nodes ────────────────────────────────
function buildLaneMap(state: WizardState): Map<string, string> {
  const { participants, startEvent, tasks, gateways, endEvents, flows } = state
  const intermediates = state.intermediateEvents ?? []
  const laneMap = new Map<string, string>()
  const taskById = new Map(tasks.map(t => [t.id, t]))
  tasks.forEach(t => laneMap.set(t.id, t.participantId))

  const defaultLane = participants[0]?.id ?? ''
  const participantIds = new Set(participants.map(p => p.id))

  function infer(nodeId: string): string {
    const outs = flows.filter(f => f.sourceId === nodeId).map(f => f.targetId)
    const ins  = flows.filter(f => f.targetId === nodeId).map(f => f.sourceId)
    for (const id of [...outs, ...ins]) {
      const t = taskById.get(id); if (t) return t.participantId
    }
    for (const id of [...outs, ...ins]) {
      const nexts = [...flows.filter(f => f.sourceId === id), ...flows.filter(f => f.targetId === id)]
      for (const nf of nexts) {
        const nid = nf.sourceId === id ? nf.targetId : nf.sourceId
        const t = taskById.get(nid); if (t) return t.participantId
      }
    }
    return defaultLane
  }

  laneMap.set(startEvent.id, infer(startEvent.id))
  endEvents.forEach(e => laneMap.set(e.id, infer(e.id)))
  gateways.forEach(g => laneMap.set(g.id, infer(g.id)))
  intermediates.forEach(ie => {
    // Honour explicit participantId when valid, otherwise infer like a gateway.
    const explicit = ie.participantId && participantIds.has(ie.participantId)
      ? ie.participantId
      : null
    laneMap.set(ie.id, explicit ?? infer(ie.id))
  })
  return laneMap
}

// ── Per-bucket stacking offsets ────────────────────────────────────────────────
// "bucket" = (laneId, col) pair; multiple nodes in same bucket stack vertically
function buildStackData(
  state: WizardState,
  colMap: Map<string, number>,
  laneMap: Map<string, string>,
) {
  const ids = allNodeIds(state)
  const buckets = new Map<string, string[]>()
  for (const id of ids) {
    const lane = laneMap.get(id) ?? ''
    const col  = colMap.get(id) ?? 0
    const key  = `${lane}|${col}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(id)
  }
  const stackIndex = new Map<string, number>()
  const stackTotal = new Map<string, number>()
  for (const ids2 of buckets.values()) {
    ids2.forEach((id, i) => {
      stackIndex.set(id, i)
      stackTotal.set(id, ids2.length)
    })
  }
  return { stackIndex, stackTotal }
}

// ── Dynamic lane height based on max stack depth ──────────────────────────────
function computeLaneH(
  state: WizardState,
  stackTotal: Map<string, number>,
  laneMap: Map<string, string>,
  colMap: Map<string, number>,
): number {
  const ids = allNodeIds(state)
  let maxStack = 1
  const seen = new Set<string>()
  for (const id of ids) {
    const lane = laneMap.get(id) ?? ''
    const col  = colMap.get(id) ?? 0
    const key  = `${lane}|${col}`
    if (!seen.has(key)) {
      seen.add(key)
      maxStack = Math.max(maxStack, stackTotal.get(id) ?? 1)
    }
  }
  return Math.max(MIN_LANE_H, maxStack * (TASK_H + STACK_GAP) + 40)
}

// ── Per-task width — widen if name won't fit at default width ─────────────────
function computeTaskWidth(name: string): number {
  if (!name) return TASK_W
  // bpmn-js wraps text on word boundaries, so the limiting factor is the
  // longest single word OR a 2-line wrap of the average line. Estimate the
  // worst-case line length by splitting on spaces.
  const words = name.trim().split(/\s+/)
  const longestWord = Math.max(0, ...words.map(w => w.length))
  // 2-line wrap target: roughly half the characters per line + word boundaries
  const halfWrap = Math.ceil(name.length / 2)
  const targetChars = Math.max(longestWord, halfWrap, 14)  // 14 ≈ default fits

  const needed = targetChars * CHAR_W + TASK_PAD_X * 2
  return Math.max(TASK_W, Math.min(TASK_W_MAX, needed))
}

// ── Main: layout-scene computation ─────────────────────────────────────────────
export function computeLayoutScene(state: WizardState): LayoutScene | null {
  const { participants, startEvent, tasks, gateways, endEvents, flows } = state
  const intermediates = state.intermediateEvents ?? []
  if (!participants.length) return null

  const collaborationParticipantId = 'Participant_1'

  const { colMap, backEdgeIds } = assignColumns(state)
  const laneMap = buildLaneMap(state)
  const { stackIndex, stackTotal } = buildStackData(state, colMap, laneMap)
  const LANE_H = computeLaneH(state, stackTotal, laneMap, colMap)

  // Per-task width (widen to fit long names so labels are not clipped)
  const taskWidth = new Map<string, number>()
  for (const t of tasks) taskWidth.set(t.id, computeTaskWidth(t.name))

  const numCols   = Math.max(0, ...Array.from(colMap.values())) + 1
  const contentX  = POOL_X + POOL_LABEL_W + LANE_LABEL_W
  // Account for the widest task in the rightmost column
  const maxTaskW  = Math.max(TASK_W, ...Array.from(taskWidth.values()))
  const poolW     = POOL_LABEL_W + LANE_LABEL_W + FIRST_COL_OFF + (numCols - 1) * COL_W + maxTaskW / 2 + LAST_COL_PAD
  const poolH     = participants.length * LANE_H

  const laneIdx = (nodeId: string): number => {
    const lid = laneMap.get(nodeId) ?? participants[0].id
    const idx = participants.findIndex(p => p.id === lid)
    return Math.max(0, Math.min(participants.length - 1, idx))
  }

  // ── Element bounds ──────────────────────────────────────────────────────────
  function nodeBounds(nodeId: string, w: number, h: number): Bounds {
    const col   = colMap.get(nodeId) ?? 0
    const li    = laneIdx(nodeId)
    const si    = stackIndex.get(nodeId) ?? 0
    const total = stackTotal.get(nodeId) ?? 1

    const laneTopY = POOL_Y + li * LANE_H
    const stackSpacing = h + STACK_GAP
    const groupH = total * stackSpacing - STACK_GAP
    const groupTop = laneTopY + (LANE_H - groupH) / 2
    const elemCY = groupTop + si * stackSpacing + h / 2

    const elemCX = contentX + FIRST_COL_OFF + col * COL_W
    return { x: elemCX - w / 2, y: elemCY - h / 2, w, h }
  }

  const bmap = new Map<string, Bounds>()
  bmap.set(startEvent.id, nodeBounds(startEvent.id, EVENT_D, EVENT_D))
  tasks.forEach(t    => bmap.set(t.id, nodeBounds(t.id, taskWidth.get(t.id) ?? TASK_W, TASK_H)))
  gateways.forEach(g => bmap.set(g.id, nodeBounds(g.id, GW_SIZE, GW_SIZE)))
  intermediates.forEach(ie => bmap.set(ie.id, nodeBounds(ie.id, EVENT_D, EVENT_D)))
  endEvents.forEach(e => bmap.set(e.id, nodeBounds(e.id, EVENT_D, EVENT_D)))

  // ── Build shape list ──────────────────────────────────────────────────────
  const shapes: SceneShape[] = []
  shapes.push(toShape(startEvent.id, 'event', bmap))
  for (const t of tasks)    shapes.push(toShape(t.id, 'task', bmap))
  for (const g of gateways) shapes.push({ ...toShape(g.id, 'gateway', bmap), isMarkerVisible: true })
  for (const ie of intermediates) shapes.push(toShape(ie.id, 'event', bmap))
  for (const e of endEvents) shapes.push(toShape(e.id, 'event', bmap))

  // ── Edge waypoints ─────────────────────────────────────────────────────────
  const poolBottom = POOL_Y + poolH

  const horizontalCrosses = (
    x1: number, x2: number, y: number, srcId: string, tgtId: string,
  ): boolean => {
    const lo = Math.min(x1, x2)
    const hi = Math.max(x1, x2)
    for (const [id, b] of bmap) {
      if (id === srcId || id === tgtId) continue
      if (y < b.y - 4 || y > b.y + b.h + 4) continue
      if (b.x + b.w < lo + 2) continue
      if (b.x > hi - 2) continue
      return true
    }
    return false
  }

  // Channel pre-computation for cross-lane forward flows
  type ChannelData = { ch1X: number; ch2X: number; midY: number }
  const flowChannel = new Map<string, ChannelData>()
  const flowOffset  = new Map<string, number>()
  const groups      = new Map<string, FlowConnection[]>()

  function findGutterY(ch1X: number, ch2X: number, sLane: number, tLane: number): number {
    const lo = Math.min(ch1X, ch2X)
    const hi = Math.max(ch1X, ch2X)
    const laneTop    = POOL_Y + sLane * LANE_H
    const laneBottom = POOL_Y + (sLane + 1) * LANE_H

    let maxElemBottom = laneTop
    let minElemTop    = laneBottom
    for (const [id, b] of bmap) {
      if (laneIdx(id) !== sLane) continue
      if (b.x + b.w < lo - 5) continue
      if (b.x > hi + 5) continue
      maxElemBottom = Math.max(maxElemBottom, b.y + b.h)
      minElemTop    = Math.min(minElemTop, b.y)
    }

    if (sLane < tLane) {
      const midY = (maxElemBottom + laneBottom) / 2
      return Math.min(midY, laneBottom - 12)
    } else {
      const midY = (laneTop + minElemTop) / 2
      return Math.max(midY, laneTop + 12)
    }
  }

  for (const f of flows) {
    if (backEdgeIds.has(f.id)) continue
    const srcLane = laneMap.get(f.sourceId)
    const tgtLane = laneMap.get(f.targetId)
    if (srcLane === tgtLane) continue

    const sc = colMap.get(f.sourceId) ?? 0
    const tc = colMap.get(f.targetId) ?? 0
    const sl = laneIdx(f.sourceId)
    const tl = laneIdx(f.targetId)

    const ch1X = contentX + FIRST_COL_OFF + (sc + 0.5) * COL_W
    const ch2X = sc < tc
      ? contentX + FIRST_COL_OFF + (tc - 0.5) * COL_W
      : ch1X
    const midY = findGutterY(ch1X, ch2X, sl, tl)

    flowChannel.set(f.id, { ch1X, ch2X, midY })

    const key = `${Math.round(ch2X)}_${Math.round(midY)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }

  const flowMidYOffset = new Map<string, number>()

  for (const group of groups.values()) {
    group.sort((a, b) => laneIdx(a.sourceId) - laneIdx(b.sourceId))
    const n = group.length
    group.forEach((f, i) => {
      const span = Math.min(24, (n - 1) * 8)
      flowOffset.set(f.id, n === 1 ? 0 : (i / (n - 1) - 0.5) * span)
      const sl = laneIdx(f.sourceId)
      const tl = laneIdx(f.targetId)
      const dir = sl < tl ? -1 : 1
      const ySpan = Math.min(16, (n - 1) * 5)
      flowMidYOffset.set(f.id, n === 1 ? 0 : (i / (n - 1) - 0.5) * ySpan * dir)
    })
  }

  const edges: SceneEdge[] = []

  for (const f of flows) {
    const sb = bmap.get(f.sourceId)
    const tb = bmap.get(f.targetId)
    if (!sb || !tb) continue

    const isBack = backEdgeIds.has(f.id)
    const sameLane = laneMap.get(f.sourceId) === laneMap.get(f.targetId)
    const sc = colMap.get(f.sourceId) ?? 0
    const tc = colMap.get(f.targetId) ?? 0

    let wps: Pt[]

    if (isBack || sc > tc) {
      const depth = sc % 4
      const loopY = poolBottom + LOOP_MARGIN + depth * 15
      wps = [bpt(sb), { x: cx(sb), y: loopY }, { x: cx(tb), y: loopY }, bpt(tb)]

    } else if (sameLane) {
      const sourceRight = rpt(sb)
      const targetLeft  = lpt(tb)
      if (!horizontalCrosses(sourceRight.x, targetLeft.x, sourceRight.y, f.sourceId, f.targetId)) {
        wps = [sourceRight, targetLeft]
      } else {
        const li = laneIdx(f.sourceId)
        const laneBottomY = POOL_Y + (li + 1) * LANE_H
        const elemBottom = Math.max(sb.y + sb.h, tb.y + tb.h)
        const gutterY = Math.min(elemBottom + 25, laneBottomY - 15)
        wps = [
          bpt(sb),
          { x: cx(sb), y: gutterY },
          { x: cx(tb), y: gutterY },
          bpt(tb),
        ]
      }

    } else {
      const ch = flowChannel.get(f.id)!
      const off = flowOffset.get(f.id) ?? 0
      const yOff = flowMidYOffset.get(f.id) ?? 0
      const ch1 = ch.ch1X + off
      const ch2 = ch.ch2X + off
      const midY = ch.midY + yOff
      const sourceRight = rpt(sb)
      const targetLeft  = lpt(tb)

      const colGap = tc - sc
      if (colGap <= 1 && Math.abs(ch1 - ch2) < 1) {
        wps = [
          sourceRight,
          { x: ch2, y: sourceRight.y },
          { x: ch2, y: targetLeft.y },
          targetLeft,
        ]
      } else {
        wps = [
          sourceRight,
          { x: ch1, y: sourceRight.y },
          { x: ch1, y: midY },
          { x: ch2, y: midY },
          { x: ch2, y: targetLeft.y },
          targetLeft,
        ]
      }
    }

    edges.push({
      id:        f.id,
      sourceId:  f.sourceId,
      targetId:  f.targetId,
      waypoints: wps,
      labelText: f.label || undefined,
    })
  }

  // ── Metadata for downstream cleanup ───────────────────────────────────────
  const columnCenters: number[] = []
  for (let c = 0; c < numCols; c++) {
    columnCenters.push(contentX + FIRST_COL_OFF + c * COL_W)
  }
  const columnGaps: number[] = []
  for (let c = 0; c < numCols - 1; c++) {
    columnGaps.push(contentX + FIRST_COL_OFF + (c + 0.5) * COL_W)
  }
  const laneTops: number[] = participants.map((_, i) => POOL_Y + i * LANE_H)

  return {
    pool: {
      id:   collaborationParticipantId,
      name: state.processName || 'Process',
      x:    POOL_X,
      y:    POOL_Y,
      w:    poolW,
      h:    poolH,
    },
    lanes: participants.map((p, i) => ({
      id:   p.id,
      name: p.name,
      x:    POOL_X + POOL_LABEL_W,
      y:    POOL_Y + i * LANE_H,
      w:    poolW - POOL_LABEL_W,
      h:    LANE_H,
    })),
    shapes,
    edges,
    metadata: {
      columnCenters,
      columnGaps,
      laneTops,
      laneH:      LANE_H,
      poolBottom,
      contentX,
      colW:       COL_W,
    },
  }
}

function toShape(id: string, kind: ShapeKind, bmap: Map<string, Bounds>): SceneShape {
  const b = bmap.get(id)!
  return { id, kind, x: b.x, y: b.y, w: b.w, h: b.h }
}

// ── Serialize a LayoutScene to BPMN DI XML ────────────────────────────────────
export function serializeScene(scene: LayoutScene): string {
  const r = (n: number) => Math.round(n)
  const lines: string[] = []

  lines.push(
    `<bpmndi:BPMNShape id="${scene.pool.id}_di" bpmnElement="${scene.pool.id}" isHorizontal="true">`,
    `  <dc:Bounds x="${r(scene.pool.x)}" y="${r(scene.pool.y)}" width="${r(scene.pool.w)}" height="${r(scene.pool.h)}" />`,
    `</bpmndi:BPMNShape>`,
  )

  for (const lane of scene.lanes) {
    lines.push(
      `<bpmndi:BPMNShape id="${lane.id}_di" bpmnElement="${lane.id}">`,
      `  <dc:Bounds x="${r(lane.x)}" y="${r(lane.y)}" width="${r(lane.w)}" height="${r(lane.h)}" />`,
      `</bpmndi:BPMNShape>`,
    )
  }

  for (const s of scene.shapes) {
    const extra = s.isMarkerVisible ? ' isMarkerVisible="true"' : ''
    lines.push(
      `<bpmndi:BPMNShape id="${s.id}_di" bpmnElement="${s.id}"${extra}>`,
      `  <dc:Bounds x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" />`,
      `</bpmndi:BPMNShape>`,
    )
  }

  for (const e of scene.edges) {
    const wpXml = e.waypoints
      .map(p => `  <di:waypoint x="${r(p.x)}" y="${r(p.y)}" />`)
      .join('\n')
    if (e.label) {
      lines.push(
        `<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">`,
        wpXml,
        `  <bpmndi:BPMNLabel>`,
        `    <dc:Bounds x="${r(e.label.x)}" y="${r(e.label.y)}" width="${r(e.label.w)}" height="${r(e.label.h)}" />`,
        `  </bpmndi:BPMNLabel>`,
        `</bpmndi:BPMNEdge>`,
      )
    } else {
      lines.push(
        `<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">`,
        wpXml,
        `</bpmndi:BPMNEdge>`,
      )
    }
  }

  const indent = '      '
  return `<bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
${lines.map(l => indent + l).join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`
}

// ── Backwards-compatible single-call entry point ───────────────────────────────
export function generateSwimlaneDi(state: WizardState): string {
  const scene = computeLayoutScene(state)
  if (!scene) return ''
  return serializeScene(scene)
}
