import { AlertCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { type ValidationResult } from '@/services/bpmnValidator'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface ValidationPanelProps {
  result: ValidationResult
  onClose: () => void
  onProceed?: () => void
}

export function ValidationPanel({ result, onClose, onProceed }: ValidationPanelProps) {
  const errors = result.issues.filter((i) => i.severity === 'error')
  const warnings = result.issues.filter((i) => i.severity === 'warning')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {result.valid ? (
              <CheckCircle2 size={18} className="text-green-500" />
            ) : (
              <AlertCircle size={18} className="text-red-500" />
            )}
            <h2 className="text-base font-semibold text-gray-900">Diagram Validation</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {result.issues.length === 0 ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-4 text-sm">
              <CheckCircle2 size={16} />
              No issues found. Your diagram looks good!
            </div>
          ) : (
            result.issues.map((issue, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg p-3 text-sm',
                  issue.severity === 'error'
                    ? 'bg-red-50 text-red-800'
                    : 'bg-amber-50 text-amber-800'
                )}
              >
                {issue.severity === 'error' ? (
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
                ) : (
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                )}
                <span>{issue.message}</span>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
          <div className="flex gap-3 text-xs text-gray-500">
            {errors.length > 0 && (
              <span className="text-red-600 font-medium">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
            )}
            {warnings.length > 0 && (
              <span className="text-amber-600 font-medium">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
            )}
            {result.issues.length === 0 && (
              <span className="text-green-600 font-medium">All checks passed</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {result.valid ? 'Close' : 'Fix Issues'}
            </Button>
            {onProceed && (
              <Button
                variant="primary"
                onClick={onProceed}
                disabled={!result.valid && errors.length > 0}
                title={errors.length > 0 ? 'Fix errors before generating' : 'Generate diagram'}
              >
                {result.valid || errors.length === 0 ? 'Generate Anyway' : 'Cannot Generate'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
