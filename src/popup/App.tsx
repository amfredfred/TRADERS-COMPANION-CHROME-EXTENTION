import { useEffect, useState } from 'react'
import { Badge, Button, Card, MetricCard } from '../shared/ui'
import type { SessionStateResponse } from '../shared/lib/messages'

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
    getSessionState().then(s => {
      setState(s)
      setLoading(false)
    })
  }, [])

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  const mode = state?.locked ? 'Platform Lock' : state?.noTradeMode ? 'No Trade Mode' : 'Strict Mode'
  const modeTone = state?.locked ? 'danger' : state?.noTradeMode ? 'warning' : 'success'

  return (
    <div className="w-[360px] bg-tc-bg p-3 text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Card className="space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
            <div>
              <div className="text-sm font-semibold text-tc-text">Trader's Companion</div>
              <div className="text-xs text-tc-muted">Extension control center</div>
            </div>
          </div>
          <button onClick={openOptions} className="rounded-lg px-2 py-1 text-xs font-semibold text-tc-muted hover:bg-tc-surface hover:text-tc-text" aria-label="Open settings">
            Settings
          </button>
        </header>

        <div className="flex items-center justify-between rounded-xl border border-tc-border bg-tc-surface px-3 py-2">
          <span className="text-sm text-tc-sub">Current mode</span>
          <Badge tone={modeTone}>{mode}</Badge>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-tc-muted">Loading session...</div>
        ) : !state ? (
          <Card padding="sm" tone="warning">
            <div className="text-sm font-semibold text-tc-amber">No active trading session</div>
            <p className="mt-1 text-xs leading-5 text-tc-sub">Open a supported trading platform to activate the gate.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Risk / trade" value={`$${state.riskPerTrade.toFixed(2)}`} tone="success" className="p-4" />
            <MetricCard label="Budget left" value={`$${Math.max(0, state.dailyBudget + Math.min(0, state.dailyPnl)).toFixed(0)}`} className="p-4" />
            <MetricCard label="Trades today" value={`${state.tradesOpenedToday} / ${state.maxTrades}`} className="p-4" />
            <MetricCard label="Discipline" value={`${state.disciplineScore}`} tone={state.disciplineScore >= 80 ? 'success' : state.disciplineScore >= 60 ? 'warning' : 'danger'} className="p-4" />
          </div>
        )}

        <Button variant="primary" fullWidth onClick={openOptions}>Open Dashboard</Button>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm">No Trade</Button>
          <Button variant="secondary" size="sm" onClick={openOptions}>Trades</Button>
          <Button variant="secondary" size="sm" onClick={openOptions}>Rules</Button>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-tc-border pt-4">
          <Status label="Platform" value={state ? 'Detected' : 'Waiting'} />
          <Status label="Sync" value="Local" />
        </footer>
      </Card>
    </div>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-tc-border bg-tc-surface px-3 py-2">
      <div className="text-[11px] text-tc-muted">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-tc-sub">{value}</div>
    </div>
  )
}
