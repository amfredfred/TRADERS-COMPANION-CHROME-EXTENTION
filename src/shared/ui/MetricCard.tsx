export type MetricTone = 'success' | 'warning' | 'danger' | 'neutral'

const valueTones: Record<MetricTone, string> = {
  success: 'text-tc-green',
  warning: 'text-tc-amber',
  danger:  'text-tc-red',
  neutral: 'text-tc-text',
}

interface Props {
  label:      string
  value:      string
  tone?:      MetricTone
  sub?:       string
  className?: string
}

export function MetricCard({ label, value, tone = 'neutral', sub, className = '' }: Props) {
  return (
    <div className={`rounded-xl border border-tc-border bg-tc-panel px-4 py-3 ${className}`}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-muted">{label}</div>
      <div className={`text-[15px] font-bold leading-tight ${valueTones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-tc-muted">{sub}</div>}
    </div>
  )
}
