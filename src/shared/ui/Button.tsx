import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const base = [
  'inline-flex items-center justify-center gap-2 rounded-xl',
  'font-semibold transition-colors duration-150',
  'focus:outline-none focus-visible:border-tc-green/60',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ')

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-tc-green text-[#06150f] hover:bg-[#37d39b]',
  secondary: 'border border-tc-border bg-tc-surface text-tc-text hover:bg-tc-elevated',
  danger: 'border border-tc-red/30 bg-tc-red/10 text-tc-red hover:bg-tc-red/15',
  ghost: 'text-tc-muted hover:bg-tc-surface hover:text-tc-text',
  subtle: 'bg-tc-panel text-tc-sub hover:bg-tc-surface hover:text-tc-text',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  fullWidth,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
