import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useWizardStore } from '@/stores/wizardStore'
import { TASK_TYPE_LABELS, type TaskType } from '@/types/wizard'

const TASK_TYPES: TaskType[] = [
  'userTask', 'serviceTask', 'scriptTask', 'manualTask',
  'businessRuleTask', 'receiveTask', 'sendTask',
]

export function Step4Tasks() {
  const { tasks, participants, addTask, updateTask, removeTask } = useWizardStore()
  const [newName, setNewName] = useState('')
  const [newParticipant, setNewParticipant] = useState(participants[0]?.id ?? '')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    addTask(trimmed, newParticipant)
    setNewName('')
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  const participantName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? '(unassigned)'

  const participantColor = (id: string) =>
    participants.find((p) => p.id === id)?.color ?? '#f3f4f6'

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>Tip:</strong> Add every action that needs to happen in order. You will connect them
        in Step 6. Focus on what happens, not the exact sequence.
      </div>

      {/* Add task row */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Task name (e.g. Review Invoice)"
          className="flex-1"
          autoFocus
        />
        {participants.length > 0 && (
          <Select
            value={newParticipant}
            onChange={(e) => setNewParticipant(e.target.value)}
            className="w-44"
          >
            <option value="">No lane</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        )}
        <Button variant="primary" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus size={15} />
          Add
        </Button>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No tasks yet. Add at least one action above.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task, i) => {
            const isExpanded = expandedId === task.id
            return (
              <div key={task.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                {/* Task header row */}
                <div className="flex items-center gap-2 p-3">
                  <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}</span>

                  {/* Lane color indicator */}
                  <div
                    className="w-2 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: participantColor(task.participantId) }}
                  />

                  <Input
                    value={task.name}
                    onChange={(e) => updateTask(task.id, { name: e.target.value })}
                    className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 h-7 text-sm font-medium"
                    placeholder="Task name"
                  />

                  <Badge variant="info" className="shrink-0 hidden sm:inline-flex">
                    {TASK_TYPE_LABELS[task.type]}
                  </Badge>

                  <span className="text-xs text-gray-400 truncate max-w-24 hidden md:block">
                    {participantName(task.participantId)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    className="h-7 w-7 text-gray-400"
                    title={isExpanded ? 'Collapse' : 'Expand task details'}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTask(task.id)}
                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                    title="Remove task"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`task-type-${task.id}`}>Task Type</Label>
                        <Select
                          id={`task-type-${task.id}`}
                          value={task.type}
                          onChange={(e) => updateTask(task.id, { type: e.target.value as TaskType })}
                        >
                          {TASK_TYPES.map((t) => (
                            <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`task-lane-${task.id}`}>Assigned To</Label>
                        <Select
                          id={`task-lane-${task.id}`}
                          value={task.participantId}
                          onChange={(e) => updateTask(task.id, { participantId: e.target.value })}
                        >
                          <option value="">No lane</option>
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`task-desc-${task.id}`}>Description (optional)</Label>
                      <Textarea
                        id={`task-desc-${task.id}`}
                        value={task.description}
                        onChange={(e) => updateTask(task.id, { description: e.target.value })}
                        rows={2}
                        placeholder="What happens in this task?"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tasks.length > 0 && (
        <p className="text-xs text-gray-400">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} defined.
        </p>
      )}
    </div>
  )
}
