import { useState } from 'react'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useWizardStore } from '@/stores/wizardStore'
import { PARTICIPANT_COLORS } from '@/types/wizard'

export function Step2Participants() {
  const { participants, addParticipant, updateParticipant, removeParticipant } = useWizardStore()
  const [newName, setNewName] = useState('')

  const handleAdd = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    addParticipant(trimmed)
    setNewName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>What is a participant?</strong> Each participant represents a person, team, or system
        that performs tasks in this process. They appear as horizontal swimlanes in the final diagram.
        The order you define here is the order they appear top-to-bottom.
      </div>

      {/* Add new participant */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Finance Manager, ERP System, HR Team"
          className="flex-1"
          autoFocus
        />
        <Button variant="primary" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus size={15} />
          Add
        </Button>
      </div>

      {/* Participant list */}
      {participants.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No participants yet. Add at least one above.
        </div>
      ) : (
        <div className="space-y-2">
          {participants.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white group"
            >
              <GripVertical size={15} className="text-gray-300 shrink-0" />

              {/* Color swatch */}
              <div className="flex items-center gap-1.5 shrink-0">
                {PARTICIPANT_COLORS.map((color) => (
                  <button
                    key={color}
                    title={`Set lane color`}
                    onClick={() => updateParticipant(p.id, { color })}
                    className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: p.color === color ? '#3b82f6' : 'transparent',
                    }}
                  />
                ))}
              </div>

              {/* Lane preview indicator */}
              <div
                className="w-3 h-8 rounded shrink-0"
                style={{ backgroundColor: p.color }}
              />

              {/* Name input */}
              <Input
                value={p.name}
                onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent px-0 h-7"
                placeholder="Participant name"
              />

              <span className="text-xs text-gray-300 shrink-0">Lane {i + 1}</span>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeParticipant(p.id)}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                title="Remove participant"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {participants.length > 0 && (
        <p className="text-xs text-gray-400">
          {participants.length} participant{participants.length === 1 ? '' : 's'} defined.
          You can return here at any time to add more.
        </p>
      )}
    </div>
  )
}
