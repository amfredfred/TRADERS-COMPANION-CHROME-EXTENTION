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
      <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-[#272d35] bg-[#11151b] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
        <HudItem label="Risk / trade" value={session ? `$${session.riskPerTrade.toFixed(2)}` : '$33.33'} />
        <HudItem label="Daily budget" value={session ? `$${budgetLeft.toFixed(2)} left` : '$68.20 left'} />
        <HudItem label="Trades" value={session ? `${session.tradesOpenedToday} / 3` : '1 / 3'} />
        <HudItem label="Discipline score" value={`${score}`} accent />
        {isManualMode && <HudItem label="Platform" value="Manual" warning />}
      </div>
    </div>
  )
}

function HudItem({ label, value, accent, warning }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return (
    <div className="min-w-[138px] border-r border-[#272d35] px-4 py-3 last:border-r-0">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#7d8794]">{label}</div>
      <div className={`text-sm font-semibold ${accent ? 'text-[#37d39b]' : warning ? 'text-[#d6a35d]' : 'text-[#f4f7fb]'}`}>{value}</div>
    </div>
  )
}
