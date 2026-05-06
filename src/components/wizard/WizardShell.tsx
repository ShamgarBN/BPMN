import { type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { useWizardStore } from '@/stores/wizardStore'
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-react'

const TOTAL_STEPS = 6

interface WizardShellProps {
  children: ReactNode
  onGenerate: () => void
}

export function WizardShell({ children, onGenerate }: WizardShellProps) {
  const { currentStep, setStep } = useWizardStore()

  const isFirst = currentStep === 0
  const isLast = currentStep === TOTAL_STEPS - 1

  const stepTitles = [
    'Process Identity',
    'Participants & Lanes',
    'Start Trigger',
    'Tasks',
    'Gateways',
    'Flows & End Events',
  ]
  const stepDescriptions = [
    'Name your process and describe its purpose.',
    'Define who participates in this process. Each person or system becomes a swimlane.',
    'What kicks off this process?',
    'List every action that must happen in the process.',
    'Define any decision points or branching logic.',
    'Connect the elements and define how the process ends.',
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Step header */}
      <div className="shrink-0 px-8 py-5 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">
              Step {currentStep + 1} of {TOTAL_STEPS}
            </p>
            <h1 className="text-xl font-semibold text-gray-900">{stepTitles[currentStep]}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{stepDescriptions[currentStep]}</p>
          </div>
          {/* Progress bar */}
          <div className="hidden md:flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-8 rounded-full transition-colors ${
                  i < currentStep
                    ? 'bg-green-400'
                    : i === currentStep
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>

      {/* Navigation footer */}
      <div className="shrink-0 px-8 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(currentStep - 1)}
          disabled={isFirst}
        >
          <ChevronLeft size={15} />
          Back
        </Button>

        <span className="text-xs text-gray-400">{currentStep + 1} / {TOTAL_STEPS}</span>

        {isLast ? (
          <Button variant="primary" onClick={onGenerate}>
            <Wand2 size={15} />
            Generate Diagram
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(currentStep + 1)}>
            Next
            <ChevronRight size={15} />
          </Button>
        )}
      </div>
    </div>
  )
}
