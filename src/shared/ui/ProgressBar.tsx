export type ProgressTone = 'success' | 'warning' | 'danger'

interface Props {
  value:       number   // 0–100
  tone?:       ProgressTone
  label?:      string
  showValue?:  boolean
  className?:  string
}

const fillCls: Record<ProgressTone, string> = {
  success: 'bg-tc-green',
  warning: 'bg-tc-amber',
  danger:  'bg-tc-red',
}

export function ProgressBar({ value, tone = 'success', label, showValue, className = '' }: Props) {
  const pct = Math.min(100, Math.max(0, value))
  const barTone = tone === 'success' && pct >= 90 ? 'danger' : tone === 'success' && pct >= 70 ? 'warning' : tone
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex justify-between text-[11px] text-tc-muted">
          {label     && <span>{label}</span>}
          {showValue && <span>{pct}%</span>}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-tc-elevated">
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillCls[barTone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
