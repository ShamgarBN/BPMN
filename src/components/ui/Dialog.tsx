import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export function Dialog({ open, onClose, title, description, children, footer, maxWidth = 'max-w-lg' }: DialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn('relative bg-white rounded-xl shadow-2xl w-full mx-4', maxWidth)}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 id="dialog-title" className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function FormField({ label, htmlFor, error, children, className }: {
  label: string
  htmlFor?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function SectionDivider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-gray-100 my-4', className)} {...props} />
}
