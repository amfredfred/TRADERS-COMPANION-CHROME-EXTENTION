import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Clock, LayoutDashboard, MessageCircle, Paperclip, Pin, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, SectionHeader, Select, StatRow, Toggle } from '../shared/ui'
import { TC_AI_STREAM_PORT } from '../shared/lib/messages'
import type { AppStateResponse, CurrentTabStatusResponse } from '../shared/lib/messages'
import type { AIStreamChunk } from '../shared/ai/types'
import type { ChartCaptureResult } from '../shared/types/chart'
import { getActiveAccount, getLiveSession, getPlaybooks, getSettings, patchLiveSession, saveSettings } from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import type { PlatformCapabilities } from '../shared/types/platform'
import type { AiProvider, Playbook, SessionSettings } from '../shared/types/playbook'
import { isExtensionContextValid, safeSendMessage } from '../shared/lib/extensionApi'
import { ChatTab } from './Chat'
import type { ChatMessage, QuickPromptMeta } from './Chat'
import { getChatIntent, CHART_CAPTURE_INTENTS } from '../shared/ai/chatIntent'
import type { ChatIntent } from '../shared/ai/chatIntent'

type SidecarTab = 'dashboard' | 'chat' | 'session' | 'playbook'

const TABS = [
  { id: 'dashboard' as SidecarTab, label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'chat'      as SidecarTab, label: 'Chat',      Icon: MessageCircle   },
  { id: 'session'   as SidecarTab, label: 'Session',   Icon: Clock           },
  { id: 'playbook'  as SidecarTab, label: 'Playbook',  Icon: BookOpen        },
]

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  try {
    return await safeSendMessage<T>({ type, payload, timestamp: Date.now() })
  } catch {
    return null
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<SidecarTab>('dashboard')
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [appState, setAppState] = useState<AppStateResponse | null>(null)
  const [session, setSession] = useState<LiveSessionState | null>(null)
  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [activePlaybookId, setActivePlaybookId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [hasAnnotations, setHasAnnotations] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const aiPortRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    void refresh()
    const messageListener = (msg: unknown) => {
      const message = msg as { type?: string; payload?: AppStateResponse }
      if ((message.type === 'TC_APP_STATE_CHANGED' || message.type === 'SESSION_STATE_UPDATED') && message.payload) {
        setAppState(message.payload)
        setTabStatus(message.payload.tab)
        void hydrateLocalState()
      }
    }
    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (
        (areaName === 'session' && changes.liveSession) ||
        (areaName === 'local' && (changes.settings || Object.keys(changes).some(key => key.startsWith('playbooks_'))))
      ) {
        void refresh()
      }
    }
    chrome.runtime.onMessage.addListener(messageListener)
    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTab])

  useEffect(() => {
    return () => {
      aiPortRef.current?.disconnect()
      aiPortRef.current = null
    }
  }, [])

  async function refresh() {
    const [state, live, savedSettings, account] = await Promise.all([
      send<AppStateResponse>('TC_GET_APP_STATE'),
      getLiveSession(),
      getSettings(),
      getActiveAccount(),
    ])
    const savedPlaybooks = await getPlaybooks(account?.id ?? 'default')
    setAppState(state)
    setTabStatus(state?.tab ?? null)
    setSession(live)
    setSettings(savedSettings)
    setPlaybooks(savedPlaybooks)
    setActivePlaybookId(current => current || savedPlaybooks.find(playbook => playbook.active)?.id || savedPlaybooks[0]?.id || '')
  }

  async function hydrateLocalState() {
    const [live, savedSettings, account] = await Promise.all([
      getLiveSession(),
      getSettings(),
      getActiveAccount(),
    ])
    const savedPlaybooks = await getPlaybooks(account?.id ?? 'default')
    setSession(live)
    setSettings(savedSettings)
    setPlaybooks(savedPlaybooks)
    setActivePlaybookId(current => current || savedPlaybooks.find(playbook => playbook.active)?.id || savedPlaybooks[0]?.id || '')
  }

  async function unpin() {
    await send('TC_UNPIN_TAB')
    await refresh()
  }

  async function handleProviderChange(provider: AiProvider) {
    if (!settings) return
    const updated = { ...settings, aiProvider: provider }
    setSettings(updated)
    await saveSettings(updated)
  }

  async function submitPrompt(promptText?: string, meta?: QuickPromptMeta) {
    const prompt = (promptText ?? input).trim()
    if (!prompt || busy) return

    // Standalone chart capture — no AI turn.
    if (meta?.captureChart) {
      await captureScreenshot()
      return
    }

    // Classify intent from the message text (quick prompts supply it directly).
    const intent: ChatIntent = meta?.intent ?? getChatIntent(prompt)

    setActiveTab('chat')
    setInput('')
    setBusy(true)

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, at: Date.now() }
    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '', at: Date.now() }
    const history = messages
      .filter(message => message.content.trim())
      .slice(-12)
      .map(message => ({ role: message.role, content: message.content }))

    setMessages(current => [...current, userMessage, assistantMessage])
    setStreamingMessageId(assistantId)

    aiPortRef.current?.disconnect()

    try {
      const port = chrome.runtime.connect({ name: TC_AI_STREAM_PORT })
      aiPortRef.current = port

      port.onMessage.addListener((message: AIStreamChunk) => {
        if (message.type === 'activity') return

        if (message.type === 'screenshot') {
          const dataUrl = message.screenshotDataUrl
          if (dataUrl) {
            setMessages(current => current.map(item =>
              item.id === userMessage.id ? { ...item, screenshotDataUrl: dataUrl } : item
            ))
          }
          return
        }

        if (message.type === 'annotations') {
          if ((message.annotations?.length ?? 0) > 0) {
            setHasAnnotations(true)
          }
          return
        }

        if (message.type === 'delta') {
          const delta = message.delta ?? ''
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: item.content + delta } : item))
          return
        }

        if (message.type === 'done') {
          finishStream(port)
          return
        }

        if (message.type === 'error') {
          setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: message.error || 'AI request failed.', isError: true } : item))
          finishStream(port)
        }
      })

      port.onDisconnect.addListener(() => {
        if (aiPortRef.current === port) aiPortRef.current = null
        setBusy(false)
        setStreamingMessageId(null)
      })

      port.postMessage({
        type: 'TC_AI_STREAM_START',
        payload: {
          tabId: CHART_CAPTURE_INTENTS.has(intent) && tabStatus?.pinned
            ? tabStatus.tabId ?? undefined
            : undefined,
          prompt,
          messages: history,
          intent,
        },
      })
    } catch (error) {
      setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: streamErrorMessage(error), isError: true } : item))
      setBusy(false)
      setStreamingMessageId(null)
    }
  }

  function finishStream(port: chrome.runtime.Port) {
    setBusy(false)
    setStreamingMessageId(null)
    if (aiPortRef.current === port) aiPortRef.current = null
    try {
      port.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  function stopStreaming() {
    aiPortRef.current?.postMessage({ type: 'TC_AI_STREAM_CANCEL' })
    aiPortRef.current?.disconnect()
    aiPortRef.current = null
    setBusy(false)
    setStreamingMessageId(null)
  }

  async function captureScreenshot() {
    setActiveTab('chat')
    setBusy(true)

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Capture connected chart',
      at: Date.now(),
    }
    setMessages(current => [...current, userMessage])

    const result = await send<ChartCaptureResult>('TC_CAPTURE_CHART_REGION')

    if (result?.ok) {
      setMessages(current => current.map(item =>
        item.id === userMessage.id
          ? { ...item, screenshotDataUrl: result.croppedDataUrl }
          : item
      ))
    } else {
      setMessages(current => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: result?.error ?? 'Chart capture failed.',
          at: Date.now(),
          isError: true,
        },
      ])
    }

    setBusy(false)
  }

  async function clearAnnotations() {
    await send('TC_CLEAR_CHART_ANNOTATIONS')
    setHasAnnotations(false)
  }

  async function setNoTradeMode(checked: boolean) {
    if (!session) return
    await patchLiveSession({ noTradeMode: checked, noTradeModeReason: checked ? 'Manual sidecar toggle' : undefined })
    await refresh()
  }

  async function resetSession() {
    if (!isExtensionContextValid()) return
    if (session?.accountKey && session.platform) {
      await chrome.storage.session.remove(`tc.session.${session.platform}:${session.accountKey}:${new Date().toISOString().slice(0, 10)}`)
    }
    await chrome.storage.session.remove('liveSession')
    await refresh()
  }

  const [refreshedAt, setRefreshedAt] = useState(() => Date.now())

  async function refreshAndMark() {
    await refresh()
    setRefreshedAt(Date.now())
  }

  const status = tabStatus?.status ?? 'not_eligible'
  const attached = !!tabStatus?.tabId && status !== 'not_eligible'
  const activePlaybook = playbooks.find(playbook => playbook.id === activePlaybookId) ?? playbooks.find(playbook => playbook.active) ?? playbooks[0]

  return (
    <div className="flex h-screen flex-col bg-tc-bg text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidecarHeader
        status={status}
        domain={tabStatus?.domain ?? ''}
        snapshot={tabStatus?.snapshot}
        onRefresh={refreshAndMark}
        onUnpin={unpin}
      />

      <nav className="grid grid-cols-4 border-b border-tc-border/50 bg-tc-panel">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`relative flex h-12 items-center justify-center gap-1.5 text-xs font-medium transition-colors ${
                active ? 'text-tc-text' : 'text-tc-faint hover:bg-tc-surface/30 hover:text-tc-sub'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
              {active && <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-tc-green" />}
            </button>
          )
        })}
      </nav>

      <main className={`min-h-0 flex-1 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'tc-scrollbar overflow-y-auto p-4'}`}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            attached={attached}
            tabStatus={tabStatus}
            appState={appState}
            session={session}
            settings={settings}
          />
        )}

        {activeTab === 'chat' && (
          <ChatTab
            settings={settings}
            messages={messages}
            busy={busy}
            streamingMessageId={streamingMessageId}
            input={input}
            bottomRef={bottomRef}
            hasAnnotations={hasAnnotations}
            onInput={setInput}
            onSubmit={() => void submitPrompt()}
            onPrompt={(prompt, meta) => void submitPrompt(prompt, meta)}
            onStop={stopStreaming}
            onClearAnnotations={() => void clearAnnotations()}
            onProviderChange={handleProviderChange}
          />
        )}

        {activeTab === 'session' && (
          <SessionTab
            session={session}
            settings={settings}
            onNoTradeMode={setNoTradeMode}
            onReset={resetSession}
          />
        )}

        {activeTab === 'playbook' && (
          <PlaybookTab
            playbooks={playbooks}
            activePlaybook={activePlaybook}
            activePlaybookId={activePlaybookId}
            settings={settings}
            onSelect={setActivePlaybookId}
          />
        )}
      </main>

      <footer className="flex h-7 shrink-0 items-center justify-between px-4 text-[10px] text-tc-faint">
        <span>{attached ? statusLabel(status) : 'Platform not recognized'}</span>
        <span>Updated {new Date(refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </footer>
    </div>
  )
}

function IconButton({ title, onClick, children }: {
  title: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
    >
      {children}
    </button>
  )
}

function SidecarHeader({ status, domain, snapshot, onRefresh, onUnpin }: {
  status: CurrentTabStatusResponse['status']
  domain: string
  snapshot?: CurrentTabStatusResponse['snapshot']
  onRefresh: () => void
  onUnpin: () => void
}) {
  const subtitleText =
    status === 'adapter_active'    ? (snapshot?.platformName ?? domain) :
    status === 'verified_platform' ? (snapshot?.platformName ?? domain) :
    status === 'manual_attached'   ? (domain || 'Trading platform') :
    status === 'candidate'         ? domain :
    'Platform not recognized'

  const subtitleColor =
    status === 'adapter_active'    ? 'text-tc-green' :
    status === 'verified_platform' ? 'text-tc-green' :
    status === 'manual_attached'   ? 'text-tc-amber' :
    'text-tc-muted'

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-tc-border/50 bg-tc-bg px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tc-green text-sm font-black text-[#06150f]">TC</div>
        <div className="min-w-0">
          <h1 className="text-[13px] font-semibold tracking-tight text-tc-text">Trader's Companion</h1>
          <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${subtitleColor}`}>
            {status === 'manual_attached' && <Paperclip size={11} />}
            <span className="truncate">{subtitleText}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton title="Refresh detection" onClick={onRefresh}><RefreshCw size={15} /></IconButton>
        <IconButton title="Unpin tab" onClick={onUnpin}><Pin size={15} /></IconButton>
      </div>
    </header>
  )
}

