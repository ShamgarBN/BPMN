import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-gray-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-red-400 focus-visible:ring-red-400' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
        'placeholder:text-gray-400 resize-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-red-400' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
