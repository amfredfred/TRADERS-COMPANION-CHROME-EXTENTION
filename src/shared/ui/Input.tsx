import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldBase = [
  'w-full rounded-lg border border-tc-border bg-tc-surface',
  'text-sm text-tc-text placeholder:text-tc-faint',
  'transition-colors focus:border-tc-green/70 focus:bg-tc-elevated focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ')

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className = '', ...rest }: InputProps) {
  return (
    <label className="block space-y-2">
      {label && <span className="block text-sm font-semibold text-tc-sub">{label}</span>}
      <input {...rest} className={`${fieldBase} h-11 px-3 ${error ? 'border-tc-red/50 focus:border-tc-red/70' : ''} ${className}`} />
      {hint && !error && <span className="block text-xs leading-5 text-tc-muted">{hint}</span>}
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
    <label className="block space-y-2">
      {label && <span className="block text-sm font-semibold text-tc-sub">{label}</span>}
      <textarea {...rest} className={`${fieldBase} min-h-[92px] resize-none px-3 py-3 leading-relaxed ${error ? 'border-tc-red/50 focus:border-tc-red/70' : ''} ${className}`} />
      {hint && !error && <span className="block text-xs leading-5 text-tc-muted">{hint}</span>}
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
    <label className="block space-y-2">
      {label && <span className="block text-sm font-semibold text-tc-sub">{label}</span>}
      <select {...rest} className={`${fieldBase} h-11 px-3 ${className}`}>
        {children}
      </select>
      {hint && <span className="block text-xs leading-5 text-tc-muted">{hint}</span>}
    </label>
  )
}
