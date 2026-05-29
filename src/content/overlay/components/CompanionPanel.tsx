import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Badge, Button, Card, Input, SectionHeader, SidePanel, Textarea } from '../../../shared/ui'
import type { PlatformAdapter } from '../../adapters/types'
import { getPlatformSnapshot } from '../../adapters/registry'
import { captureAndReview, type ToolActivity } from '../../browserAgent'
import type { PlatformSnapshot } from '../../../shared/types/platform'

interface Props {
  adapter: PlatformAdapter
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  onUnpin: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type SidecarTab = 'dashboard' | 'chat' | 'session' | 'playbook'

const TABS: Array<{ id: SidecarTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'chat', label: 'Chat' },
  { id: 'session', label: 'Session' },
  { id: 'playbook', label: 'Playbook' },
]

const QUICK_PROMPTS = [
  'Review visible chart',
  'Check against my playbook',
  'Am I revenge trading?',
  'Capture screenshot',
  'Log this trade manually',
]

export default function CompanionPanel({ adapter, collapsed, onCollapse, onUnpin }: Props) {
  const [snapshot, setSnapshot] = useState<PlatformSnapshot>(() => getPlatformSnapshot(adapter, 'manual_attach'))
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Pinned to this tab. I can review visible context, screenshots, rules, and session state. I will not place or modify trades.' },
  ])
  const [input, setInput] = useState('')
  const [activities, setActivities] = useState<ToolActivity[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [width, setWidth] = useState(420)
  const [activeTab, setActiveTab] = useState<SidecarTab>('dashboard')

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previousPadding = body.style.paddingRight
    const previousTransition = body.style.transition
    const reservedWidth = collapsed ? 48 : width

    root.style.setProperty('--tc-sidecar-width', `${reservedWidth}px`)

    if (window.innerWidth >= 920) {
      body.style.transition = 'padding-right 150ms ease'
      body.style.paddingRight = `${reservedWidth}px`
    }

    return () => {
      root.style.removeProperty('--tc-sidecar-width')
      body.style.paddingRight = previousPadding
      body.style.transition = previousTransition
    }
  }, [collapsed, width])

  function startResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width

    function onMove(moveEvent: MouseEvent) {
      const next = Math.min(520, Math.max(360, startWidth + (startX - moveEvent.clientX)))
      setWidth(next)
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function runPrompt(prompt: string) {
    if (prompt === 'Log this trade manually') {
      setManualOpen(true)
      setActiveTab('session')
      return
    }

    const nextSnapshot = getPlatformSnapshot(adapter, 'manual_attach')
    setSnapshot(nextSnapshot)
    setActiveTab('chat')
    setMessages(current => [...current, { role: 'user', content: prompt }])
    setReviewing(true)

    const review = await captureAndReview(prompt, adapter)
    setActivities(current => [...review.activities, ...current].slice(0, 8))
    setMessages(current => [...current, { role: 'assistant', content: review.response }])
    setReviewing(false)
  }

  function submit() {
    const prompt = input.trim()
    if (!prompt) return
    setInput('')
    void runPrompt(prompt)
  }

  if (collapsed) {
    return (
      <div
        id="tc-sidecar-root"
        className="fixed inset-y-0 right-0 z-[2147483644] flex w-12 items-start justify-center border-l border-tc-border/70 bg-tc-panel pt-4 pointer-events-auto"
        style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
      >
        <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={() => onCollapse(false)} title="Expand Trader's Companion">
          TC
        </Button>
      </div>
    )
  }

  return (
    <div id="tc-sidecar-root" className="fixed inset-y-0 right-0 z-[2147483644] pointer-events-auto" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidePanel width={`${width}px`} className="relative flex h-full flex-col">
        <div
          className="absolute inset-y-0 left-0 w-1 cursor-col-resize bg-transparent hover:bg-tc-green/40"
          onMouseDown={startResize}
          title="Resize sidecar"
        />
        <header className="border-b border-tc-border/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
              <div>
                <div className="text-sm font-semibold text-tc-text">Trader's Companion</div>
                <div className="text-xs text-tc-muted">Docked fallback sidecar</div>
              </div>
            </div>
            <Badge tone={snapshot.status === 'adapter_active' ? 'success' : 'warning'}>{statusLabel(snapshot.status)}</Badge>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onCollapse(true)}>Collapse</Button>
            <Button size="sm" variant="ghost" onClick={onUnpin}>Unpin</Button>
          </div>
        </header>

        <nav className="grid grid-cols-4 gap-1 border-b border-tc-border/70 bg-tc-panel px-4 py-2">
          {TABS.map(tab => (
            <Button key={tab.id} size="sm" variant={activeTab === tab.id ? 'secondary' : 'ghost'} className="px-2" onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </Button>
          ))}
        </nav>

        <main className="flex-1 space-y-4 overflow-y-auto p-5 tc-scrollbar">
          {activeTab === 'dashboard' && (
            <>
              <Card className="space-y-3">
                <SectionHeader title="Current state" sub="Docked fallback mode." />
                <ContextRow label="Platform" value={snapshot.platformName} />
                <ContextRow label="Detection" value={statusLabel(snapshot.status)} />
                <ContextRow label="Balance" value={snapshot.accountBalance ? `$${snapshot.accountBalance.toFixed(2)}` : 'Not detected'} />
                <ContextRow label="Symbol" value={snapshot.symbol ?? 'Not detected'} />
                <ContextRow label="Timeframe" value={snapshot.timeframe ?? 'Not detected'} />
                <ContextRow label="Confidence" value={`${snapshot.confidence}%`} />
              </Card>
              <Card className="space-y-3">
                <SectionHeader title="Capabilities" sub="No trade execution tools are available here." />
                <ContextRow label="Screenshot review" value={snapshot.capabilities.screenshot ? 'Ready' : 'Limited'} />
                <ContextRow label="Position detection" value={snapshot.capabilities.positionDetection} />
                <ContextRow label="Order interception" value={snapshot.capabilities.orderInterception} />
                <ContextRow label="Risk inputs" value={snapshot.capabilities.riskInputs} />
              </Card>
            </>
          )}

          {activeTab === 'chat' && (
          <Card className="space-y-3">
            <SectionHeader title="AI Companion" sub="Ask about this chart, trade, or rule." />
            <div className="space-y-3">
              {messages.slice(-5).map((message, index) => (
                <div key={index} className={`rounded-xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'ml-8 bg-tc-green/10 text-tc-text' : 'mr-8 bg-tc-surface text-tc-sub'}`}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-muted">{message.role === 'user' ? 'You' : 'TC'}</div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map(prompt => (
                <Button key={prompt} size="sm" variant="secondary" onClick={() => void runPrompt(prompt)}>{prompt}</Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask TC about this chart, trade, or rule..." onKeyDown={e => { if (e.key === 'Enter') submit() }} />
              <Button variant="primary" onClick={submit} loading={reviewing}>Send</Button>
            </div>
          </Card>
          )}

          {activeTab === 'chat' && (
          <Card className="space-y-3">
            <SectionHeader title="Tool Activity" sub="Transparent browser-side context used by TC." />
            {activities.length === 0 ? (
              <p className="text-sm text-tc-muted">No tools used yet.</p>
            ) : activities.map(activity => (
              <div key={`${activity.at}-${activity.label}`} className="rounded-xl bg-tc-surface p-3">
                <div className="text-sm font-semibold text-tc-text">{activity.label}</div>
                <div className="mt-1 text-xs text-tc-muted">{activity.detail}</div>
              </div>
            ))}
          </Card>
          )}

          {activeTab === 'session' && (
            <Card className="space-y-3">
              <SectionHeader title="Session" sub="Manual controls for unsupported or partial platforms." />
              <ContextRow label="Balance" value={snapshot.accountBalance ? `$${snapshot.accountBalance.toFixed(2)}` : 'Manual session required'} />
              <ContextRow label="No Trade Mode" value="Managed in full settings" />
              <ContextRow label="Cooldown" value="Not detected" />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setManualOpen(!manualOpen)}>{manualOpen ? 'Hide Trade Form' : 'Manual Trade Log'}</Button>
                <Button variant="secondary" onClick={() => void runPrompt('Capture screenshot')}>Capture Screenshot</Button>
              </div>
            </Card>
          )}

          {activeTab === 'session' && manualOpen && (
            <Card className="space-y-3">
              <SectionHeader title="Manual Trade Context" sub="Stores the idea before entry." />
              <Input label="Symbol" placeholder="XAUUSD" />
              <Input label="Direction" placeholder="Buy / Sell" />
              <Input label="Setup" placeholder="CRT Reversal" />
              <Input label="Risk" placeholder="$31.80" />
              <Input label="Stop loss" placeholder="Price or pips" />
              <Textarea label="Invalidation" placeholder="What tells you this idea is wrong?" />
              <Textarea label="Notes" placeholder="Context for the trade log" />
              <Button variant="primary" fullWidth>Save Manual Trade Intent</Button>
            </Card>
          )}

          {activeTab === 'playbook' && (
            <Card className="space-y-3">
              <SectionHeader title="Playbook" sub="Quick setup context in fallback mode." />
              <ContextRow label="Active setup" value="Open settings to select" />
              <ContextRow label="Checklist" value="Bias, sweep, displacement, retest, invalidation" />
              <ContextRow label="Allowed sessions" value="Configured in settings" />
              <ContextRow label="Stop rule" value="Configured in settings" />
              <Button variant="secondary" fullWidth onClick={() => chrome.runtime.openOptionsPage()}>Open full playbook editor</Button>
            </Card>
          )}
        </main>
      </SidePanel>
    </div>
  )
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-tc-muted">{label}</span>
      <span className="font-medium text-tc-text">{value}</span>
    </div>
  )
}

function statusLabel(status: PlatformSnapshot['status']): string {
  switch (status) {
    case 'adapter_active':
      return 'Adapter Active'
    case 'partial_detection':
      return 'Partial Detection'
    case 'manual_attach_available':
      return 'Manual Attach'
    case 'unsupported_page':
      return 'Unsupported Platform'
    case 'not_trading_tab':
      return 'Not Trading Tab'
  }
}
