import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useWizardStore } from '@/stores/wizardStore'
import { START_EVENT_TYPE_LABELS, type StartEventType } from '@/types/wizard'
import { cn } from '@/lib/utils'
import {
  PlayCircle, Mail, Clock, GitBranch, Radio, AlertTriangle,
} from 'lucide-react'

const TYPE_ICONS: Record<StartEventType, React.ReactNode> = {
  none:        <PlayCircle size={20} className="text-green-500" />,
  message:     <Mail size={20} className="text-blue-500" />,
  timer:       <Clock size={20} className="text-amber-500" />,
  conditional: <GitBranch size={20} className="text-purple-500" />,
  signal:      <Radio size={20} className="text-indigo-500" />,
  error:       <AlertTriangle size={20} className="text-red-500" />,
}

const TRIGGER_TYPES: StartEventType[] = ['none', 'message', 'timer', 'conditional', 'signal', 'error']

export function Step3Trigger() {
  const { startEvent, setStartEvent } = useWizardStore()

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Label htmlFor="startName">Start Event Label</Label>
        <Input
          id="startName"
          value={startEvent.name}
          onChange={(e) => setStartEvent({ name: e.target.value })}
          placeholder="e.g. Invoice Received, Every Monday 9 AM"
        />
      </div>

      {/* Trigger type cards */}
      <div>
        <Label>Trigger Type</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {TRIGGER_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setStartEvent({ type })}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all text-sm',
                startEvent.type === type
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <span className="shrink-0">{TYPE_ICONS[type]}</span>
              <span className="font-medium text-gray-800 capitalize">{type}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {START_EVENT_TYPE_LABELS[startEvent.type]}
        </p>
      </div>

      {/* Conditional extra fields */}
      {startEvent.type === 'timer' && (
        <div>
          <Label htmlFor="timerDef">Timer Definition (optional)</Label>
          <Input
            id="timerDef"
            value={startEvent.timerDefinition}
            onChange={(e) => setStartEvent({ timerDefinition: e.target.value })}
            placeholder="e.g. PT1H (every hour) or 0 9 * * 1 (Monday 9 AM)"
          />
          <p className="text-xs text-gray-400 mt-1">ISO 8601 duration or cron expression</p>
        </div>
      )}

      {startEvent.type === 'message' && (
        <div>
          <Label htmlFor="msgRef">Message Name (optional)</Label>
          <Input
            id="msgRef"
            value={startEvent.messageRef}
            onChange={(e) => setStartEvent({ messageRef: e.target.value })}
            placeholder="e.g. InvoiceSubmittedMessage"
          />
        </div>
      )}

      {startEvent.type === 'conditional' && (
        <div>
          <Label htmlFor="condExpr">Condition Expression (optional)</Label>
          <Input
            id="condExpr"
            value={startEvent.conditionExpression}
            onChange={(e) => setStartEvent({ conditionExpression: e.target.value })}
            placeholder="e.g. amount > 10000"
          />
        </div>
      )}
    </div>
  )
}
