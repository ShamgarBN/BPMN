// Sanity check for visualCleanupService — runs a synthesized scene with
// known violations through the pass and prints the report. Not a unit test
// suite, just a smoke check.

import { runVisualCleanup } from '../src/services/visualCleanupService.ts'

// Synthesize a 3-lane, 5-shape scene with three deliberate violations:
//   1. Edge V1 routes a horizontal segment straight through Task B.
//   2. Edge V2 has its horizontal segment at the lane-0/lane-1 boundary.
//   3. Edge V3 shares its horizontal Y with V1's reroute attempt (parallel overlap).
const scene = {
  pool:  { id: 'P1', name: 'Pool', x: 160, y: 80, w: 800, h: 480 },
  lanes: [
    { id: 'L1', name: 'Lane 1', x: 190, y: 80,  w: 770, h: 160 },
    { id: 'L2', name: 'Lane 2', x: 190, y: 240, w: 770, h: 160 },
    { id: 'L3', name: 'Lane 3', x: 190, y: 400, w: 770, h: 160 },
  ],
  shapes: [
    { id: 'Start', kind: 'event',   x: 250, y: 142, w: 36,  h: 36 },
    { id: 'A',     kind: 'task',    x: 340, y: 120, w: 120, h: 80 },
    { id: 'B',     kind: 'task',    x: 540, y: 280, w: 120, h: 80 },
    { id: 'C',     kind: 'task',    x: 740, y: 440, w: 120, h: 80 },
    { id: 'End',   kind: 'event',   x: 900, y: 462, w: 36,  h: 36 },
  ],
  edges: [
    {
      id: 'V1', sourceId: 'A', targetId: 'C',
      // Horizontal segment runs at y=320 (right through Task B which is y=280..360)
      waypoints: [
        { x: 460, y: 160 }, { x: 540, y: 160 },
        { x: 540, y: 320 }, { x: 800, y: 320 }, { x: 800, y: 480 }, { x: 740, y: 480 },
      ],
      labelText: 'Approved',
    },
    {
      id: 'V2', sourceId: 'A', targetId: 'B',
      // Horizontal segment at y=240 (which is lane-1 / lane-2 boundary)
      waypoints: [
        { x: 460, y: 160 }, { x: 540, y: 160 },
        { x: 540, y: 240 }, { x: 600, y: 240 }, { x: 600, y: 280 },
      ],
    },
    {
      id: 'V3', sourceId: 'Start', targetId: 'B',
      // Same Y as V1's segment — should be staggered
      waypoints: [
        { x: 286, y: 160 }, { x: 540, y: 160 },
        { x: 540, y: 320 }, { x: 600, y: 320 }, { x: 600, y: 280 },
      ],
    },
  ],
  metadata: {
    columnCenters: [268, 400, 600, 800, 918],
    columnGaps:    [334, 500, 700, 859],
    laneTops:      [80, 240, 400],
    laneH:         160,
    poolBottom:    560,
    contentX:      220,
    colW:          200,
  },
}

const { scene: cleaned, report } = runVisualCleanup(scene)

console.log('── Cleanup report ─────────────────────────────────────────────')
console.log('Iterations    :', report.iterations)
console.log('Total fixed   :', report.fixed)
console.log('Unresolved    :', report.unresolved)
console.log('  crossesShape   :', report.byCheck.crossesShape)
console.log('  onLaneBoundary :', report.byCheck.onLaneBoundary)
console.log('  parallelOverlap:', report.byCheck.parallelOverlap)
console.log('  labelOnShape   :', report.byCheck.labelOnShape)

console.log('\n── V1 waypoints (was crossing Task B) ────────────────────────')
console.log(cleaned.edges.find(e => e.id === 'V1').waypoints)

console.log('\n── V2 waypoints (was on lane boundary y=240) ─────────────────')
console.log(cleaned.edges.find(e => e.id === 'V2').waypoints)

console.log('\n── V3 waypoints (was overlapping V1) ─────────────────────────')
console.log(cleaned.edges.find(e => e.id === 'V3').waypoints)

const expectFixed = report.fixed >= 2
process.exit(expectFixed ? 0 : 1)
