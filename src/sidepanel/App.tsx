import { useEffect, useRef, useMemo, useState } from 'react'
import { Badge, Button, Card, Input, SectionHeader, Textarea } from '../shared/ui'
import type { AgentToolRequest, CurrentTabStatusResponse, SessionStateResponse } from '../shared/lib/messages'
import type { PlatformCapabilities } from '../shared/types/platform'

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
      at: Date.now(),
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
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        label: 'Captured visible screenshot',
        detail: result?.ok ? 'Visible tab image captured' : result?.error ?? 'Screenshot capture unavailable',
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
    <div className="flex h-screen flex-col bg-tc-bg text-tc-text" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidePanelHeader
        domain={tabStatus?.domain || 'Current tab'}
        statusLabel={statusLabel(status)}
        tone={modeTone}
        onRefresh={refresh}
      />

      <div className="shrink-0 space-y-2 border-b border-tc-border/50 px-4 py-3">
        <TabContextCard tabStatus={tabStatus} session={session} />
        <CapabilityStatus capabilities={capabilities} status={statusLabel(status)} />
      </div>

      <div className="tc-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          {messages.map(message => (
            <ChatMessageBlock key={message.id} message={message} />
          ))}
          {busy && <TypingIndicator />}
        </div>

        {activities.length > 0 && (
          <div className="mt-5 space-y-1 border-t border-tc-border/30 pt-3">
            {activities.map(activity => (
              <ActivityLine key={`${activity.label}-${activity.at}`} activity={activity} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {manualOpen && (
        <ManualTradeContextDrawer onClose={() => setManualOpen(false)} />
      )}

      <div className="shrink-0 border-t border-tc-border/50 bg-tc-panel px-4 py-3">
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
          onSubmit={() => void submitPrompt()}
        />
      </div>
    </div>
  )
}

function SidePanelHeader({ domain, statusLabel: status, tone, onRefresh }: { domain: string; statusLabel: string; tone: 'success' | 'warning' | 'neutral'; onRefresh: () => void }) {
  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-tc-border/50 bg-tc-panel px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tc-green text-[10px] font-black text-[#06150f]">TC</div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-tc-text">AI Companion</div>
          <div className="truncate text-[11px] text-tc-muted">{domain}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={tone}>{status}</Badge>
        <Button size="sm" variant="ghost" onClick={onRefresh}>↻</Button>
      </div>
    </header>
  )
}

function TabContextCard({ tabStatus, session }: { tabStatus: CurrentTabStatusResponse | null; session: SessionStateResponse | null }) {
  const snapshot = tabStatus?.snapshot
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <ContextItem label="Platform" value={snapshot?.platformName ?? 'Unknown'} />
      <ContextItem label="Symbol" value={snapshot?.symbol ?? '—'} />
      <ContextItem label="Timeframe" value={snapshot?.timeframe ?? '—'} />
      <ContextItem label="Confidence" value={`${tabStatus?.confidence ?? 0}%`} />
      <ContextItem label="Session" value={session?.noTradeMode ? 'No-Trade' : 'Active'} />
      <ContextItem label="Screenshot" value="On request" />
    </div>
  )
}

function CapabilityStatus({ capabilities, status }: { capabilities?: PlatformCapabilities; status: string }) {
  const items = useMemo(() => [
    ['Screenshot', capabilities?.screenshot ?? true],
    ['Visible context', true],
    ['Playbook check', true],
    ['Position detect', capabilities?.positionDetection === 'available'],
    ['Order intercept', capabilities?.orderInterception === 'available'],
  ] as const, [capabilities])

  return (
    <Card padding="sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-faint">Current Tab</span>
        <span className="text-[11px] text-tc-muted">{status}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(([label, available]) => (
          <span
            key={label}
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${available ? 'bg-tc-green/10 text-tc-green' : 'bg-tc-surface text-tc-faint'}`}
          >
            {label}
          </span>
        ))}
      </div>
    </Card>
  )
}

function ChatMessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-xl bg-tc-surface px-3 py-2 text-sm leading-6 text-tc-text">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-faint">TC</div>
      <div className="text-sm leading-[1.7] text-tc-sub whitespace-pre-wrap">{message.content}</div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-faint">TC</div>
      <div className="flex items-center gap-1 py-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:240ms]" />
      </div>
    </div>
  )
}

function ActivityLine({ activity }: { activity: ToolActivity }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="mt-px text-tc-faint">›</span>
      <span className="font-medium text-tc-muted">{activity.label}</span>
      {activity.detail && (
        <span className="min-w-0 truncate text-tc-faint">{activity.detail}</span>
      )}
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

function ChatComposer({ value, busy, onChange, onSubmit }: { value: string; busy: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
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
      <Button size="sm" variant="primary" loading={busy} onClick={onSubmit}>Send</Button>
    </div>
  )
}

function ManualTradeContextDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="shrink-0 border-t border-tc-border/50 bg-tc-panel px-4 py-3">
      <Card padding="sm" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader title="Manual trade context" sub="Store the idea before entry." />
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
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

function ContextItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-lg bg-tc-surface px-2.5 py-1.5 ${className}`}>
      <div className="text-[10px] text-tc-faint">{label}</div>
      <div className="mt-px truncate text-[11px] font-semibold text-tc-text">{value}</div>
    </div>
  )
}

function statusLabel(status: CurrentTabStatusResponse['status']) {
  switch (status) {
    case 'adapter_active':      return 'Adapter Active'
    case 'partial_detection':   return 'Partial'
    case 'manual_attach_available': return 'Manual Attach'
    case 'unsupported_page':    return 'Unsupported'
    case 'not_trading_tab':     return 'Not Trading Tab'
  }
}
