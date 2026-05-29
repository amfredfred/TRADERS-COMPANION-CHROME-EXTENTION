import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldBase = [
  'w-full rounded-xl bg-tc-surface px-3.5',
  'text-sm text-tc-text placeholder:text-tc-faint',
  'border border-white/[0.06] transition-colors',
  'focus:border-tc-green/40 focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-40',
].join(' ')

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', ...rest }: InputProps) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-xs font-medium text-tc-muted">{label}</span>}
      <input
        {...rest}
        className={`${fieldBase} h-10 ${error ? 'border-tc-red/40 focus:border-tc-red/60' : ''} ${className}`}
      />
      {hint && !error && <span className="block text-xs text-tc-faint">{hint}</span>}
      {error && <span className="block text-xs text-tc-red">{error}</span>}
    </label>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, className = '', ...rest }: TextareaProps) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-xs font-medium text-tc-muted">{label}</span>}
      <textarea
        {...rest}
        className={`${fieldBase} min-h-[88px] resize-none py-2.5 leading-relaxed ${error ? 'border-tc-red/40 focus:border-tc-red/60' : ''} ${className}`}
      />
      {hint && !error && <span className="block text-xs text-tc-faint">{hint}</span>}
      {error && <span className="block text-xs text-tc-red">{error}</span>}
    </label>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
}

export function Select({ label, hint, className = '', children, ...rest }: SelectProps) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-xs font-medium text-tc-muted">{label}</span>}
      <select {...rest} className={`${fieldBase} h-10 ${className}`}>
        {children}
      </select>
      {hint && <span className="block text-xs text-tc-faint">{hint}</span>}
    </label>
  )
}
