import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldBase = 'w-full rounded-[10px] border bg-tc-surface px-3 text-[13px] text-tc-text placeholder:text-tc-faint transition-colors focus:outline-none'
const borderNormal = 'border-tc-border focus:border-tc-green/50'
const borderError  = 'border-tc-red/40 focus:border-tc-red/60'

// ── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?:  string
  error?: string
}

export function Input({ label, hint, error, className = '', ...rest }: InputProps) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-[12px] font-medium text-tc-sub">{label}</span>}
      <input
        {...rest}
        className={`${fieldBase} h-10 ${error ? borderError : borderNormal} ${className}`}
      />
      {hint  && !error && <span className="block text-[11px] text-tc-muted">{hint}</span>}
      {error && <span className="block text-[11px] text-[#fca5a5]">{error}</span>}
    </label>
  )
}

// ── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?:  string
  error?: string
}

export function Textarea({ label, hint, error, className = '', ...rest }: TextareaProps) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-[12px] font-medium text-tc-sub">{label}</span>}
      <textarea
        {...rest}
        className={`${fieldBase} resize-none py-2.5 leading-relaxed ${error ? borderError : borderNormal} ${className}`}
      />
      {hint  && !error && <span className="block text-[11px] text-tc-muted">{hint}</span>}
      {error && <span className="block text-[11px] text-[#fca5a5]">{error}</span>}
    </label>
  )
}
