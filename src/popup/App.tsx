import { useEffect, useState } from 'react'
import type { AppStateResponse, CurrentTabStatusResponse } from '../shared/lib/messages'
import { isExtensionContextValid, safeSendMessage } from '../shared/lib/extensionApi'

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  try {
    return await safeSendMessage<T>({ type, payload, timestamp: Date.now() })
  } catch {
    return null
  }
}

export default function App() {
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [appState, setAppState] = useState<AppStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
    const listener = (msg: unknown) => {
      const message = msg as { type?: string; payload?: AppStateResponse }
      if (message.type === 'TC_APP_STATE_CHANGED' && message.payload) {
        setAppState(message.payload)
        setTabStatus(message.payload.tab)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    const state = await send<AppStateResponse>('TC_GET_APP_STATE')
    setAppState(state)
    setTabStatus(state?.tab ?? null)
    setLoading(false)
  }

  async function openCompanion() {
    if (!isExtensionContextValid()) { setError('TC was reloaded — refresh this tab.'); return }
    setBusy(true)
    setError(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found.')
      void send('TC_PIN_TAB')
      const sidePanel = (chrome as unknown as { sidePanel?: { open(o: { tabId: number }): Promise<void> } }).sidePanel
      if (!sidePanel) throw new Error('Chrome Side Panel API unavailable. Update Chrome to use Trader\'s Companion.')
      await sidePanel.open({ tabId: tab.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open side panel.')
    }
    setBusy(false)
  }

  async function retryDetection() {
    setBusy(true)
    await refresh()
    setBusy(false)
  }

  function openSettings() {
    chrome.runtime.openOptionsPage()
  }

  const status = tabStatus?.status ?? 'not_eligible'
  const platformName = appState?.platformName ?? tabStatus?.detectedPlatformName ?? tabStatus?.snapshot?.platformName
  const platformId = tabStatus?.detectedPlatformId ?? tabStatus?.snapshot?.adapterId

  return (
    <div
      className="w-[320px] bg-tc-bg text-tc-text"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-tc-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-tc-green text-[9px] font-black text-[#06150f]">TC</div>
          <span className="text-[12px] font-semibold text-tc-text">Trader's Companion</span>
        </div>
        <button
          onClick={openSettings}
          className="rounded px-2 py-1 text-[11px] text-tc-muted hover:text-tc-sub transition-colors"
        >
          Settings
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-center text-[11px] text-tc-muted">Checking tab...</div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          {appState?.lifecycle === 'unsupported' && (
            <UnsupportedView onSettings={openSettings} onRetry={retryDetection} busy={busy} />
          )}

          {status === 'platform_disabled' && platformName && platformId && (
            <DisabledView
              platformName={platformName}
              platformId={platformId}
              busy={busy}
              onSettings={openSettings}
              onRetry={retryDetection}
            />
          )}

          {appState && appState.lifecycle !== 'unsupported' && status !== 'platform_disabled' && (
            <LiveView
              state={appState}
              platformName={platformName}
              busy={busy}
              onOpenCompanion={openCompanion}
              onSettings={openSettings}
              onRetry={retryDetection}
            />
          )}

          {error && (
            <div className="rounded-lg bg-tc-red/10 px-3 py-2 text-[11px] leading-5 text-tc-red">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── State views ────────────────────────────────────────────────────────────────

function UnsupportedView({ onSettings, onRetry, busy }: { onSettings: () => void; onRetry: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-tc-text">Platform not recognized</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
          Trader's Companion only works on enabled trading platforms.
        </p>
      </div>
      <div className="rounded-lg bg-tc-surface px-3 py-2.5 text-[11px] text-tc-sub">
        <span className="text-tc-muted">Supported:&nbsp;</span>
        MT5 Web &nbsp;·&nbsp; Match-Trader
      </div>
      <div className="flex flex-col gap-1.5">
        <SecondaryBtn onClick={onSettings}>Open Settings</SecondaryBtn>
        <SecondaryBtn onClick={onRetry} disabled={busy}>Retry Detection</SecondaryBtn>
      </div>
    </div>
  )
}

function DisabledView({ platformName, platformId, busy, onSettings, onRetry }: {
  platformName: string
  platformId: string
  busy: boolean
  onSettings: () => void
  onRetry: () => void
}) {
  void platformId
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-tc-text">{platformName} detected</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
          This platform is currently disabled in settings.
        </p>
      </div>
      <div className="flex gap-2">
        <SecondaryBtn onClick={onRetry} disabled={busy}>Retry Detection</SecondaryBtn>
        <SecondaryBtn onClick={onSettings}>Settings</SecondaryBtn>
      </div>
    </div>
  )
}

function LiveView({ state, platformName, busy, onOpenCompanion, onSettings, onRetry }: {
  state: AppStateResponse
  platformName?: string
  busy: boolean
  onOpenCompanion: () => void
  onSettings: () => void
  onRetry: () => void
}) {
  const active = state.lifecycle === 'session_active'
  const budgetLeft = Math.max(0, state.session.dailyBudget + Math.min(0, state.session.dailyPnl))
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-tc-surface px-3 py-2.5">
        <p className="text-[13px] font-semibold text-tc-text">{platformName ?? 'Platform'} detected</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">{state.statusReason}</p>
      </div>
      {active ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Risk / trade" value={money(state.session.riskPerTrade)} />
          <MiniStat label="Trades today" value={`${state.session.tradesOpenedToday} / ${state.session.maxTrades}`} />
          <MiniStat label="Budget left" value={money(budgetLeft)} />
          <MiniStat label="Protection" value={state.session.locked ? 'Locked' : state.session.noTradeMode ? 'Paused' : 'Active'} />
        </div>
      ) : (
        <div className="rounded-lg border border-tc-border/70 px-3 py-2 text-[11px] leading-5 text-tc-muted">
          {state.lifecycle === 'detecting' ? 'Checking trading platform...' : 'Waiting for account data...'}
        </div>
      )}
      <div className="space-y-1.5">
        {state.protection.slice(0, 3).map(item => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-tc-muted">{item.label}</span>
            <span className="font-medium text-tc-sub">{item.status}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <PrimaryBtn onClick={onOpenCompanion} disabled={busy}>Open Chat</PrimaryBtn>
        <SecondaryBtn onClick={onRetry} disabled={busy}>Retry Detection</SecondaryBtn>
        <SecondaryBtn onClick={onSettings}>Settings</SecondaryBtn>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-tc-border/70 px-2.5 py-2">
      <div className="text-[10px] text-tc-muted">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-semibold text-tc-text">{value}</div>
    </div>
  )
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

// ── Shared buttons ─────────────────────────────────────────────────────────────

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-tc-green px-3 py-1.5 text-[12px] font-semibold text-[#06150f] disabled:opacity-50 hover:brightness-110 transition-all"
    >
      {children}
    </button>
  )
}

function SecondaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-tc-border bg-tc-surface px-3 py-1.5 text-[12px] font-medium text-tc-sub disabled:opacity-40 hover:border-tc-border/80 transition-colors"
    >
      {children}
    </button>
  )
}
