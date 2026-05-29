import type { HTMLAttributes } from 'react'

export type CardTone = 'default' | 'success' | 'warning' | 'danger'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface Props extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  padding?: CardPadding
}

const tones: Record<CardTone, string> = {
  default: 'bg-tc-panel',
  success: 'bg-tc-green/8 ring-1 ring-tc-green/15',
  warning: 'bg-tc-amber/8 ring-1 ring-tc-amber/15',
  danger:  'bg-tc-red/8 ring-1 ring-tc-red/15',
}

const pads: Record<CardPadding, string> = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
}

export function Card({ tone = 'default', padding = 'md', className = '', children, ...rest }: Props) {
  return (
    <div {...rest} className={`rounded-xl ${tones[tone]} ${pads[padding]} ${className}`}>
      {children}
    </div>
  )
}
