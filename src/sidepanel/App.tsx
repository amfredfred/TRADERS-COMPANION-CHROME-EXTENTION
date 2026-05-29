import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Badge, Button, Card, EmptyState, Input, SectionHeader, Select, StatRow, Textarea, Toggle } from '../shared/ui'
import type { AgentToolRequest, CurrentTabStatusResponse } from '../shared/lib/messages'
import { getActiveAccount, getLiveSession, getPlaybooks, getSettings, patchLiveSession, setLiveSession as saveLiveSession } from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import type { PlatformCapabilities } from '../shared/types/platform'
import type { Playbook, SessionSettings } from '../shared/types/playbook'
import { isExtensionContextValid, safeSendMessage } from '../shared/lib/extensionApi'

type SidecarTab = 'dashboard' | 'chat' | 'session' | 'playbook'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
}

interface ToolActivity {
  label: string
  detail: string
  at: number
}

interface ManualTradeDraft {
  symbol: string
  direction: string
  setup: string
  risk: string
  stopLoss: string
  invalidation: string
}

const TABS: Array<{ id: SidecarTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'chat', label: 'Chat' },
  { id: 'session', label: 'Session' },
  { id: 'playbook', label: 'Playbook' },
]

const QUICK_PROMPTS = [
  'Review chart',
  'Check playbook',
  'Am I forcing this?',
  'What is missing?',
  'Capture screenshot',
  'Log trade idea',
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
  const [manualBalance, setManualBalance] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      at: Date.now(),
      content: 'Pinned to this trading tab.\n\nAsk me to review visible chart context, compare it against your playbook, or pressure-test whether this trade is forced. I will not place, modify, or close trades.',
    },
  ])
  const [activities, setActivities] = useState<ToolActivity[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualTradeOpen, setManualTradeOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (activeTab === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTab])

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
    return send<{ response?: string; activities?: ToolActivity[]; dataUrl?: string; ok?: boolean; error?: string }>('TC_AGENT_TOOL_REQUEST', {
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
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', content: prompt, at: Date.now() }])

    const review = await runTool('captureAndReview', prompt)
    if (review?.activities?.length) {
      setActivities(current => [...review.activities!, ...current].slice(0, 8))
    }

    setMessages(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        at: Date.now(),
        content: review?.response ?? 'I could not complete the review from this tab. Try refreshing detection or capturing the chart again.',
      },
    ])
    setBusy(false)
  }

  async function captureScreenshot() {
    setBusy(true)
    const result = await runTool('captureVisibleChart')
    setActivities(current => [
      {
        label: 'Screenshot capture',
        detail: result?.ok ? 'Visible tab image captured' : result?.error ?? 'Screenshot capture unavailable',
        at: Date.now(),
      },
      ...current,
    ].slice(0, 8))
    setBusy(false)
  }

  async function startManualSession() {
    const balance = Number(manualBalance)
    if (!Number.isFinite(balance) || balance <= 0) return

    const riskPercent = settings?.riskPercent ?? 1
    const maxTrades = Math.max(1, settings?.maxTrades ?? 3)
    const dailyBudget = balance * (riskPercent / 100)

    await saveLiveSession({
      accountId: settings?.accountId ?? 'manual',
      startedAt: Date.now(),
      accountBalance: balance,
      dailyBudget,
      riskPerTrade: dailyBudget / maxTrades,
      tradesOpenedToday: 0,
      dailyPnl: 0,
      peakDailyPnl: 0,
      noTradeMode: false,
      lockState: null,
      maxTrades,
      disciplineScore: 100,
      enforcementMode: settings?.enforcementMode ?? 'strict',
      sessionSource: 'Manual session balance',
    })
    setManualBalance('')
    await refresh()
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

  const status = tabStatus?.status ?? 'unsupported_page'
  const modeTone = status === 'adapter_active' ? 'success' : status === 'partial_detection' ? 'warning' : 'neutral'
  const attached = !!tabStatus?.tabId && status !== 'not_trading_tab'
  const activePlaybook = playbooks.find(playbook => playbook.id === activePlaybookId) ?? playbooks.find(playbook => playbook.active) ?? playbooks[0]

  return (
    <div className="flex h-screen flex-col bg-tc-bg text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidecarHeader
        statusLabel={statusLabel(status)}
        tone={modeTone}
        domain={tabStatus?.domain || 'No tab'}
        onRefresh={refreshAndMark}
        onUnpin={unpin}
      />

      <nav className="grid grid-cols-4 gap-1 border-b border-tc-border/50 bg-tc-panel px-3 py-2">
        {TABS.map(tab => (
          <Button
            key={tab.id}
            size="sm"
            variant={activeTab === tab.id ? 'secondary' : 'ghost'}
            className="px-2"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      <main className={`min-h-0 flex-1 ${activeTab === 'chat' ? 'flex flex-col overflow-hidden' : 'tc-scrollbar overflow-y-auto p-4'}`}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            attached={attached}
            tabStatus={tabStatus}
            session={session}
            settings={settings}
            onAttach={openSidecar}
            onManual={() => setActiveTab('session')}
          />
        )}

        {activeTab === 'chat' && (
          <ChatTab
            tabStatus={tabStatus}
            messages={messages}
            activities={activities}
            busy={busy}
            input={input}
            bottomRef={bottomRef}
            onInput={setInput}
            onCapture={captureScreenshot}
            onSubmit={() => void submitPrompt()}
            onPrompt={prompt => void submitPrompt(prompt)}
            className="flex-1"
          />
        )}

        {activeTab === 'session' && (
          <SessionTab
            session={session}
            settings={settings}
            manualBalance={manualBalance}
            manualTradeOpen={manualTradeOpen}
            onManualBalance={setManualBalance}
            onStartManual={startManualSession}
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

      <footer className="flex items-center justify-between border-t border-tc-border/50 bg-tc-panel px-4 py-2 text-[11px] text-tc-faint">
        <span>{attached ? connectionLabel(status) : 'Not attached'}</span>
        <span>Updated {new Date(refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </footer>
    </div>
  )
}

function SidecarHeader({ statusLabel: status, tone, domain, onRefresh, onUnpin }: {
  statusLabel: string
  tone: 'success' | 'warning' | 'neutral'
  domain: string
  onRefresh: () => void
  onUnpin: () => void
}) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-tc-border/50 bg-tc-panel px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tc-green text-[11px] font-black text-[#06150f]">TC</div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-tc-text">Trader's Companion</div>
          <div className="truncate text-[11px] text-tc-muted">{domain}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge tone={tone}>{status}</Badge>
        <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh detection">Refresh</Button>
        <Button size="sm" variant="ghost" onClick={onUnpin}>Unpin</Button>
      </div>
    </header>
  )
}

function DashboardTab({ attached, tabStatus, session, settings, onAttach, onManual }: {
  attached: boolean
  tabStatus: CurrentTabStatusResponse | null
  session: LiveSessionState | null
  settings: SessionSettings | null
  onAttach: () => void
  onManual: () => void
}) {
  const snapshot = tabStatus?.snapshot
  const hasBalance = !!session && session.accountBalance > 0

  if (!attached && !session) {
    return (
      <EmptyState
        title="No active trading session detected."
        body="Attach TC to a supported trading tab or start a manual session."
        action={<div className="flex gap-2"><Button variant="primary" onClick={onAttach}>Attach Trading Tab</Button><Button variant="secondary" onClick={onManual}>Start Manual Session</Button></div>}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <SectionHeader title={attached ? `${snapshot?.platformName ?? 'Trading tab'} attached` : 'Trading tab not attached'} sub={`Detection: ${statusLabel(tabStatus?.status ?? 'unsupported_page')}`} />
        <CapabilityStatus capabilities={snapshot?.capabilities} />
      </Card>

      <Card padding="none">
        <StatRow label="Balance" value={hasBalance ? money(session.accountBalance) : 'Not detected'} />
        <StatRow label="Risk / trade" value={hasBalance ? money(session.riskPerTrade) : 'Requires session balance'} />
        <StatRow label="Daily budget" value={hasBalance ? money(session.dailyBudget) : 'Manual session required'} />
        <StatRow label="Trades today" value={session ? `${session.tradesOpenedToday} / ${session.maxTrades}` : 'Not available'} />
        <StatRow label="Cooldown" value={cooldownLabel(session, settings)} />
        <StatRow label="No Trade Mode" value={session ? (session.noTradeMode ? 'On' : 'Off') : 'Not available'} />
        <StatRow label="Discipline score" value={session ? String(session.disciplineScore) : 'Not available'} />
      </Card>

      {!hasBalance && (
        <Card padding="sm" className="space-y-3">
          <p className="text-sm leading-6 text-tc-muted">
            TC could not detect an account balance on this platform. Enter a manual balance to calculate risk for this session.
          </p>
          <Button variant="primary" onClick={onManual}>Enter Manual Balance</Button>
        </Card>
      )}
    </div>
  )
}

function ChatTab({ tabStatus, messages, activities, busy, input, bottomRef, onInput, onCapture, onSubmit, onPrompt, className = '' }: {
  tabStatus: CurrentTabStatusResponse | null
  messages: ChatMessage[]
  activities: ToolActivity[]
  busy: boolean
  input: string
  bottomRef: RefObject<HTMLDivElement>
  onInput: (value: string) => void
  onCapture: () => void
  onSubmit: () => void
  onPrompt: (prompt: string) => void
  className?: string
}) {
  const status = tabStatus?.status ?? 'unsupported_page'

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {/* Scrollable message thread */}
      <div className="tc-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-tc-text">AI Companion</div>
            <div className="mt-0.5 text-[11px] text-tc-muted">{tabStatus?.snapshot?.platformName ?? tabStatus?.domain ?? 'Current tab'}</div>
          </div>
          <Badge tone={status === 'adapter_active' ? 'success' : status === 'partial_detection' ? 'warning' : 'neutral'}>{statusLabel(status)}</Badge>
        </div>

        <div className="space-y-5 pb-2">
          {messages.map(message => (
            <ChatMessageBlock key={message.id} message={message} />
          ))}
          {busy && <TypingIndicator />}
          {activities.length > 0 && <ToolActivityRows activities={activities} />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Fixed composer */}
      <div className="shrink-0 border-t border-tc-border/50 bg-tc-panel px-4 pb-4 pt-3">
        <QuickPromptChips prompts={QUICK_PROMPTS} onPrompt={onPrompt} />
        <ChatComposer value={input} busy={busy} onChange={onInput} onCapture={onCapture} onSubmit={onSubmit} />
      </div>
    </div>
  )
}

function SessionTab({ session, settings, manualBalance, manualTradeOpen, onManualBalance, onStartManual, onNoTradeMode, onReset, onManualTradeOpen }: {
  session: LiveSessionState | null
  settings: SessionSettings | null
  manualBalance: string
  manualTradeOpen: boolean
  onManualBalance: (value: string) => void
  onStartManual: () => void
  onNoTradeMode: (checked: boolean) => void
  onReset: () => void
  onManualTradeOpen: (open: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <SectionHeader title="Manual session" sub="Use this when platform balance is unavailable." />
        <Input
          label="Manual account balance"
          type="number"
          min="0"
          value={manualBalance}
          onChange={event => onManualBalance(event.target.value)}
          placeholder="Enter session balance"
        />
        <Button variant="primary" onClick={onStartManual} disabled={!Number(manualBalance) || Number(manualBalance) <= 0}>
          Start Manual Session
        </Button>
      </Card>

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

function ChatMessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-6 ${isUser ? 'bg-tc-surface text-tc-text' : 'bg-tc-panel text-tc-sub'}`}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-faint">{isUser ? 'You' : 'TC'}</div>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="text-sm text-tc-muted">TC is reviewing context...</div>
  )
}

function ToolActivityRows({ activities }: { activities: ToolActivity[] }) {
  return (
    <div className="space-y-1 border-t border-tc-border/40 pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-faint">Used</div>
      {activities.map(activity => (
        <div key={`${activity.label}-${activity.at}`} className="flex items-start gap-2 text-[11px]">
          <span className="text-tc-faint">-</span>
          <span className="font-medium text-tc-muted">{activity.label}</span>
          <span className="min-w-0 truncate text-tc-faint">{activity.detail}</span>
        </div>
      ))}
    </div>
  )
}

function QuickPromptChips({ prompts, onPrompt }: { prompts: string[]; onPrompt: (prompt: string) => void }) {
  return (
    <div className="mb-2.5 flex flex-wrap gap-1.5">
      {prompts.map(prompt => (
        <Button key={prompt} size="sm" variant="subtle" onClick={() => onPrompt(prompt)}>
          {prompt}
        </Button>
      ))}
    </div>
  )
}

function ChatComposer({ value, busy, onChange, onCapture, onSubmit }: { value: string; busy: boolean; onChange: (value: string) => void; onCapture: () => void; onSubmit: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Ask TC about this chart, trade, or rule..."
        className="min-h-[42px] max-h-24"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <div className="flex shrink-0 flex-col gap-2">
        <Button size="sm" variant="secondary" onClick={onCapture}>Capture</Button>
        <Button size="sm" variant="primary" loading={busy} onClick={onSubmit}>Send</Button>
      </div>
    </div>
  )
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
    case 'adapter_active':
      return 'Adapter Active'
    case 'partial_detection':
      return 'Partial'
    case 'manual_attach_available':
      return 'Manual Attach'
    case 'unsupported_page':
      return 'Unsupported'
    case 'not_trading_tab':
      return 'Not Trading Tab'
  }
}

function connectionLabel(status: CurrentTabStatusResponse['status']) {
  if (status === 'adapter_active') return 'Connected'
  if (status === 'partial_detection' || status === 'manual_attach_available') return 'Manual'
  return 'Unsupported'
}
