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
    <div className={`rounded-2xl border border-tc-border bg-tc-panel p-5 ${className}`}>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-tc-muted">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${valueTones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-sm text-tc-muted">{sub}</div>}
    </div>
  )
}
