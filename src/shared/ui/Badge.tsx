import type { HTMLAttributes } from 'react'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'purple' | 'blue'

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const tones: Record<BadgeTone, string> = {
  success: 'bg-tc-green/12 border-tc-green/30 text-tc-green',
  warning: 'bg-tc-amber/12 border-tc-amber/30 text-tc-amber',
  danger: 'bg-tc-red/12 border-tc-red/30 text-tc-red',
  neutral: 'bg-tc-surface border-tc-border text-tc-sub',
  purple:  'bg-tc-purple/15 border-tc-purple/30 text-[#c4b5fd]',
  blue:    'bg-tc-blue/15   border-tc-blue/30   text-[#93c5fd]',
}

export function Badge({ tone = 'neutral', className = '', children, ...rest }: Props) {
  return (
    <span {...rest} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Pill({ tone = 'neutral', className = '', children, ...rest }: Props) {
  return (
    <span {...rest} className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}
