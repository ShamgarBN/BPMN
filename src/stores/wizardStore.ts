import { create } from 'zustand'
import type {
  WizardState,
  Participant,
  Task,
  Gateway,
  FlowConnection,
  StartEvent,
  EndEvent,
} from '@/types/wizard'
import { generateId, } from '@/lib/utils'
import { PARTICIPANT_COLORS } from '@/types/wizard'

interface WizardActions {
  setStep: (step: number) => void
  setEditorMode: (value: boolean) => void
  setHasGeneratedDiagram: (value: boolean) => void

  // Step 1
  setProcessName: (name: string) => void
  setProcessDescription: (desc: string) => void
  setProcessVersion: (version: string) => void
  setProcessOwner: (owner: string) => void

  // Step 2
  addParticipant: (name: string) => void
  updateParticipant: (id: string, updates: Partial<Omit<Participant, 'id'>>) => void
  removeParticipant: (id: string) => void
  reorderParticipants: (from: number, to: number) => void

  // Step 3
  setStartEvent: (event: Partial<StartEvent>) => void

  // Step 4
  addTask: (name: string, participantId: string) => void
  updateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void
  removeTask: (id: string) => void

  // Step 5
  addGateway: (name: string) => void
  updateGateway: (id: string, updates: Partial<Omit<Gateway, 'id'>>) => void
  removeGateway: (id: string) => void

  // Step 6
  addFlow: (sourceId: string, targetId: string, label?: string) => void
  updateFlow: (id: string, updates: Partial<Omit<FlowConnection, 'id'>>) => void
  removeFlow: (id: string) => void
  addEndEvent: (name: string) => void
  updateEndEvent: (id: string, updates: Partial<Omit<EndEvent, 'id'>>) => void
  removeEndEvent: (id: string) => void

  reset: () => void
  loadState: (state: Partial<WizardState>) => void
}

const initialStartEvent: StartEvent = {
  id: generateId('StartEvent'),
  name: 'Start',
  type: 'none',
  timerDefinition: '',
  messageRef: '',
  conditionExpression: '',
}

const initialState: WizardState = {
  currentStep: 0,
  isEditorMode: false,
  hasGeneratedDiagram: false,

  processName: '',
  processDescription: '',
  processVersion: '1.0',
  processOwner: '',

  participants: [],
  startEvent: initialStartEvent,
  tasks: [],
  gateways: [],
  flows: [],
  endEvents: [],
}

export const useWizardStore = create<WizardState & WizardActions>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),
  setEditorMode: (value) => set({ isEditorMode: value }),
  setHasGeneratedDiagram: (value) => set({ hasGeneratedDiagram: value }),

  setProcessName: (processName) => set({ processName }),
  setProcessDescription: (processDescription) => set({ processDescription }),
  setProcessVersion: (processVersion) => set({ processVersion }),
  setProcessOwner: (processOwner) => set({ processOwner }),

  addParticipant: (name) => {
    const participants = get().participants
    const color = PARTICIPANT_COLORS[participants.length % PARTICIPANT_COLORS.length]
    set({
      participants: [
        ...participants,
        { id: generateId('Lane'), name, color },
      ],
    })
  },

  updateParticipant: (id, updates) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  removeParticipant: (id) =>
    set((s) => ({
      participants: s.participants.filter((p) => p.id !== id),
      tasks: s.tasks.filter((t) => t.participantId !== id),
    })),

  reorderParticipants: (from, to) =>
    set((s) => {
      const arr = [...s.participants]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { participants: arr }
    }),

  setStartEvent: (event) =>
    set((s) => ({ startEvent: { ...s.startEvent, ...event } })),

  addTask: (name, participantId) =>
    set((s) => ({
      tasks: [
        ...s.tasks,
        {
          id: generateId('Task'),
          name,
          type: 'userTask',
          participantId,
          description: '',
        },
      ],
    })),

  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      flows: s.flows.filter((f) => f.sourceId !== id && f.targetId !== id),
    })),

  addGateway: (name) =>
    set((s) => ({
      gateways: [
        ...s.gateways,
        { id: generateId('Gateway'), name, type: 'exclusiveGateway' },
      ],
    })),

  updateGateway: (id, updates) =>
    set((s) => ({
      gateways: s.gateways.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    })),

  removeGateway: (id) =>
    set((s) => ({
      gateways: s.gateways.filter((g) => g.id !== id),
      flows: s.flows.filter((f) => f.sourceId !== id && f.targetId !== id),
    })),

  addFlow: (sourceId, targetId, label = '') =>
    set((s) => ({
      flows: [
        ...s.flows,
        { id: generateId('Flow'), sourceId, targetId, label },
      ],
    })),

  updateFlow: (id, updates) =>
    set((s) => ({
      flows: s.flows.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),

  removeFlow: (id) =>
    set((s) => ({ flows: s.flows.filter((f) => f.id !== id) })),

  addEndEvent: (name) =>
    set((s) => ({
      endEvents: [
        ...s.endEvents,
        { id: generateId('EndEvent'), name, type: 'none' },
      ],
    })),

  updateEndEvent: (id, updates) =>
    set((s) => ({
      endEvents: s.endEvents.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  removeEndEvent: (id) =>
    set((s) => ({
      endEvents: s.endEvents.filter((e) => e.id !== id),
      flows: s.flows.filter((f) => f.sourceId !== id && f.targetId !== id),
    })),

  reset: () => set({ ...initialState, startEvent: { ...initialStartEvent, id: generateId('StartEvent') } }),

  loadState: (state) => set((s) => ({ ...s, ...state })),
}))
