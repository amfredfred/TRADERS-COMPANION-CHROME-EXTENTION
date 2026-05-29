import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Input, SectionHeader, Textarea } from '../shared/ui'
import type { AgentToolRequest, CurrentTabStatusResponse, SessionStateResponse } from '../shared/lib/messages'
import type { PlatformCapabilities } from '../shared/types/platform'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ToolActivity {
  label: string
  detail: string
  at: number
}

const QUICK_PROMPTS = [
  'Review chart',
  'Check my playbook',
  'Am I forcing this?',
  'Capture screenshot',
  'Log trade idea',
  'Explain risk',
  'What is missing?',
]

async function send<T>(type: string, payload?: unknown): Promise<T | null> {
  try {
    return await chrome.runtime.sendMessage({ type, payload, timestamp: Date.now() })
  } catch {
    return null
  }
}

export default function App() {
  const [tabStatus, setTabStatus] = useState<CurrentTabStatusResponse | null>(null)
  const [session, setSession] = useState<SessionStateResponse | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: [
        'Pinned to this trading tab.',
        '',
        'Ask me to review visible chart context, compare it against your playbook, or pressure-test whether this trade is forced. I will not place, modify, or close trades.',
      ].join('\n'),
    },
  ])
  const [activities, setActivities] = useState<ToolActivity[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const [tab, sessionState] = await Promise.all([
      send<CurrentTabStatusResponse>('TC_GET_CURRENT_TAB_STATUS'),
      send<SessionStateResponse>('TC_GET_SESSION_STATE'),
    ])
    setTabStatus(tab)
    setSession(sessionState)
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
      setManualOpen(true)
      setInput('')
      return
    }

    setInput('')
    setBusy(true)
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', content: prompt }])

    const review = await runTool('captureAndReview', prompt)
    if (review?.activities?.length) {
      setActivities(current => [...review.activities!, ...current].slice(0, 8))
    }

    setMessages(current => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
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
        label: 'Captured visible screenshot',
        detail: result?.ok ? 'Visible tab image captured for sidecar review' : result?.error ?? 'Screenshot capture unavailable',
        at: Date.now(),
      },
      ...current,
    ].slice(0, 8))
    setBusy(false)
  }

  const status = tabStatus?.status ?? 'unsupported_page'
  const capabilities = tabStatus?.snapshot?.capabilities
  const modeTone = status === 'adapter_active' ? 'success' : status === 'partial_detection' ? 'warning' : 'neutral'

  return (
    <div className="min-h-screen bg-tc-bg text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidePanelHeader
        domain={tabStatus?.domain || 'Current tab'}
        statusLabel={statusLabel(status)}
        tone={modeTone}
        onRefresh={refresh}
      />

      <main className="flex h-[calc(100vh-73px)] flex-col">
        <div className="space-y-3 border-b border-tc-border/70 p-4">
          <TabContextCard tabStatus={tabStatus} session={session} />
          <CapabilityStatus capabilities={capabilities} status={statusLabel(status)} />
        </div>

        <ChatThread messages={messages} activities={activities} />

        {manualOpen && (
          <ManualTradeContextDrawer onClose={() => setManualOpen(false)} />
        )}

        <div className="border-t border-tc-border/70 bg-tc-panel p-4">
          <QuickPromptChips
            prompts={QUICK_PROMPTS}
            onPrompt={prompt => {
              if (prompt === 'Capture screenshot') void captureScreenshot()
              else void submitPrompt(prompt)
            }}
          />
          <ChatComposer
            value={input}
            busy={busy}
            onChange={setInput}
            onCapture={captureScreenshot}
            onSubmit={() => void submitPrompt()}
          />
        </div>
      </main>
    </div>
  )
}

function SidePanelHeader({ domain, statusLabel: status, tone, onRefresh }: { domain: string; statusLabel: string; tone: 'success' | 'warning' | 'neutral'; onRefresh: () => void }) {
  return (
    <header className="flex h-[73px] items-center justify-between gap-3 border-b border-tc-border/70 bg-tc-panel px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-tc-text">AI Companion</div>
          <div className="truncate text-xs text-tc-muted">{domain}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={tone}>{status}</Badge>
        <Button size="sm" variant="ghost" onClick={onRefresh}>Refresh</Button>
      </div>
    </header>
  )
}

