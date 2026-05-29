export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'purple' | 'blue'

interface Props {
  children:   React.ReactNode
  tone?:      BadgeTone
  className?: string
}

const tones: Record<BadgeTone, string> = {
  success: 'bg-tc-green/15  border-tc-green/30  text-tc-green',
  warning: 'bg-tc-amber/15  border-tc-amber/30  text-tc-amber',
  danger:  'bg-tc-red/15    border-tc-red/30    text-[#fca5a5]',
  neutral: 'bg-tc-surface   border-tc-border    text-tc-sub',
  purple:  'bg-tc-purple/15 border-tc-purple/30 text-[#c4b5fd]',
  blue:    'bg-tc-blue/15   border-tc-blue/30   text-[#93c5fd]',
}

export function Badge({ tone = 'neutral', className = '', children }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}
