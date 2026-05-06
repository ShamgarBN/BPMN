import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm appearance-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'%236b7280\'%3E%3Cpath fill-rule=\'evenodd\' d=\'M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z\' clip-rule=\'evenodd\'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_8px_center] bg-[length:16px] pr-8',
        error ? 'border-red-400' : 'border-gray-300',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'
