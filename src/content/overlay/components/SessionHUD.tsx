import { MetricCard } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'

interface Props {
  isManualMode: boolean
}

export default function SessionHUD({ isManualMode }: Props) {
  const session = useStore(s => s.session)
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const budgetLeft = Math.max(0, (session?.dailyBudget ?? 0) - dailyLoss)
  const score = session?.disciplineScore ?? 82

  return (
    <div
      className="fixed top-5 z-[2147483646] pointer-events-none"
      style={{
        left: 'calc((100vw - 420px) / 2)',
        transform: 'translateX(-50%)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div className="pointer-events-auto grid grid-cols-4 gap-2">
        <MetricCard label="Risk / trade" value={session ? `$${session.riskPerTrade.toFixed(2)}` : '$33.33'} className="min-w-[140px] p-4" />
        <MetricCard label="Daily budget" value={session ? `$${budgetLeft.toFixed(2)} left` : '$68.20 left'} className="min-w-[160px] p-4" />
        <MetricCard label="Trades" value={session ? `${session.tradesOpenedToday} / 3` : '1 / 3'} sub={isManualMode ? 'Manual mode' : undefined} className="min-w-[120px] p-4" />
        <MetricCard label="Discipline" value={`${score}`} tone={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'} className="min-w-[130px] p-4" />
      </div>
    </div>
  )
}
