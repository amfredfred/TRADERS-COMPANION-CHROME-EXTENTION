export type ProgressTone = 'success' | 'warning' | 'danger'

interface Props {
  value: number
  tone?: ProgressTone
  label?: string
  showValue?: boolean
  className?: string
}

const fillCls: Record<ProgressTone, string> = {
  success: 'bg-tc-green',
  warning: 'bg-tc-amber',
  danger: 'bg-tc-red',
}

export function ProgressBar({ value, tone = 'success', label, showValue, className = '' }: Props) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-2 flex justify-between text-xs text-tc-muted">
          {label && <span>{label}</span>}
          {showValue && <span>{pct}%</span>}
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-tc-elevated">
        <div className={`h-full rounded-full transition-all duration-300 ${fillCls[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
