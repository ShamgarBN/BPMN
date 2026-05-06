import { useState } from 'react'
import { Plus, Trash2, ArrowRight, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useWizardStore } from '@/stores/wizardStore'
import { type EndEventType } from '@/types/wizard'

const END_EVENT_TYPES: EndEventType[] = ['none', 'message', 'terminate', 'error', 'signal']

export function Step6Flows() {
  const {
    startEvent, tasks, gateways, flows, endEvents,
    addFlow, removeFlow,
    addEndEvent, removeEndEvent, updateEndEvent,
  } = useWizardStore()

  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newFlowLabel, setNewFlowLabel] = useState('')
  const [newEndName, setNewEndName] = useState('')

  // All connectable nodes
  const allNodes = [
    { id: startEvent.id, label: `▶ ${startEvent.name}`, kind: 'start' as const },
    ...tasks.map((t) => ({ id: t.id, label: `☐ ${t.name}`, kind: 'task' as const })),
    ...gateways.map((g) => ({ id: g.id, label: `◇ ${g.name}`, kind: 'gateway' as const })),
    ...endEvents.map((e) => ({ id: e.id, label: `■ ${e.name}`, kind: 'end' as const })),
  ]

  const nodeLabel = (id: string) => allNodes.find((n) => n.id === id)?.label ?? id

  const handleAddFlow = () => {
    if (!newSource || !newTarget) return
    if (newSource === newTarget) return
    addFlow(newSource, newTarget, newFlowLabel)
    setNewFlowLabel('')
    // keep source to allow chaining quickly
  }

  const handleAddEnd = () => {
    const trimmed = newEndName.trim()
    if (!trimmed) return
    addEndEvent(trimmed)
    setNewEndName('')
  }

  const handleEndKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddEnd()
  }

  // Gateway IDs for conditional label hint
  const gatewayIds = new Set(gateways.map((g) => g.id))
  const isGatewaySource = gatewayIds.has(newSource)

  return (
    <div className="max-w-2xl space-y-6">
      {/* End Events */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs">■</span>
          End Events
        </h3>
        <div className="flex gap-2">
          <Input
            value={newEndName}
            onChange={(e) => setNewEndName(e.target.value)}
            onKeyDown={handleEndKey}
            placeholder="e.g. Process Complete, Request Rejected"
            className="flex-1"
          />
          <Button variant="primary" size="sm" onClick={handleAddEnd} disabled={!newEndName.trim()}>
            <Plus size={14} />
            Add
          </Button>
        </div>
        {endEvents.length === 0 ? (
          <p className="text-xs text-gray-400">Add at least one end event to complete the process.</p>
        ) : (
          <div className="space-y-2">
            {endEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-white group">
                <span className="text-red-400 text-sm shrink-0">■</span>
                <Input
                  value={e.name}
                  onChange={(ev) => updateEndEvent(e.id, { name: ev.target.value })}
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 h-7 text-sm"
                  placeholder="End event name"
                />
                <Select
                  value={e.type}
                  onChange={(ev) => updateEndEvent(e.id, { type: ev.target.value as EndEventType })}
                  className="w-36 text-xs"
                >
                  {END_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEndEvent(e.id)}
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      {/* Sequence Flows */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <ArrowRight size={16} className="text-blue-500" />
          Sequence Flows
        </h3>
        <p className="text-xs text-gray-500">
          Define the order of execution. Connect the start event through tasks and gateways to the end events.
        </p>

        {/* Add flow */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label htmlFor="flow-source">From</Label>
              <Select
                id="flow-source"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
              >
                <option value="">— select source —</option>
                {allNodes.filter((n) => n.kind !== 'end').map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </Select>
            </div>
            <ArrowRight size={16} className="text-gray-400 mt-5 shrink-0" />
            <div className="flex-1">
              <Label htmlFor="flow-target">To</Label>
              <Select
                id="flow-target"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
              >
                <option value="">— select target —</option>
                {allNodes.filter((n) => n.kind !== 'start' && n.id !== newSource).map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {isGatewaySource && (
            <div>
              <Label htmlFor="flow-label">Branch Condition Label (optional)</Label>
              <Input
                id="flow-label"
                value={newFlowLabel}
                onChange={(e) => setNewFlowLabel(e.target.value)}
                placeholder="e.g. Approved, Amount ≤ $1000, Yes"
              />
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleAddFlow}
            disabled={!newSource || !newTarget || newSource === newTarget}
          >
            <PlusCircle size={14} />
            Add Connection
          </Button>
        </div>

        {/* Flow list */}
        {flows.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
            No connections yet. Add connections above to define the process flow.
          </div>
        ) : (
          <div className="space-y-1.5">
            {flows.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg group text-sm">
                <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 truncate text-gray-700">{nodeLabel(f.sourceId)}</span>
                <ArrowRight size={13} className="text-blue-400 shrink-0" />
                <span className="flex-1 truncate text-gray-700">{nodeLabel(f.targetId)}</span>
                {f.label && (
                  <Badge variant="info" className="shrink-0 text-xs">{f.label}</Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFlow(f.id)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {flows.length > 0 && (
          <p className="text-xs text-gray-400">
            {flows.length} connection{flows.length === 1 ? '' : 's'} defined.
            Click <strong>Generate Diagram</strong> when ready.
          </p>
        )}
      </div>
    </div>
  )
}
