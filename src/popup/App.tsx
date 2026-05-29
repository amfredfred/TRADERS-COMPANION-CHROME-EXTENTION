import { useEffect, useState } from 'react'
import { Badge, Button, Card, MetricCard } from '../shared/ui'
import type { CurrentTabStatusResponse, SessionStateResponse } from '../shared/lib/messages'
import { extensionErrorMessage, isExtensionContextValid, safeSendMessage } from '../shared/lib/extensionApi'

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  try {
    return await safeSendMessage<T>({ type, payload, timestamp: Date.now() })
  } catch (error) {
    console.error('[TC Popup] Message failed:', error)
    return null
  }
}

interface ActionResponse {
  ok?: boolean
  fallback?: boolean
  error?: string
}

type Diagnostics = Record<string, unknown>

export default function App() {
  const [session, setSession] = useState<SessionStateResponse | null>(null)
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setError(null)
    setLoading(true)
    const [sessionState, currentTab] = await Promise.all([
      send<SessionStateResponse>('TC_GET_SESSION_STATE'),
      send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS'),
    ])
    setSession(sessionState)
    setTabStatus(currentTab)
    setLoading(false)
  }

  async function openAiCompanion(forceFallback = false) {
    setError(null)
    setSuccess(null)
    setOpening(true)

    try {
      if (!isExtensionContextValid()) {
        throw new Error('TC was reloaded. Refresh this trading tab to reconnect.')
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab found.')

      const response = await safeSendMessage<ActionResponse>({
        type: forceFallback ? 'TC_OPEN_DOCKED_SIDECAR' : 'TC_OPEN_SIDE_PANEL',
        payload: { tabId: tab.id, url: tab.url, forceFallback },
        timestamp: Date.now(),
      })

      if (!response?.ok) {
        throw new Error(response?.error || 'Failed to open AI Companion.')
      }

      setSuccess(response.fallback ? 'Opened docked fallback sidecar.' : 'Opened AI Companion side panel.')
      await refresh()
    } catch (caught) {
      const message = extensionErrorMessage(caught)
      console.error('[TC] Failed to open AI Companion:', caught)
      setError(humanizeRuntimeError(message))
    } finally {
      setOpening(false)
    }
  }

  async function captureScreenshot() {
    setError(null)
    const response = await send<ActionResponse>('TC_AGENT_TOOL_REQUEST', { tool: 'captureVisibleChart' })
    if (response && response.ok === false) setError(response.error ?? 'Could not capture screenshot.')
  }

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  async function runDiagnostics() {
    setError(null)
    const result = await send<Diagnostics>('TC_RUN_DIAGNOSTICS')
    setDiagnostics(result)
    if (!result?.ok) setError(String(result?.error ?? 'Diagnostics failed.'))
  }

  async function reinjectContentScript() {
    setError(null)
    const response = await send<ActionResponse>('TC_REINJECT_CONTENT_SCRIPT', { tabId: tabStatus?.tabId ?? undefined })
    if (!response?.ok) setError(response?.error ?? 'Content script reinjection failed.')
    else {
      setSuccess('Content script reconnected.')
      await refresh()
    }
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

            <Button variant="primary" fullWidth onClick={() => void openAiCompanion(false)} loading={opening}>
              {opening ? 'Opening...' : 'Open AI Companion'}
            </Button>

            {error && (
              <div className="rounded-xl bg-tc-red/10 px-3 py-2 text-xs leading-5 text-tc-red">
                {error}
              </div>
            )}
            {success && !error && (
              <div className="rounded-xl bg-tc-green/10 px-3 py-2 text-xs leading-5 text-tc-green">
                {success}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={captureScreenshot}>Capture Screenshot</Button>
              <Button variant="secondary" onClick={refresh}>Refresh Detection</Button>
              <Button variant="secondary" onClick={() => void openAiCompanion(true)}>Open Docked Fallback</Button>
              <Button variant="secondary" onClick={reinjectContentScript}>Reinject Script</Button>
            </div>

            <Button size="sm" variant="ghost" fullWidth onClick={() => setDiagnosticsOpen(open => !open)}>
              {diagnosticsOpen ? 'Hide Diagnostics' : 'Runtime Diagnostics'}
            </Button>
          </>
        )}

        <footer className="grid grid-cols-2 gap-2 border-t border-tc-border pt-4">
          <SmallStatus label="Trades" value={session ? `${session.tradesOpenedToday}/${session.maxTrades}` : '--'} />
          <SmallStatus label="Sync" value="Session" />
        </footer>

        {diagnosticsOpen && (
          <Card padding="sm" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-tc-sub">Runtime Diagnostics</div>
                <div className="text-[11px] text-tc-muted">Side panel, storage, and content-script health.</div>
              </div>
              <Button size="sm" variant="secondary" onClick={runDiagnostics}>Run</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SmallStatus label="Context" value={isExtensionContextValid() ? 'OK' : 'Invalid'} />
              <SmallStatus label="SidePanel" value={diagnostics ? String(diagnostics.sidePanelApi ? 'Available' : 'Unavailable') : '--'} />
              <SmallStatus label="Storage" value={diagnostics ? String(diagnostics.storageAvailable ? 'Available' : 'Missing') : '--'} />
              <SmallStatus label="Content" value={diagnostics ? String(diagnostics.contentConnected ? 'Connected' : 'Disconnected') : '--'} />
            </div>
            {diagnostics?.lastError ? (
              <div className="rounded-lg bg-tc-surface px-3 py-2 text-[11px] leading-5 text-tc-sub">
                Last error: {String(diagnostics.lastError)}
              </div>
            ) : null}
          </Card>
        )}
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

function humanizeRuntimeError(message: string): string {
  if (message.includes('Extension context invalidated')) {
    return 'TC was reloaded. Refresh this trading tab to reconnect.'
  }
  if (message.includes('sidePanel') || message.includes('Side Panel')) {
    return 'Chrome Side Panel API is unavailable. Use docked fallback.'
  }
  if (message.includes('Receiving end does not exist')) {
    return 'Content script not connected. Try reinjecting or refresh the trading tab.'
  }
  if (message.includes('Cannot access') || message.includes('permission')) {
    return 'Missing extension permission for this tab. Reopen the popup on the trading tab and try again.'
  }
  return message || 'Failed to open AI Companion.'
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
