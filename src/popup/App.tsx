import { useEffect, useState } from 'react'
import { Badge, Button, Card, MetricCard } from '../shared/ui'
import type { CurrentTabStatusResponse, SessionStateResponse } from '../shared/lib/messages'

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  try {
    return await chrome.runtime.sendMessage({ type, payload, timestamp: Date.now() })
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState<SessionStateResponse | null>(null)
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    const [sessionState, currentTab] = await Promise.all([
      send<SessionStateResponse>('TC_GET_SESSION_STATE'),
      send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS'),
    ])
    setSession(sessionState)
    setTabStatus(currentTab)
    setLoading(false)
  }

  async function openSidecar() {
    await send('TC_OPEN_SIDECAR')
    await refresh()
  }

  async function captureScreenshot() {
    await send('TC_AGENT_TOOL_REQUEST', { tool: 'captureVisibleChart' })
  }

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  const status = tabStatus?.status ?? 'unsupported_page'
  const snapshot = tabStatus?.snapshot
  const modeTone = status === 'adapter_active' ? 'success' : status === 'partial_detection' ? 'warning' : status === 'manual_attach_available' ? 'warning' : 'neutral'

  return (
    <div className="w-[380px] bg-tc-bg p-3 text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Card className="space-y-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
            <div>
              <div className="text-sm font-semibold text-tc-text">Trader's Companion</div>
              <div className="text-xs text-tc-muted">Current tab control</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={openOptions}>Settings</Button>
        </header>

        {loading ? (
          <div className="py-8 text-center text-sm text-tc-muted">Checking current tab...</div>
        ) : (
          <>
            <Card padding="sm" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-tc-text">{tabStatus?.title || tabStatus?.domain || 'Current tab'}</div>
                  <div className="truncate text-xs text-tc-muted">{tabStatus?.domain || 'No tab URL available'}</div>
                </div>
                <Badge tone={modeTone}>{statusLabel(status)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Confidence" value={`${tabStatus?.confidence ?? 0}%`} className="p-3" />
                <MetricCard label="Pinned" value={tabStatus?.pinned ? 'Yes' : 'No'} tone={tabStatus?.pinned ? 'success' : 'neutral'} className="p-3" />
              </div>
              {status !== 'adapter_active' && (
                <p className="text-xs leading-5 text-tc-muted">
                  TC could not fully detect this platform, but you can still pin the AI Companion and use manual review mode.
                </p>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <Capability label="Screenshot" available={!!snapshot?.capabilities.screenshot || status !== 'not_trading_tab'} />
              <Capability label="Pinned panel" available={!!snapshot?.capabilities.pinnedCompanion || status !== 'not_trading_tab'} />
              <Capability label="Symbol" available={snapshot?.capabilities.symbolDetection !== 'unavailable'} />
              <Capability label="Order gate" available={snapshot?.capabilities.orderInterception === 'available'} />
            </div>

            <Button variant="primary" fullWidth onClick={openSidecar}>
              Open AI Companion
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={captureScreenshot}>Capture Screenshot</Button>
              <Button variant="secondary" onClick={refresh}>Refresh Detection</Button>
            </div>

            {status === 'adapter_active' && (
              <div className="grid grid-cols-3 gap-2 border-t border-tc-border pt-4">
                <Button size="sm" variant="secondary">Gate Preview</Button>
                <Button size="sm" variant="secondary">Positions</Button>
                <Button size="sm" variant="secondary">Risk</Button>
              </div>
            )}
          </>
        )}

        <footer className="grid grid-cols-2 gap-2 border-t border-tc-border pt-4">
          <SmallStatus label="Trades" value={session ? `${session.tradesOpenedToday}/${session.maxTrades}` : '--'} />
          <SmallStatus label="Sync" value="Session" />
        </footer>
      </Card>
    </div>
  )
}

function Capability({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-tc-surface px-3 py-2 text-xs">
      <span className="text-tc-muted">{label}</span>
      <span className={available ? 'text-tc-green' : 'text-tc-faint'}>{available ? 'Available' : 'Limited'}</span>
    </div>
  )
}

function SmallStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-tc-surface px-3 py-2">
      <div className="text-[11px] text-tc-muted">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-tc-sub">{value}</div>
    </div>
  )
}

function statusLabel(status: CurrentTabStatusResponse['status']) {
  switch (status) {
    case 'adapter_active':
      return 'Adapter Active'
    case 'partial_detection':
      return 'Partial Detection'
    case 'manual_attach_available':
      return 'Manual Attach Available'
    case 'unsupported_page':
      return 'Unsupported Page'
    case 'not_trading_tab':
      return 'Not a Trading Tab'
  }
}
