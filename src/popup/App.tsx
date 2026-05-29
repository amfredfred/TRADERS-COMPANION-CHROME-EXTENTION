import { useEffect, useState } from 'react'
import type { SessionStateResponse } from '../shared/lib/messages'
import { sendToBackground } from '../shared/lib/messages'
import { Button, Badge, MetricCard, AlertBox } from '../shared/ui'

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

async function getSessionState(): Promise<SessionStateResponse | null> {
  try {
    return await chrome.runtime.sendMessage({ type: 'TC_GET_SESSION_STATE', timestamp: Date.now() })
  } catch {
    return null
  }
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab ?? null
  } catch {
    return null
  }
}

async function enableOnCurrentSite(): Promise<{ ok: boolean; origin?: string; error?: string }> {
  const tab = await getCurrentTab()
  if (!tab?.url || !tab.id) return { ok: false, error: 'No active tab' }

  let origin: string
  try {
    origin = new URL(tab.url).origin
  } catch {
    return { ok: false, error: 'Cannot parse tab URL' }
  }

  if (origin === 'chrome://newtab' || origin.startsWith('chrome')) {
    return { ok: false, error: 'Cannot activate on Chrome internal pages' }
  }

  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
  if (!granted) return { ok: false, error: 'Permission denied' }

  await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['src/content/index.js'] })
  await chrome.scripting.insertCSS({ target: { tabId: tab.id! }, files: ['index.css'] })

  return { ok: true, origin }
}

export default function App() {
  const [state,         setState]         = useState<SessionStateResponse | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [currentUrl,    setCurrentUrl]    = useState<string | null>(null)
  const [enabling,      setEnabling]      = useState(false)
  const [enabledOrigin, setEnabledOrigin] = useState<string | null>(null)
  const [enableError,   setEnableError]   = useState<string | null>(null)
  const [togglingNTM,   setTogglingNTM]   = useState(false)

  useEffect(() => {
    getSessionState().then(s => { setState(s); setLoading(false) })
    getCurrentTab().then(tab => { if (tab?.url) setCurrentUrl(tab.url) })
  }, [])

  async function handleEnableHere() {
    setEnabling(true)
    setEnableError(null)
    const result = await enableOnCurrentSite()
    setEnabling(false)
    if (result.ok) {
      setEnabledOrigin(result.origin ?? null)
      setTimeout(() => getSessionState().then(setState), 1000)
    } else {
      setEnableError(result.error ?? 'Failed')
    }
  }

  async function handleToggleNoTradeMode() {
    if (!state) return
    setTogglingNTM(true)
    try {
      const type = state.noTradeMode ? 'TC_NO_TRADE_MODE_OFF' : 'TC_NO_TRADE_MODE_ON'
      await sendToBackground({ type })
      const fresh = await getSessionState()
      if (fresh) setState(fresh)
    } finally {
      setTogglingNTM(false)
    }
  }

  function openOptions() { chrome.runtime.openOptionsPage() }

  return (
    <div style={{ width: 360, fontFamily: FONT }} className="bg-tc-bg text-tc-text">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-tc-border bg-tc-panel px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-tc-green/25 bg-tc-green/10">
          <span className="text-[11px] font-black text-tc-green">TC</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-tc-text">Trader's Companion</div>
          {state && (
            <Badge
              tone={state.locked ? 'danger' : state.noTradeMode ? 'warning' : 'success'}
              className="mt-0.5"
            >
              {state.locked ? 'Locked' : state.noTradeMode ? 'No Trade Mode' : 'Protection Active'}
            </Badge>
          )}
        </div>

        <button
          onClick={openOptions}
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-tc-muted transition hover:bg-tc-surface hover:text-tc-sub"
        >
          <GearIcon />
        </button>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-[13px] text-tc-muted">
          Loading session...
        </div>
      ) : !state ? (
        <NotActiveView
          currentUrl={currentUrl}
          enabling={enabling}
          enabledOrigin={enabledOrigin}
          enableError={enableError}
          onEnable={handleEnableHere}
          onSettings={openOptions}
        />
      ) : (
        <ActiveView
          state={state}
          togglingNTM={togglingNTM}
          onToggleNTM={handleToggleNoTradeMode}
          onSettings={openOptions}
        />
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-tc-border px-4 py-2">
        <p className="text-center text-[10px] text-tc-faint">v0.1.0 · Local-first · No accounts required</p>
      </footer>
    </div>
  )
}

// ── Not-active view ──────────────────────────────────────────────────────────

