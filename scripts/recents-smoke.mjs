// Smoke test for recentFilesService.
//
// localStorage isn't available in Node, so we stub it.  This exercises the
// dedupe / cap / validation logic.  Run with:
//   node --experimental-strip-types scripts/recents-smoke.mjs

class FakeStorage {
  constructor() { this._data = new Map() }
  getItem(k)         { return this._data.has(k) ? this._data.get(k) : null }
  setItem(k, v)      { this._data.set(k, String(v)) }
  removeItem(k)      { this._data.delete(k) }
}

globalThis.localStorage = new FakeStorage()

const {
  listRecents,
  recordRecent,
  removeRecent,
  clearRecents,
} = await import('../src/services/recentFilesService.ts')

function assert(label, cond) {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) process.exit(1)
}

// Empty list to start
assert('empty initial list', listRecents().length === 0)

// Record three files
recordRecent({ kind: 'project', name: 'a.bpmnstudio', path: '/tmp/a.bpmnstudio' })
recordRecent({ kind: 'bpmn',    name: 'b.bpmn',       path: '/tmp/b.bpmn'       })
recordRecent({ kind: 'project', name: 'c.bpmnstudio', path: '/tmp/c.bpmnstudio' })

let list = listRecents()
assert('three items recorded', list.length === 3)
assert('most-recent first',    list[0].name === 'c.bpmnstudio')

// Recording an existing file bumps it to the top (dedup by path)
recordRecent({ kind: 'project', name: 'a.bpmnstudio', path: '/tmp/a.bpmnstudio' })
list = listRecents()
assert('dedupe by path',       list.length === 3)
assert('bumped to top',        list[0].path === '/tmp/a.bpmnstudio')

// Remove one
removeRecent({ path: '/tmp/b.bpmn', name: 'b.bpmn' })
list = listRecents()
assert('removed by path',      list.length === 2)
assert('b.bpmn gone',          !list.some((x) => x.name === 'b.bpmn'))

// Cap at 10
for (let i = 0; i < 20; i++) {
  recordRecent({ kind: 'bpmn', name: `f${i}.bpmn`, path: `/tmp/f${i}.bpmn` })
}
list = listRecents()
assert('cap at 10',            list.length === 10)
assert('most-recent first after spam', list[0].name === 'f19.bpmn')

// Bad input is ignored
clearRecents()
assert('clear', listRecents().length === 0)
recordRecent({ kind: 'unknown', name: 'x', path: '/tmp/x' })
assert('bad kind rejected', listRecents().length === 0)
recordRecent({ kind: 'bpmn', name: '', path: '/tmp/y' })
assert('empty name rejected', listRecents().length === 0)

// Browser-mode entries (no path) still de-dupe by (kind, name)
recordRecent({ kind: 'project', name: 'webonly.bpmnstudio', path: '' })
recordRecent({ kind: 'project', name: 'webonly.bpmnstudio', path: '' })
assert('browser-mode dedup', listRecents().length === 1)

console.log('\nAll recent-files assertions passed.')
