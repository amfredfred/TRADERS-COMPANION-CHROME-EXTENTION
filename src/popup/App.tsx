import { useEffect, useState } from 'react'
import type { CurrentTabStatusResponse, SessionStateResponse } from '../shared/lib/messages'
import type { TabDetectionState } from '../shared/types/platform'
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
  const [session, setSession] = useState<SessionStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void refresh() }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    const [tab, sess] = await Promise.all([
      send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS'),
      send<SessionStateResponse>('TC_GET_SESSION_STATE'),
    ])
    setTabStatus(tab)
    setSession(sess)
    setLoading(false)
  }

  async function attachManually() {
    if (!isExtensionContextValid()) { setError('TC was reloaded — refresh this tab.'); return }
    setBusy(true)
    setError(null)
    const result = await send<{ ok: boolean; error?: string }>('TC_PIN_TAB')
    if (!result?.ok) setError(result?.error ?? 'Could not attach to tab.')
    await refresh()
    setBusy(false)
  }

  async function openCompanion() {
    if (!isExtensionContextValid()) { setError('TC was reloaded — refresh this tab.'); return }
    setBusy(true)
    setError(null)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const result = await send<{ ok: boolean; error?: string }>('TC_OPEN_SIDE_PANEL', { tabId: tab?.id })
    if (!result?.ok) setError(result?.error ?? 'Could not open side panel.')
    setBusy(false)
  }

  async function captureScreenshot() {
    setBusy(true)
    const result = await send<{ ok: boolean; error?: string }>('TC_AGENT_TOOL_REQUEST', { tool: 'captureVisibleChart' })
    if (!result?.ok) setError(result?.error ?? 'Screenshot capture failed.')
    setBusy(false)
  }

  const state: TabDetectionState = tabStatus?.status ?? 'not_eligible'
  const snapshot = tabStatus?.snapshot

  return (
    <div
      className="w-[340px] bg-tc-bg text-tc-text"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-tc-border/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-tc-green text-[10px] font-black text-[#06150f]">TC</div>
          <span className="text-[13px] font-semibold text-tc-text">Trader's Companion</span>
        </div>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="rounded px-2 py-1 text-[11px] text-tc-muted hover:text-tc-sub transition-colors"
        >
          Settings
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-[12px] text-tc-muted">Checking tab...</div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {/* Tab info + status pill */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-tc-text leading-5">
                {snapshot?.platformName ?? tabStatus?.title ?? tabStatus?.domain ?? 'Current tab'}
              </div>
              <div className="truncate text-[11px] text-tc-muted leading-4 mt-0.5">
                {tabStatus?.domain || 'No URL available'}
              </div>
            </div>
            <StatePill state={state} />
          </div>

          {/* State description */}
          <StateDescription state={state} symbol={snapshot?.symbol} />

          {/* Session row — only when there is live data */}
          {session && (session.tradesOpenedToday > 0 || session.accountBalance > 0) && (
            <div className="flex gap-2">
              <Metric label="Trades" value={`${session.tradesOpenedToday}/${session.maxTrades}`} />
              {session.accountBalance > 0 && (
                <Metric label="P&L" value={formatPnl(session.dailyPnl)} tone={session.dailyPnl >= 0 ? 'green' : 'red'} />
              )}
              {session.locked && <Metric label="Status" value="Locked" tone="red" />}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-tc-red/10 px-3 py-2 text-[11px] leading-5 text-tc-red">
              {error}
            </div>
          )}

          {/* Actions — context-sensitive */}
          <ActionBar
            state={state}
            busy={busy}
            onAttach={attachManually}
            onOpenCompanion={openCompanion}
            onRefresh={refresh}
            onCapture={captureScreenshot}
          />
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatePill({ state }: { state: TabDetectionState }) {
  const config: Record<TabDetectionState, { label: string; cls: string }> = {
    not_eligible:     { label: 'Not Trading Tab',    cls: 'bg-tc-surface text-tc-faint' },
    candidate:        { label: 'Possible Trading',   cls: 'bg-amber-500/15 text-amber-400' },
    verified_platform:{ label: 'Verified Platform',  cls: 'bg-blue-500/15 text-blue-400' },
    manual_attached:  { label: 'Manual Attached',    cls: 'bg-blue-500/15 text-blue-400' },
    adapter_active:   { label: 'Adapter Active',     cls: 'bg-tc-green/15 text-tc-green' },
  }
  const { label, cls } = config[state]
  return (
    <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}

function StateDescription({ state, symbol }: { state: TabDetectionState; symbol?: string | null }) {
  const descriptions: Record<TabDetectionState, string> = {
    not_eligible:     'No trading signals detected on this page.',
    candidate:        'Weak trading signals detected. Attach manually to enable review mode.',
    verified_platform:'Platform confirmed. Open the companion to start your session.',
    manual_attached:  'Manually attached. Screenshot review and manual trade logging available.',
    adapter_active:   `Adapter connected${symbol ? ` · ${symbol}` : ''}. Order interception and full review enabled.`,
  }
  return (
    <p className="text-[11px] leading-[1.6] text-tc-muted">
      {descriptions[state]}
    </p>
  )
}

function ActionBar({ state, busy, onAttach, onOpenCompanion, onRefresh, onCapture }: {
  state: TabDetectionState
  busy: boolean
  onAttach: () => void
  onOpenCompanion: () => void
  onRefresh: () => void
  onCapture: () => void
}) {
  const canCompanion = state === 'verified_platform' || state === 'manual_attached' || state === 'adapter_active'
  const canAttach    = state === 'not_eligible' || state === 'candidate'
  const canCapture   = state === 'adapter_active'

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {canCompanion && (
        <PrimaryBtn onClick={onOpenCompanion} disabled={busy}>
          Open Companion
        </PrimaryBtn>
      )}

      {canAttach && (
        <PrimaryBtn onClick={onAttach} disabled={busy}>
          Attach Manually
        </PrimaryBtn>
      )}

      {canCompanion && (
        <SecondaryBtn onClick={onOpenCompanion} disabled={busy}>
          Start Session
        </SecondaryBtn>
      )}

      {canCapture && (
        <SecondaryBtn onClick={onCapture} disabled={busy}>
          Capture Screenshot
        </SecondaryBtn>
      )}

      <SecondaryBtn onClick={onRefresh} disabled={busy}>
        Refresh
      </SecondaryBtn>
    </div>
  )
}

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

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const valueClass = tone === 'green' ? 'text-tc-green' : tone === 'red' ? 'text-tc-red' : 'text-tc-sub'
  return (
    <div className="flex-1 rounded-lg bg-tc-surface px-2.5 py-2">
      <div className="text-[10px] text-tc-muted">{label}</div>
      <div className={`mt-0.5 text-[12px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : ''
  return `${sign}$${Math.abs(pnl).toFixed(2)}`
}
