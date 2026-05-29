export type MetricTone = 'success' | 'warning' | 'danger' | 'neutral'

const valueTones: Record<MetricTone, string> = {
  success: 'text-tc-green',
  warning: 'text-tc-amber',
  danger: 'text-tc-red',
  neutral: 'text-tc-text',
}

interface Props {
  label: string
  value: string
  tone?: MetricTone
  sub?: string
  className?: string
}

export function MetricCard({ label, value, tone = 'neutral', sub, className = '' }: Props) {
  return (
    <div className={`rounded-lg border border-tc-border/80 bg-tc-surface p-4 ${className}`}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-muted">{label}</div>
      <div className={`text-xl font-semibold ${valueTones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs leading-5 text-tc-sub">{sub}</div>}
    </div>
  )
}
