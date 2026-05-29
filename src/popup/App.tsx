import { useState, useEffect } from 'react'
import type { SessionStateResponse } from '../shared/lib/messages'

// Popup runs in its own page context — direct chrome.runtime calls, no content script bridge
async function getSessionState(): Promise<SessionStateResponse | null> {
  try {
    return await chrome.runtime.sendMessage({ type: 'TC_GET_SESSION_STATE', timestamp: Date.now() })
  } catch {
    return null
  }
}

export default function App() {
  const [state, setState] = useState<SessionStateResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSessionState().then(s => { setState(s); setLoading(false) })
  }, [])

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="w-[320px] bg-[#0a0c12] text-[#e2e8f0] font-[system-ui,sans-serif]">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2538]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#22c55e]/20 flex items-center justify-center">
            <span className="text-[#22c55e] text-xs font-bold">TC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#e2e8f0]">Trader's Companion</div>
            <div className="text-[9px] uppercase tracking-widest text-[#64748b]">Session active</div>
          </div>
        </div>
        <button
          onClick={openOptions}
          className="text-[#64748b] hover:text-[#94a3b8] transition-colors"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-center text-[#64748b] text-sm">Loading session…</div>
      ) : !state ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[#64748b] text-sm">No active session.</p>
          <p className="text-[#64748b] text-xs mt-1">Open a trading platform to begin.</p>
        </div>
      ) : (
        <>
          {/* Lock banner */}
          {state.locked && (
            <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/30 px-4 py-2.5 flex items-center gap-2">
              <span className="text-[#ef4444] text-sm">🔴</span>
              <div>
                <div className="text-[#ef4444] text-xs font-semibold">Platform Locked</div>
                {state.lockedUntil && (
                  <div className="text-[#ef4444]/70 text-[10px]">
                    Until {new Date(state.lockedUntil).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No Trade Mode banner */}
          {state.noTradeMode && !state.locked && (
            <div className="bg-[#f59e0b]/10 border-b border-[#f59e0b]/30 px-4 py-2 flex items-center gap-2">
              <span className="text-[#f59e0b] text-xs font-semibold">No Trade Mode active</span>
            </div>
          )}

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-px bg-[#1e2538] border-b border-[#1e2538]">
            <Metric label="Risk / Trade"       value={`$${state.riskPerTrade.toFixed(2)}`}      color="text-[#22c55e]" />
            <Metric label="Daily Budget Left"  value={`$${Math.max(0, state.dailyBudget + Math.min(0, state.dailyPnl)).toFixed(0)}`} color="text-[#e2e8f0]" />
            <Metric label="Trades Today"       value={`${state.tradesOpenedToday} / ${state.maxTrades}`} color="text-[#e2e8f0]" />
            <Metric
              label="Discipline Score"
              value={`${state.disciplineScore}/100`}
              color={state.disciplineScore >= 80 ? 'text-[#22c55e]' : state.disciplineScore >= 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}
            />
          </div>

          {/* Daily P&L */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-[#1e2538]">
            <span className="text-[10px] uppercase tracking-widest text-[#64748b]">Daily P&L</span>
            <span className={`text-base font-bold ${state.dailyPnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              {state.dailyPnl >= 0 ? '+' : ''}${state.dailyPnl.toFixed(2)}
            </span>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 space-y-2">
            <button
              onClick={openOptions}
              className="w-full py-2 rounded border border-[#1e2538] text-[#94a3b8] text-xs font-medium hover:border-[#2e3548] hover:text-[#e2e8f0] transition-colors"
            >
              View Trade Log & Settings
            </button>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#1e2538]">
        <p className="text-[9px] text-[#1e2538] text-center uppercase tracking-widest">v0.1.0 · Trader's Companion</p>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0f1320] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-widest text-[#64748b] mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  )
}
