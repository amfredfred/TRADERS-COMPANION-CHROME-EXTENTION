import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Clock, LayoutDashboard, MessageCircle, Paperclip, Pin, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, Input, SectionHeader, Select, StatRow, Textarea, Toggle } from '../shared/ui'
import { TC_AI_STREAM_PORT } from '../shared/lib/messages'
import type { AgentToolRequest, CurrentTabStatusResponse } from '../shared/lib/messages'
import type { AIStreamChunk } from '../shared/ai/types'
import { getActiveAccount, getLiveSession, getPlaybooks, getSettings, patchLiveSession } from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import type { PlatformCapabilities } from '../shared/types/platform'
import type { Playbook, SessionSettings } from '../shared/types/playbook'
import { isExtensionContextValid, safeSendMessage } from '../shared/lib/extensionApi'
import { ChatTab } from './Chat'
import type { ChatMessage } from './Chat'

type SidecarTab = 'dashboard' | 'chat' | 'session' | 'playbook'

interface ManualTradeDraft {
  symbol: string
  direction: string
  setup: string
  risk: string
  stopLoss: string
  invalidation: string
}

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
  const [session, setSession] = useState<LiveSessionState | null>(null)
  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [activePlaybookId, setActivePlaybookId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [manualTradeOpen, setManualTradeOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const aiPortRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    void refresh()
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
    const [tab, live, savedSettings, account] = await Promise.all([
      send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS'),
      getLiveSession(),
      getSettings(),
      getActiveAccount(),
    ])
    const savedPlaybooks = account ? await getPlaybooks(account.id) : []
    setTabStatus(tab)
    setSession(live)
    setSettings(savedSettings)
    setPlaybooks(savedPlaybooks)
    setActivePlaybookId(current => current || savedPlaybooks.find(playbook => playbook.active)?.id || savedPlaybooks[0]?.id || '')
  }

  async function openSidecar() {
    await send('TC_OPEN_SIDECAR')
    await refresh()
  }

  async function unpin() {
    await send('TC_UNPIN_TAB')
    await refresh()
  }

  async function runTool(tool: AgentToolRequest['tool'], prompt?: string) {
    return send<{ response?: string; dataUrl?: string; ok?: boolean; error?: string }>('TC_AGENT_TOOL_REQUEST', {
      tabId: tabStatus?.tabId ?? undefined,
      tool,
      prompt,
    } satisfies AgentToolRequest)
  }

  async function submitPrompt(promptText?: string) {
    const prompt = (promptText ?? input).trim()
    if (!prompt || busy) return

    if (/log trade/i.test(prompt)) {
      setManualTradeOpen(true)
      setActiveTab('session')
      setInput('')
      return
    }

    if (prompt === 'Capture screenshot') {
      await captureScreenshot()
      return
    }

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
          tabId: tabStatus?.tabId ?? undefined,
          prompt,
          messages: history,
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
    setBusy(true)
    await runTool('captureVisibleChart')
    setBusy(false)
  }

  async function setNoTradeMode(checked: boolean) {
    if (!session) return
    await patchLiveSession({ noTradeMode: checked, noTradeModeReason: checked ? 'Manual sidecar toggle' : undefined })
    await refresh()
  }

  async function resetSession() {
    if (!isExtensionContextValid()) return
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
            session={session}
            settings={settings}
            onAttach={openSidecar}
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
            onInput={setInput}
            onSubmit={() => void submitPrompt()}
            onPrompt={prompt => void submitPrompt(prompt)}
            onStop={stopStreaming}
          />
        )}

        {activeTab === 'session' && (
          <SessionTab
            session={session}
            settings={settings}
            manualTradeOpen={manualTradeOpen}
            onNoTradeMode={setNoTradeMode}
            onReset={resetSession}
            onManualTradeOpen={setManualTradeOpen}
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
        <span>{attached ? statusLabel(status) : 'Not attached'}</span>
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
    status === 'adapter_active'   ? (snapshot?.platformName ?? domain) :
    status === 'manual_attached'  ? 'Manual Attached' :
    status === 'verified_platform'? domain :
    status === 'candidate'        ? domain :
    'No tab attached'

  const subtitleColor =
    status === 'adapter_active'  ? 'text-tc-green' :
    status === 'manual_attached' ? 'text-tc-amber' :
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

function DashboardTab({ attached, tabStatus, session, settings, onAttach }: {
  attached: boolean
  tabStatus: CurrentTabStatusResponse | null
  session: LiveSessionState | null
  settings: SessionSettings | null
  onAttach: () => void
}) {
  const snapshot = tabStatus?.snapshot
  const hasBalance = !!session && session.accountBalance > 0

  if (!attached && !session) {
    return (
      <EmptyState
        title="No trading tab attached."
        body="Open a supported trading platform and TC will detect it automatically."
        action={<Button variant="primary" onClick={onAttach}>Attach Current Tab</Button>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <SectionHeader title={attached ? `${snapshot?.platformName ?? 'Trading tab'} attached` : 'Trading tab not attached'} sub={`Detection: ${statusLabel(tabStatus?.status ?? 'not_eligible')}`} />
        <CapabilityStatus capabilities={snapshot?.capabilities} />
      </Card>

      <Card padding="none">
        <StatRow label="Balance" value={hasBalance ? money(session.accountBalance) : 'Not detected'} />
        <StatRow label="Risk / trade" value={hasBalance ? money(session.riskPerTrade) : 'Not detected'} />
        <StatRow label="Daily budget" value={hasBalance ? money(session.dailyBudget) : 'Not detected'} />
        <StatRow label="Trades today" value={session ? `${session.tradesOpenedToday} / ${session.maxTrades}` : 'Not available'} />
        <StatRow label="Cooldown" value={cooldownLabel(session, settings)} />
        <StatRow label="No Trade Mode" value={session ? (session.noTradeMode ? 'On' : 'Off') : 'Not available'} />
        <StatRow label="Discipline score" value={session ? String(session.disciplineScore) : 'Not available'} />
      </Card>
    </div>
  )
}


function SessionTab({ session, settings, manualTradeOpen, onNoTradeMode, onReset, onManualTradeOpen }: {
  session: LiveSessionState | null
  settings: SessionSettings | null
  manualTradeOpen: boolean
  onNoTradeMode: (checked: boolean) => void
  onReset: () => void
  onManualTradeOpen: (open: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <Card padding="none">
        <StatRow label="Session started" value={session ? new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No session'} />
        <StatRow label="Source" value={session?.sessionSource ?? 'Not detected'} />
        <StatRow label="Risk percent" value={settings ? `${settings.riskPercent}%` : 'Not configured'} />
        <StatRow label="Cooldown after loss" value={settings ? `${settings.cooldownMinutes} min` : 'Not configured'} />
        <StatRow label="Last trade" value={session?.lastTradeClosedAt ? new Date(session.lastTradeClosedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None today'} />
        <StatRow label="Green Day Protection" value={settings?.autoNoTradeModeOnTarget ? 'On' : 'Off'} />
      </Card>

      <Card padding="sm" className="space-y-3">
        <Toggle checked={!!session?.noTradeMode} disabled={!session} onChange={onNoTradeMode} label="No Trade Mode" />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onManualTradeOpen(!manualTradeOpen)}>
            {manualTradeOpen ? 'Hide Trade Form' : 'Manual Trade Log'}
          </Button>
          <Button variant="danger" onClick={onReset} disabled={!session}>Reset Session</Button>
        </div>
      </Card>

      {manualTradeOpen && <ManualTradeContext />}
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

function ManualTradeContext() {
  const [draft, setDraft] = useState<ManualTradeDraft>({
    symbol: '',
    direction: '',
    setup: '',
    risk: '',
    stopLoss: '',
    invalidation: '',
  })
  const [saved, setSaved] = useState(false)

  function update(field: keyof ManualTradeDraft, value: string) {
    setSaved(false)
    setDraft(current => ({ ...current, [field]: value }))
  }

  async function saveDraft() {
    if (!isExtensionContextValid()) return
    const existing = await chrome.storage.session.get('tc_manual_trade_intents')
    const intents = (existing.tc_manual_trade_intents as Array<ManualTradeDraft & { id: string; createdAt: number }> | undefined) ?? []
    await chrome.storage.session.set({
      tc_manual_trade_intents: [
        { ...draft, id: crypto.randomUUID(), createdAt: Date.now() },
        ...intents,
      ].slice(0, 20),
    })
    setSaved(true)
  }

  const canSave = draft.symbol.trim() || draft.setup.trim() || draft.invalidation.trim()

  return (
    <Card padding="sm" className="space-y-3">
      <SectionHeader title="Manual trade context" sub="Store the idea before entry." />
      <div className="grid grid-cols-2 gap-2.5">
        <Input label="Symbol" value={draft.symbol} onChange={event => update('symbol', event.target.value)} placeholder="XAUUSD" />
        <Input label="Direction" value={draft.direction} onChange={event => update('direction', event.target.value)} placeholder="Buy / Sell" />
        <Input label="Setup" value={draft.setup} onChange={event => update('setup', event.target.value)} placeholder="CRT Reversal" />
        <Input label="Risk" value={draft.risk} onChange={event => update('risk', event.target.value)} placeholder="$31.80" />
      </div>
      <Input label="Stop loss" value={draft.stopLoss} onChange={event => update('stopLoss', event.target.value)} placeholder="Price or pips" />
      <Textarea label="Invalidation" value={draft.invalidation} onChange={event => update('invalidation', event.target.value)} placeholder="What tells you this idea is wrong?" />
      <Button variant="primary" fullWidth disabled={!canSave} onClick={saveDraft}>Save trade idea</Button>
      {saved && <div className="text-xs text-tc-green">Trade idea saved for this browser session.</div>}
    </Card>
  )
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
    case 'adapter_active':      return 'Adapter Active'
    case 'verified_platform':   return 'Verified Platform'
    case 'manual_attached':     return 'Manual Attached'
    case 'candidate':           return 'Possible Trading Page'
    case 'not_eligible':        return 'Not Trading Tab'
  }
}

