import type { HTMLAttributes } from 'react'

export type CardTone = 'default' | 'success' | 'warning' | 'danger'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface Props extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  padding?: CardPadding
}

const tones: Record<CardTone, string> = {
  default: 'border-tc-border bg-tc-panel',
  success: 'border-tc-green/25 bg-tc-green/10',
  warning: 'border-tc-amber/25 bg-tc-amber/10',
  danger: 'border-tc-red/25 bg-tc-red/10',
}

const pads: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({ tone = 'default', padding = 'md', className = '', children, ...rest }: Props) {
  return (
    <div {...rest} className={`rounded-xl border ${tones[tone]} ${pads[padding]} ${className}`}>
      {children}
    </div>
  )
}
