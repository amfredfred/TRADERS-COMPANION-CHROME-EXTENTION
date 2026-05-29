import { useStore } from '../../../shared/state/store'

interface Props {
  isManualMode: boolean
}

export default function SessionHUD({ isManualMode }: Props) {
  const session = useStore(s => s.session)
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const budgetLeft = Math.max(0, (session?.dailyBudget ?? 0) - dailyLoss)
  const budgetPct = session?.dailyBudget ? Math.round((budgetLeft / session.dailyBudget) * 100) : 0
  const score = session?.disciplineScore ?? 0
  const scoreLabel = score >= 80 ? 'Good' : score >= 60 ? 'Watch' : 'Poor'

  return (
    <div className="fixed left-1/2 top-[108px] z-[2147483646] -translate-x-1/2 pointer-events-auto" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex min-w-[700px] overflow-hidden rounded-lg border border-[#1f2a3f] bg-[#0d131d]/92 shadow-[0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <HudMetric
          label="Risk Per Trade"
          value={session ? `${((session.riskPerTrade / Math.max(session.accountBalance || 1, 1)) * 100).toFixed(2)}%` : '--'}
          sub={session ? `$${session.riskPerTrade.toFixed(2)}` : 'No session'}
        />
        <HudMetric
          label="Daily Budget Left"
          value={session ? `$${budgetLeft.toFixed(2)}` : '--'}
          sub={session ? `${budgetPct}% of $${session.dailyBudget.toFixed(0)}` : 'Local session'}
        />
        <HudMetric
          label="Trades Taken Today"
          value={session ? `${session.tradesOpenedToday} / 3` : '--'}
          sub={isManualMode ? 'Manual mode' : 'Adapter active'}
        />
        <div className="flex min-w-[230px] items-center gap-5 px-5 py-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Discipline Score</div>
            <div className="text-xl font-bold leading-none text-[#22c55e]">{session ? score : '--'}</div>
            <div className="mt-1 text-xs font-medium text-[#22c55e]">{session ? scoreLabel : 'Waiting'}</div>
          </div>
          <Sparkline />
        </div>
      </div>
    </div>
  )
}

function HudMetric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-[170px] border-r border-[#1f2a3f] px-5 py-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">{label}</div>
      <div className="text-xl font-semibold leading-none text-[#f8fafc]">{value}</div>
      <div className="mt-1 text-xs text-[#cbd5e1]">{sub}</div>
    </div>
  )
}

function Sparkline() {
  return (
    <svg width="92" height="42" viewBox="0 0 92 42" className="shrink-0" aria-hidden="true">
      <path d="M2 34 L10 29 L17 31 L24 21 L31 25 L38 16 L45 20 L52 9 L59 13 L66 7 L73 15 L80 5 L89 9" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
