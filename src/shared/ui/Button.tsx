import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize    = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant
  size?:      ButtonSize
  loading?:   boolean
  fullWidth?: boolean
}

const base = [
  'inline-flex items-center justify-center gap-1.5',
  'font-semibold rounded-[10px] transition-all duration-150 select-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'focus:outline-none',
].join(' ')

const variants: Record<ButtonVariant, string> = {
  primary:   'bg-tc-green text-[#052e16] hover:brightness-110 active:brightness-95',
  secondary: 'bg-tc-surface border border-tc-border text-tc-sub hover:border-[#334155] hover:text-tc-text',
  danger:    'bg-tc-red/10 border border-tc-red/30 text-[#fca5a5] hover:bg-tc-red/20',
  ghost:     'text-tc-muted hover:text-tc-sub hover:bg-tc-surface/60',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8  px-3 text-xs',
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
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
