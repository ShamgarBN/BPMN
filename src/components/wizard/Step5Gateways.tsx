import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useWizardStore } from '@/stores/wizardStore'
import { type GatewayType } from '@/types/wizard'
import { cn } from '@/lib/utils'

const GATEWAY_TYPES: GatewayType[] = [
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'eventBasedGateway',
]

const GATEWAY_SYMBOLS: Record<GatewayType, string> = {
  exclusiveGateway: '✕',
  parallelGateway:  '+',
  inclusiveGateway: '○',
  eventBasedGateway: '⬡',
}

const GATEWAY_COLORS: Record<GatewayType, string> = {
  exclusiveGateway:  'bg-amber-100 text-amber-700 border-amber-300',
  parallelGateway:   'bg-green-100 text-green-700 border-green-300',
  inclusiveGateway:  'bg-blue-100 text-blue-700 border-blue-300',
  eventBasedGateway: 'bg-purple-100 text-purple-700 border-purple-300',
}

export function Step5Gateways() {
  const { gateways, addGateway, updateGateway, removeGateway } = useWizardStore()
  const [newName, setNewName] = useState('')

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    addGateway(trimmed)
    setNewName('')
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-900 space-y-1">
        <p><strong>What is a gateway?</strong> A gateway is a decision point that splits or merges the flow.</p>
        <ul className="ml-4 mt-1 space-y-0.5 text-xs">
          <li><strong>XOR (✕)</strong> — Exactly one path continues. Example: "Approved or Rejected?"</li>
          <li><strong>AND (+)</strong> — All paths run in parallel. Example: "Notify Finance AND update ERP"</li>
          <li><strong>OR (○)</strong> — One or more paths continue based on conditions.</li>
          <li><strong>Event-Based (⬡)</strong> — Continues based on which event arrives first.</li>
        </ul>
        <p className="text-xs text-purple-600 mt-1">
          You do not need gateways if your process is a straight sequence of tasks.
        </p>
      </div>

      {/* Add gateway */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Decision label (e.g. Amount over limit?)"
          className="flex-1"
          autoFocus
        />
        <Button variant="primary" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus size={15} />
          Add
        </Button>
      </div>

      {/* Gateway list */}
      {gateways.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No gateways yet. If your process has no decision points, you can skip this step.
        </div>
      ) : (
        <div className="space-y-2">
          {gateways.map((gw) => (
            <div key={gw.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white group">
              {/* Symbol */}
              <div className={cn(
                'w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-sm shrink-0',
                GATEWAY_COLORS[gw.type]
              )}>
                {GATEWAY_SYMBOLS[gw.type]}
              </div>

              {/* Name */}
              <Input
                value={gw.name}
                onChange={(e) => updateGateway(gw.id, { name: e.target.value })}
                className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 h-7 text-sm font-medium"
                placeholder="Gateway label"
              />

              {/* Type selector */}
              <Select
                value={gw.type}
                onChange={(e) => updateGateway(gw.id, { type: e.target.value as GatewayType })}
                className="w-44 text-xs"
              >
                {GATEWAY_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('Gateway', '').replace(/([A-Z])/g, ' $1').trim()}</option>
                ))}
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeGateway(gw.id)}
                className="opacity-0 group-hover:opacity-100 h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Remove gateway"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {gateways.length > 0 && (
        <p className="text-xs text-gray-400">
          {gateways.length} gateway{gateways.length === 1 ? '' : 's'} defined.
          You will connect them to tasks in the next step.
        </p>
      )}
    </div>
  )
}