function NotActiveView({
  currentUrl, enabling, enabledOrigin, enableError, onEnable, onSettings,
}: {
  currentUrl:    string | null
  enabling:      boolean
  enabledOrigin: string | null
  enableError:   string | null
  onEnable:      () => void
  onSettings:    () => void
}) {
  return (
    <div className="space-y-3 px-4 py-4">
      {enabledOrigin ? (
        <AlertBox
          tone="success"
          title="TC activated"
          body={`Now running on ${enabledOrigin}. Reload the page if the HUD isn't visible.`}
        />
      ) : (
        <AlertBox
          tone="warning"
          title="Not active on this page"
          body="TC needs permission to run on your broker's platform. Click below to activate."
        />
      )}

      {currentUrl && !enabledOrigin && (
        <div className="rounded-xl border border-tc-border bg-tc-panel px-3 py-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-muted">Current page</div>
          <div className="truncate text-[11px] text-tc-sub">{currentUrl}</div>
        </div>
      )}

      {enableError && (
        <div className="rounded-xl border border-tc-red/25 bg-tc-red/10 px-3 py-2 text-[12px] text-[#fca5a5]">
          {enableError}
        </div>
      )}

      {!enabledOrigin && (
        <Button variant="primary" size="lg" fullWidth onClick={onEnable} loading={enabling}>
          Enable TC on this platform
        </Button>
      )}

      <TrustStrip />

      <Button variant="secondary" size="md" fullWidth onClick={onSettings}>
        Configure Rules
      </Button>
    </div>
  )
}

// ── Active view ──────────────────────────────────────────────────────────────

function ActiveView({
  state, togglingNTM, onToggleNTM, onSettings,
}: {
  state:        SessionStateResponse
  togglingNTM:  boolean
  onToggleNTM:  () => void
  onSettings:   () => void
}) {
  const budgetLeft = Math.max(0, state.dailyBudget + Math.min(0, state.dailyPnl))

  return (
    <div className="space-y-3 px-4 py-4">
      {/* Status banner */}
      {state.locked ? (
        <AlertBox
          tone="danger"
          title="New entries locked"
          body={state.lockedUntil
            ? `Unlocks at ${new Date(state.lockedUntil).toLocaleTimeString()}. Existing positions remain manageable.`
            : 'Existing positions remain manageable.'}
        />
      ) : state.noTradeMode ? (
        <AlertBox
          tone="warning"
          title="No Trade Mode active"
          body="TC is blocking all new entries until this mode is released."
        />
      ) : (
        <AlertBox
          tone="success"
          title="Protection active"
          body="TC will intercept Buy/Sell attempts before they reach the broker."
        />
      )}

      {/* Metrics 2×2 */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Risk / trade" value={`$${state.riskPerTrade.toFixed(2)}`} />
        <MetricCard label="Budget left"  value={`$${budgetLeft.toFixed(0)}`} />
        <MetricCard label="Trades today" value={`${state.tradesOpenedToday} / ${state.maxTrades}`} />
        <MetricCard
          label="Discipline"
          value={`${state.disciplineScore}/100`}
          tone={state.disciplineScore >= 80 ? 'success' : state.disciplineScore >= 60 ? 'warning' : 'danger'}
        />
      </div>

      {/* Daily P&L */}
      <div className="flex items-center justify-between rounded-xl border border-tc-border bg-tc-panel px-4 py-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-muted">Daily P&L</span>
        <span className={`text-[15px] font-bold ${state.dailyPnl >= 0 ? 'text-tc-green' : 'text-tc-red'}`}>
          {state.dailyPnl >= 0 ? '+' : ''}${state.dailyPnl.toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <Button variant="primary" size="lg" fullWidth onClick={onSettings}>
        Open Dashboard
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={state.noTradeMode ? 'danger' : 'secondary'}
          size="sm"
          fullWidth
          loading={togglingNTM}
          onClick={onToggleNTM}
        >
          {state.noTradeMode ? 'Release NTM' : 'No Trade Mode'}
        </Button>
        <Button variant="secondary" size="sm" fullWidth onClick={onSettings}>
          View Trades
        </Button>
      </div>

      <Button variant="secondary" size="sm" fullWidth onClick={onSettings}>
        Edit Rules
      </Button>
    </div>
  )
}

// ── Shared ───────────────────────────────────────────────────────────────────

function TrustStrip() {
  const items: [string, string][] = [['Data', 'Local'], ['Auth', 'None'], ['AI', 'Opt-in']]
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-tc-border bg-tc-panel px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tc-faint">{label}</div>
          <div className="mt-0.5 text-[10px] font-semibold text-tc-sub">{value}</div>
        </div>
      ))}
    </div>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" clipRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  )
}
