import { useEffect, useState } from 'react'
import type { CurrentTabStatusResponse } from '../shared/lib/messages'
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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void refresh() }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    const tab = await send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS')
    setTabStatus(tab)
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

  async function enablePlatform(platformId: string) {
    setBusy(true)
    await send('TC_ENABLE_PLATFORM', { platformId, enabled: true })
    await refresh()
    setBusy(false)
  }

  function openSettings() {
    chrome.runtime.openOptionsPage()
  }

  function openPlatformTab(url: string) {
    chrome.tabs.create({ url })
  }

  const status = tabStatus?.status ?? 'not_eligible'
  const platformName = tabStatus?.detectedPlatformName ?? tabStatus?.snapshot?.platformName
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
          {status === 'not_eligible' && (
            <UnsupportedView onOpenMT5={() => openPlatformTab('https://web.metatrader.app/trading')} />
          )}

          {status === 'platform_disabled' && platformName && platformId && (
            <DisabledView
              platformName={platformName}
              platformId={platformId}
              busy={busy}
              onEnable={() => enablePlatform(platformId)}
              onSettings={openSettings}
            />
          )}

          {(status === 'candidate' || status === 'verified_platform' || status === 'adapter_active' || status === 'manual_attached') && platformName && (
            <EnabledView
              platformName={platformName}
              busy={busy}
              onOpenCompanion={openCompanion}
              onSettings={openSettings}
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

function UnsupportedView({ onOpenMT5 }: { onOpenMT5: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-tc-text">Platform not recognized</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
          This page is not a supported trading platform.
        </p>
      </div>
      <div className="rounded-lg bg-tc-surface px-3 py-2.5 text-[11px] text-tc-sub">
        <span className="text-tc-muted">Supported:&nbsp;</span>
        MT5 Web &nbsp;·&nbsp; Match-Trader
      </div>
      <div className="flex flex-col gap-1.5">
        <SecondaryBtn onClick={onOpenMT5}>Open MT5 Web</SecondaryBtn>
      </div>
    </div>
  )
}

function DisabledView({ platformName, platformId, busy, onEnable, onSettings }: {
  platformName: string
  platformId: string
  busy: boolean
  onEnable: () => void
  onSettings: () => void
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
        <PrimaryBtn onClick={onEnable} disabled={busy}>Enable Platform</PrimaryBtn>
        <SecondaryBtn onClick={onSettings}>Settings</SecondaryBtn>
      </div>
    </div>
  )
}

function EnabledView({ platformName, busy, onOpenCompanion, onSettings }: {
  platformName: string
  busy: boolean
  onOpenCompanion: () => void
  onSettings: () => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-tc-text">{platformName} detected</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
          Ready to attach.
        </p>
      </div>
      <div className="flex gap-2">
        <PrimaryBtn onClick={onOpenCompanion} disabled={busy}>Open Companion</PrimaryBtn>
        <SecondaryBtn onClick={onSettings}>Settings</SecondaryBtn>
      </div>
    </div>
  )
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
