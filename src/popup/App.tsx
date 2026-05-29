import { useEffect, useState } from 'react'
import type { SessionStateResponse } from '../shared/lib/messages'

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

  // Inject content script + CSS into the current tab
  await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['src/content/index.js'] })
  await chrome.scripting.insertCSS({ target: { tabId: tab.id! }, files: ['index.css'] })

  return { ok: true, origin }
}

export default function App() {
  const [state, setState] = useState<SessionStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [enabledOrigin, setEnabledOrigin] = useState<string | null>(null)
  const [enableError, setEnableError] = useState<string | null>(null)

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
      // Re-fetch session state after injection
      setTimeout(() => getSessionState().then(setState), 1000)
    } else {
      setEnableError(result.error ?? 'Failed')
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="w-[340px] bg-[#080c14] text-[#e2e8f0] font-[system-ui,sans-serif]">
      <header className="border-b border-[#1e2538] bg-[#0b101a] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#22c55e]/40 bg-[#22c55e]/15 text-xs font-black text-[#34d399]">
            TC
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[#f8fafc]">Trader's Companion</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#64748b]">Chrome extension</div>
          </div>
          <button
            onClick={openOptions}
            className="rounded border border-[#253047] px-2 py-1 text-[10px] font-bold text-[#94a3b8] transition hover:border-[#475569] hover:text-[#e2e8f0]"
            title="Settings"
          >
            SET
          </button>
        </div>
      </header>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-[#64748b]">Loading session...</div>
      ) : !state ? (
        <div className="px-4 py-4 space-y-3">
          {enabledOrigin ? (
            <StatusBanner tone="good" title="TC activated" body={`Trader's Companion is now running on ${enabledOrigin}. Reload the page if the HUD isn't visible.`} />
          ) : (
            <StatusBanner tone="warn" title="Not active on this page" body="TC needs permission to run on your broker's platform. Click below to activate." />
          )}

          {currentUrl && !enabledOrigin && (
            <div className="rounded-md border border-[#253047] bg-[#0f1320] px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.18em] text-[#64748b] mb-1">Current page</div>
              <div className="text-[11px] text-[#94a3b8] truncate">{currentUrl}</div>
            </div>
          )}

          {enableError && (
            <div className="rounded border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[11px] text-[#fca5a5]">
              {enableError}
            </div>
          )}

          {!enabledOrigin && (
            <button
              onClick={handleEnableHere}
              disabled={enabling}
              className="w-full rounded-md bg-[#22c55e] py-2.5 text-sm font-bold text-[#052e16] transition hover:bg-[#16a34a] disabled:opacity-50"
            >
              {enabling ? 'Activating...' : 'Enable TC on this platform'}
            </button>
          )}

          <TrustStrip />
          <button onClick={openOptions} className="w-full rounded-md border border-[#253047] bg-[#111827] py-2 text-xs font-bold text-[#94a3b8] transition hover:border-[#475569] hover:text-[#e2e8f0]">
            Configure Rules
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 py-3">
            {state.locked ? (
              <StatusBanner
                tone="danger"
                title="New entries locked"
                body={state.lockedUntil ? `Unlocks at ${new Date(state.lockedUntil).toLocaleTimeString()}. Existing positions remain manageable.` : 'Existing positions remain manageable.'}
              />
            ) : state.noTradeMode ? (
              <StatusBanner tone="warn" title="No Trade Mode active" body="TC is blocking new entries until this mode is released." />
            ) : (
              <StatusBanner tone="good" title="Protection active" body="TC will intercept detected Buy/Sell attempts before broker submission." />
            )}
          </div>

          <div className="grid grid-cols-2 gap-px border-y border-[#1e2538] bg-[#1e2538]">
            <Metric label="Risk / trade" value={`$${state.riskPerTrade.toFixed(2)}`} tone="good" />
            <Metric label="Budget left" value={`$${Math.max(0, state.dailyBudget + Math.min(0, state.dailyPnl)).toFixed(0)}`} />
            <Metric label="Trades today" value={`${state.tradesOpenedToday} / ${state.maxTrades}`} />
            <Metric label="Discipline" value={`${state.disciplineScore}/100`} tone={state.disciplineScore >= 80 ? 'good' : state.disciplineScore >= 60 ? 'warn' : 'danger'} />
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center justify-between rounded-md border border-[#253047] bg-[#0f1320] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">Daily P&L</span>
              <span className={`text-sm font-black ${state.dailyPnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                {state.dailyPnl >= 0 ? '+' : ''}${state.dailyPnl.toFixed(2)}
              </span>
            </div>

            <TrustStrip />

            <button
              onClick={openOptions}
              className="w-full rounded-md border border-[#253047] bg-[#111827] py-2.5 text-xs font-bold text-[#94a3b8] transition hover:border-[#475569] hover:text-[#e2e8f0]"
            >
              Open Settings And Trade Log
            </button>
          </div>
        </>
      )}

      <footer className="border-t border-[#1e2538] px-4 py-2">
        <p className="text-center text-[9px] uppercase tracking-[0.18em] text-[#334155]">v0.1.0 - local-first MVP</p>
      </footer>
    </div>
  )
}

function StatusBanner({ tone, title, body }: { tone: 'good' | 'warn' | 'danger'; title: string; body: string }) {
  const styles = {
    good: 'border-[#22c55e]/35 bg-[#22c55e]/10 text-[#22c55e]',
    warn: 'border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fbbf24]',
    danger: 'border-[#ef4444]/35 bg-[#ef4444]/10 text-[#fca5a5]',
  }[tone]

  return (
    <div className={`rounded-md border px-3 py-2.5 ${styles}`}>
      <div className="text-xs font-black">{title}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-[#cbd5e1]">{body}</div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'danger' }) {
  const color = tone === 'good' ? 'text-[#22c55e]' : tone === 'warn' ? 'text-[#f59e0b]' : tone === 'danger' ? 'text-[#ef4444]' : 'text-[#e2e8f0]'
  return (
    <div className="bg-[#0f1320] px-3 py-2.5">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">{label}</div>
      <div className={`text-sm font-black ${color}`}>{value}</div>
    </div>
  )
}

function TrustStrip() {
  return (
    <div className="grid grid-cols-3 gap-2">
      <TrustItem label="Data" value="Local" />
      <TrustItem label="Auth" value="None" />
      <TrustItem label="AI" value="Opt-in" />
    </div>
  )
}

function TrustItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#253047] bg-[#0f1320] px-2 py-1.5">
      <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">{label}</div>
      <div className="mt-0.5 text-[10px] font-bold text-[#cbd5e1]">{value}</div>
    </div>
  )
}
