import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'

interface Props {
  isManualMode: boolean
}

export default function SessionHUD({ isManualMode }: Props) {
  const session = useStore(s => s.session)
  const noTradeMode = session?.noTradeMode ?? false

  function handleNoTradeMode() {
    sendToBackground({ type: 'TC_NO_TRADE_MODE_ON', payload: { reason: 'manual' } })
      .catch(console.error)
  }

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[2147483646] pointer-events-auto"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <div className="flex items-center gap-px bg-[#0f1320] border border-[#1e2538] rounded-lg shadow-[0_4px_32px_rgba(0,0,0,0.6)] overflow-hidden">

        <HudCell
          label="RISK/TRADE"
          value={session ? `$${session.riskPerTrade.toFixed(2)}` : '—'}
          valueClass="text-[#22c55e]"
        />
        <HudDivider />
        <HudCell
          label="BUDGET LEFT"
          value={session ? `$${Math.max(0, session.dailyBudget - Math.abs(Math.min(0, session.dailyPnl))).toFixed(0)}` : '—'}
          valueClass="text-[#e2e8f0]"
        />
        <HudDivider />
        <HudCell
          label="TRADES"
          value={session ? `${session.tradesOpenedToday} / ${session.dailyBudget > 0 ? '—' : '—'}` : '— / —'}
          valueClass="text-[#e2e8f0]"
        />
        <HudDivider />
        <HudCell
          label="DISCIPLINE"
          value={session ? `${session.disciplineScore}` : '—'}
          valueClass={
            (session?.disciplineScore ?? 0) >= 80 ? 'text-[#22c55e]' :
            (session?.disciplineScore ?? 0) >= 60 ? 'text-[#f59e0b]' :
            'text-[#ef4444]'
          }
        />

        {isManualMode && (
          <>
            <HudDivider />
            <div className="px-2 py-1">
              <span className="text-[10px] text-[#f59e0b] uppercase font-medium tracking-wide">Manual Mode</span>
            </div>
          </>
        )}

        <HudDivider />
        <button
          onClick={handleNoTradeMode}
          className={`
            px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide
            transition-colors pointer-events-auto
            ${noTradeMode
              ? 'text-[#ef4444] bg-[#ef4444]/10'
              : 'text-[#64748b] hover:text-[#e2e8f0]'
            }
          `}
          title={noTradeMode ? 'No Trade Mode active' : "I'm done for today"}
        >
          {noTradeMode ? '🔴 Locked' : '🔴 Done'}
        </button>
      </div>
    </div>
  )
}

function HudCell({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="px-3 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-[#64748b] font-medium mb-0.5">{label}</div>
      <div className={`text-sm font-bold leading-none ${valueClass}`}>{value}</div>
    </div>
  )
}

function HudDivider() {
  return <div className="w-px h-8 bg-[#1e2538] self-center" />
}