function TabContextCard({ tabStatus, session }: { tabStatus: CurrentTabStatusResponse | null; session: SessionStateResponse | null }) {
  const snapshot = tabStatus?.snapshot
  return (
    <Card padding="sm" className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ContextItem label="Platform" value={snapshot?.platformName ?? 'Unknown'} />
        <ContextItem label="Confidence" value={`${tabStatus?.confidence ?? 0}%`} />
        <ContextItem label="Symbol" value={snapshot?.symbol ?? 'Manual'} />
        <ContextItem label="Timeframe" value={snapshot?.timeframe ?? 'Manual'} />
        <ContextItem label="Session" value={session?.noTradeMode ? 'No Trade Mode' : 'Active'} />
        <ContextItem label="Screenshot" value="On request" />
      </div>
    </Card>
  )
}

function CapabilityStatus({ capabilities, status }: { capabilities?: PlatformCapabilities; status: string }) {
  const items = useMemo(() => [
    ['Screenshot review', capabilities?.screenshot ?? true],
    ['Visible context', true],
    ['Playbook check', true],
    ['Position detection', capabilities?.positionDetection === 'available'],
    ['Order interception', capabilities?.orderInterception === 'available'],
  ] as const, [capabilities])

  return (
    <Card padding="sm" className="space-y-3">
      <SectionHeader title="Current Tab" sub={status} />
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, available]) => (
          <div key={label} className="flex items-center justify-between rounded-xl bg-tc-surface px-3 py-2 text-xs">
            <span className="text-tc-muted">{label}</span>
            <span className={available ? 'text-tc-green' : 'text-tc-faint'}>{available ? 'Ready' : 'Limited'}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ChatThread({ messages, activities }: { messages: ChatMessage[]; activities: ToolActivity[] }) {
  return (
    <section className="tc-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map(message => (
        <ChatMessageBlock key={message.id} message={message} />
      ))}
      <ToolActivityCard activities={activities} />
    </section>
  )
}

function ChatMessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-6 ${isUser ? 'bg-tc-green/12 text-tc-text' : 'bg-tc-panel text-tc-sub'}`}>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-muted">{isUser ? 'You' : 'TC'}</div>
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  )
}

function ToolActivityCard({ activities }: { activities: ToolActivity[] }) {
  if (!activities.length) return null
  return (
    <Card padding="sm" className="space-y-2">
      <SectionHeader title="Tool activity" />
      {activities.map(activity => (
        <div key={`${activity.label}-${activity.at}`} className="rounded-xl bg-tc-surface px-3 py-2">
          <div className="text-xs font-semibold text-tc-sub">{activity.label}</div>
          <div className="mt-0.5 text-xs text-tc-muted">{activity.detail}</div>
        </div>
      ))}
    </Card>
  )
}

function QuickPromptChips({ prompts, onPrompt }: { prompts: string[]; onPrompt: (prompt: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
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
        className="min-h-[46px] max-h-28"
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

function ManualTradeContextDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-t border-tc-border/70 bg-tc-panel p-4">
      <Card padding="sm" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader title="Manual trade context" sub="Store the idea before entry." />
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Symbol" placeholder="XAUUSD" />
          <Input label="Direction" placeholder="Buy / Sell" />
          <Input label="Setup" placeholder="CRT Reversal" />
          <Input label="Risk" placeholder="$31.80" />
        </div>
        <Input label="Stop loss" placeholder="Price or pips" />
        <Textarea label="Invalidation" placeholder="What tells you this idea is wrong?" />
        <Button variant="primary" fullWidth>Save trade idea</Button>
      </Card>
    </div>
  )
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-tc-surface px-3 py-2">
      <div className="text-[11px] text-tc-muted">{label}</div>
      <div className="mt-0.5 truncate text-xs font-semibold text-tc-text">{value}</div>
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
      return 'Manual Attach'
    case 'unsupported_page':
      return 'Unsupported Page'
    case 'not_trading_tab':
      return 'Not Trading Tab'
  }
}
