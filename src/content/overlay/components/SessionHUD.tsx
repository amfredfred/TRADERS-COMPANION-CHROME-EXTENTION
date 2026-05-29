import { useStore } from '../../../shared/state/store'

interface Props {
  isManualMode: boolean
}

export default function SessionHUD({ isManualMode }: Props) {
  const session = useStore(s => s.session)

  const dailyLoss  = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const budgetLeft = Math.max(0, (session?.dailyBudget ?? 0) - dailyLoss)
  const score      = session?.disciplineScore ?? 82
  const scoreTone  = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'

  return (
    <div
      className="fixed top-4 left-1/2 z-[2147483646] pointer-events-none"
      style={{
        transform: 'translateX(-50%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div className="pointer-events-auto flex items-stretch overflow-hidden rounded-xl border border-tc-border bg-tc-panel shadow-tc-md">
        <HudCell label="Risk / trade" value={session ? `$${session.riskPerTrade.toFixed(2)}` : '$33.33'} />
        <Divider />
        <HudCell label="Daily budget" value={session ? `$${budgetLeft.toFixed(0)}` : '$68'} />
        <Divider />
        <HudCell label="Trades" value={session ? `${session.tradesOpenedToday} / ${session.maxTrades ?? 3}` : '1 / 3'} />
        <Divider />
        <HudCell label="Discipline" value={`${score}`} accent={scoreTone as 'green' | 'amber' | 'red'} />
        {isManualMode && (
          <>
            <Divider />
            <HudCell label="Platform" value="Manual" accent="amber" />
          </>
        )}
      </div>
    </div>
  )
}

function HudCell({
  label, value, accent,
}: {
  label:   string
  value:   string
  accent?: 'green' | 'amber' | 'red'
}) {
  const valueColor = accent === 'green' ? 'text-tc-green'
    : accent === 'amber' ? 'text-tc-amber'
    : accent === 'red'   ? 'text-tc-red'
    : 'text-tc-text'

  return (
    <div className="min-w-[110px] px-4 py-2.5">
      <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-tc-muted">{label}</div>
      <div className={`text-[13px] font-semibold ${valueColor}`}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px self-stretch bg-tc-border" />
}