function DashboardTab({ attached, tabStatus, appState, session, settings }: {
  attached: boolean
  tabStatus: CurrentTabStatusResponse | null
  appState: AppStateResponse | null
  session: LiveSessionState | null
  settings: SessionSettings | null
}) {
  const snapshot = tabStatus?.snapshot
  const hasBalance = !!session && session.accountBalance > 0

  if (!attached && !session) {
    return (
      <EmptyState
        title="Platform not recognized"
        body="Open MT5 Web or Match-Trader to start a trading session."
        action={<Button variant="secondary" onClick={() => chrome.runtime.openOptionsPage()}>Open Settings</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <SectionHeader
          title={attached ? `${snapshot?.platformName ?? appState?.platformName ?? 'Trading platform'} detected` : 'Platform not recognized'}
          sub={appState?.statusReason ?? `Detection: ${statusLabel(tabStatus?.status ?? 'not_eligible')}`}
        />
        <CapabilityStatus capabilities={snapshot?.capabilities} />
      </Card>

      <Card padding="none">
        <StatRow label="Account" value={session?.accountName ?? session?.accountKey ?? appState?.detectedAccount?.accountName ?? 'Detecting'} />
        <StatRow label="Balance" value={hasBalance ? money(session.accountBalance) : 'Not detected'} />
        <StatRow label="Risk / trade" value={hasBalance ? money(session.riskPerTrade) : 'Not detected'} />
        <StatRow label="Daily budget" value={hasBalance ? money(session.dailyBudget) : 'Not detected'} />
        <StatRow label="Trades today" value={session ? `${session.tradesOpenedToday} / ${session.maxTrades}` : 'Not available'} />
        <StatRow label="Budget left" value={session ? money(Math.max(0, session.dailyBudget + Math.min(0, session.dailyPnl))) : 'Not available'} />
        <StatRow label="Cooldown" value={cooldownLabel(session, settings)} />
        <StatRow label="No Trade Mode" value={session ? (session.noTradeMode ? 'On' : 'Off') : 'Not available'} />
        <StatRow label="Last synced" value={session?.lastSyncedAt ? new Date(session.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not synced'} />
      </Card>

      {appState && (
        <Card padding="sm" className="space-y-2">
          <SectionHeader title="Protection Status" sub="Live rule posture." />
          {appState.protection.map(item => (
            <div key={item.id} className="rounded-lg bg-tc-surface px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-tc-text">{item.label}</span>
                <span className="text-xs text-tc-green">{item.status}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-tc-muted">{item.reason}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}


function SessionTab({ session, settings, onNoTradeMode, onReset }: {
  session: LiveSessionState | null
  settings: SessionSettings | null
  onNoTradeMode: (checked: boolean) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-4">
      <Card padding="none">
        <StatRow label="Platform account" value={session?.accountName ?? session?.accountKey ?? 'Detecting'} />
        <StatRow label="Session started" value={session ? new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No session'} />
        <StatRow label="Balance source" value={session?.sessionSource === 'auto_detected' ? 'Auto-detected from platform' : (session?.sessionSource ?? 'Not detected')} />
        <StatRow label="Risk percent" value={settings ? `${settings.riskPercent}%` : 'Not configured'} />
        <StatRow label="Cooldown after loss" value={settings ? `${settings.cooldownMinutes} min` : 'Not configured'} />
        <StatRow label="Last trade" value={session?.lastTradeClosedAt ? new Date(session.lastTradeClosedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None today'} />
        <StatRow label="Green Day Protection" value={settings?.autoNoTradeModeOnTarget ? 'On' : 'Off'} />
      </Card>

      <Card padding="sm" className="space-y-3">
        <Toggle checked={!!session?.noTradeMode} disabled={!session} onChange={onNoTradeMode} label="No Trade Mode" />
        <div className="flex gap-2">
          <Button variant="danger" onClick={onReset} disabled={!session}>Reset Session</Button>
        </div>
      </Card>
    </div>
  )
}

function PlaybookTab({ playbooks, activePlaybook, activePlaybookId, settings, onSelect }: {
  playbooks: Playbook[]
  activePlaybook?: Playbook
  activePlaybookId: string
  settings: SessionSettings | null
  onSelect: (id: string) => void
}) {
  if (!playbooks.length) {
    return (
      <EmptyState
        title="No active playbook found."
        body="Create a playbook in settings to review setup rules from the sidecar."
        action={<Button variant="primary" onClick={() => chrome.runtime.openOptionsPage()}>Open Settings</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <SectionHeader title="Active setup" sub="Quick rule context only." />
        <Select
          value={activePlaybookId}
          onChange={event => onSelect(event.target.value)}
        >
          {playbooks.map(playbook => <option key={playbook.id} value={playbook.id}>{playbook.name}</option>)}
        </Select>
      </Card>

      {activePlaybook && (
        <>
          <Card padding="sm" className="space-y-2">
            {activePlaybook.checklistItems.slice(0, 6).map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-tc-surface px-3 py-2 text-xs">
                <span className="text-tc-sub">{item.label}</span>
                <span className={item.required ? 'text-tc-green' : 'text-tc-muted'}>{item.required ? 'Required' : 'Optional'}</span>
              </div>
            ))}
          </Card>

          <Card padding="sm">
            <StatRow label="Allowed symbols" value={activePlaybook.allowedSymbols.length ? activePlaybook.allowedSymbols.join(', ') : 'Any'} />
            <StatRow label="Allowed sessions" value={activePlaybook.allowedSessions.length ? activePlaybook.allowedSessions.join(', ') : 'Any'} />
            <StatRow label="Stop rule" value={activePlaybook.stopRule || 'Not configured'} />
            <StatRow label="Cooldown rule" value={`${activePlaybook.cooldownAfterLossMinutes || settings?.cooldownMinutes || 0} min`} />
            <StatRow label="Max trades" value={`${activePlaybook.maxTradesPerDay || settings?.maxTrades || 0} per day`} />
          </Card>
        </>
      )}

      <Button variant="secondary" fullWidth onClick={() => chrome.runtime.openOptionsPage()}>
        Open full playbook editor
      </Button>
    </div>
  )
}

function CapabilityStatus({ capabilities }: { capabilities?: PlatformCapabilities }) {
  const items = useMemo(() => [
    ['Screenshot review', capabilities?.screenshot ?? true],
    ['Visible context', true],
    ['Playbook check', true],
    ['Position detection', capabilities?.positionDetection === 'available'],
    ['Order interception', capabilities?.orderInterception === 'available'],
  ] as const, [capabilities])

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([label, available]) => (
        <span key={label} className={`rounded-md px-2 py-1 text-[11px] font-medium ${available ? 'bg-tc-green/10 text-tc-green' : 'bg-tc-surface text-tc-faint'}`}>
          {label}: {available ? 'Ready' : 'Limited'}
        </span>
      ))}
    </div>
  )
}


function streamErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Extension context invalidated')) return 'TC was reloaded. Refresh the trading tab to reconnect the companion.'
  return message || 'AI request failed.'
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function cooldownLabel(session: LiveSessionState | null, settings: SessionSettings | null) {
  if (!session) return 'Not available'
  if (!session.lastTradeClosedAt) return 'Clear'
  const cooldownMs = (settings?.cooldownMinutes ?? 15) * 60_000
  const remainingMs = session.lastTradeClosedAt + cooldownMs - Date.now()
  if (remainingMs <= 0) return 'Clear'
  return `${Math.ceil(remainingMs / 60_000)} min left`
}

function statusLabel(status: CurrentTabStatusResponse['status']) {
  switch (status) {
    case 'adapter_active':      return 'Auto detected'
    case 'verified_platform':   return 'Auto detected'
    case 'manual_attached':     return 'Manually attached'
    case 'candidate':           return 'Possible trading page'
    case 'not_eligible':        return 'Not a trading tab'
  }
}

