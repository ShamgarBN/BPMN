import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronRight, CheckCircle2, Circle,
  AlertCircle,
} from 'lucide-react'
import { useWizardStore } from '@/stores/wizardStore'

const STEPS = [
  { label: 'Process Identity', short: 'Identity' },
  { label: 'Participants & Lanes', short: 'Participants' },
  { label: 'Start Trigger', short: 'Trigger' },
  { label: 'Tasks', short: 'Tasks' },
  { label: 'Gateways', short: 'Gateways' },
  { label: 'Flows & End Events', short: 'Flows' },
]

interface AppShellProps {
  children: ReactNode
  isEditorMode: boolean
}

export function AppShell({ children, isEditorMode }: AppShellProps) {
  const { currentStep, setStep, hasGeneratedDiagram } = useWizardStore()

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — only shown in wizard mode */}
      {!isEditorMode && (
        <nav
          className="w-52 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col py-4 overflow-y-auto"
          aria-label="Wizard steps"
        >
          <div className="px-4 mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Wizard Steps</p>
          </div>

          {STEPS.map((step, index) => {
            const isCompleted = index < currentStep
            const isCurrent = index === currentStep
            const isReachable = index <= currentStep || hasGeneratedDiagram
            return (
              <button
                key={index}
                onClick={() => isReachable && setStep(index)}
                disabled={!isReachable}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors w-full',
                  isCurrent && 'bg-blue-50 text-blue-700 font-medium',
                  !isCurrent && isCompleted && 'text-gray-600 hover:bg-gray-100',
                  !isCurrent && !isCompleted && isReachable && 'text-gray-400 hover:bg-gray-100',
                  !isReachable && 'text-gray-300 cursor-not-allowed',
                )}
              >
                <span className="shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 size={16} className="text-green-500" />
                  ) : isCurrent ? (
                    <ChevronRight size={16} className="text-blue-600" />
                  ) : (
                    <Circle size={16} className="text-gray-300" />
                  )}
                </span>
                <span className="truncate">{step.label}</span>
              </button>
            )
          })}

          {hasGeneratedDiagram && (
            <>
              <div className="mx-4 my-2 border-t border-gray-200" />
              <div className="px-4 py-2 flex items-center gap-2 text-sm text-green-600 font-medium">
                <AlertCircle size={15} />
                Diagram ready
              </div>
            </>
          )}
        </nav>
      )}

      {/* Main content — must be a flex column that fills available height */}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </main>
    </div>
  )
}
