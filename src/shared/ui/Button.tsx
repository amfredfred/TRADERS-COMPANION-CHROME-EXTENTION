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
  'inline-flex items-center justify-center gap-1.5 rounded-lg',
  'font-medium leading-none transition-all duration-100',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-tc-green/40 focus-visible:ring-offset-1 focus-visible:ring-offset-tc-bg',
  'disabled:cursor-not-allowed disabled:opacity-40',
  'active:scale-[0.97]',
].join(' ')

const variants: Record<ButtonVariant, string> = {
  primary:   'bg-tc-green text-[#06150f] hover:brightness-110',
  secondary: 'bg-tc-surface text-tc-sub hover:bg-tc-elevated hover:text-tc-text',
  danger:    'bg-tc-red/15 text-tc-red hover:bg-tc-red/20',
  ghost:     'text-tc-muted hover:bg-tc-surface hover:text-tc-text',
  subtle:    'bg-tc-surface/60 text-tc-muted hover:bg-tc-surface hover:text-tc-sub',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-5 text-sm',
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
