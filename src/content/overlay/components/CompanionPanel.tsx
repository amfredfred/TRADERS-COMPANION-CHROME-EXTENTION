import { useState } from 'react'
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

  async function runPrompt(prompt: string) {
    if (prompt === 'Log this trade manually') {
      setManualOpen(true)
      return
    }

    const nextSnapshot = getPlatformSnapshot(adapter, 'manual_attach')
    setSnapshot(nextSnapshot)
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
      <div className="fixed right-4 top-24 z-[2147483644] pointer-events-auto" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <button onClick={() => onCollapse(false)} className="rounded-2xl border border-tc-border bg-tc-panel px-4 py-3 text-sm font-semibold text-tc-text">
          TC Companion
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-[2147483644] pointer-events-auto" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <SidePanel width="420px" className="flex h-full flex-col">
        <header className="border-b border-tc-border p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
              <div>
                <div className="text-sm font-semibold text-tc-text">Trader's Companion</div>
                <div className="text-xs text-tc-muted">Pinned AI Companion</div>
              </div>
            </div>
            <Badge tone={snapshot.status === 'adapter_active' ? 'success' : 'warning'}>{statusLabel(snapshot.status)}</Badge>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onCollapse(true)}>Collapse</Button>
            <Button size="sm" variant="ghost" onClick={onUnpin}>Unpin</Button>
          </div>
        </header>

        <main className="flex-1 space-y-4 overflow-y-auto p-5 tc-scrollbar">
          <Card className="space-y-3">
            <SectionHeader title="Context" sub="Manual attach works even when detection is partial." />
            <ContextRow label="Platform" value={snapshot.platformName} />
            <ContextRow label="Symbol" value={snapshot.symbol ?? 'Manual'} />
            <ContextRow label="Timeframe" value={snapshot.timeframe ?? 'Manual'} />
            <ContextRow label="Confidence" value={`${snapshot.confidence}%`} />
            <ContextRow label="Mode" value={snapshot.mode === 'manual_attach' ? 'Manual Attach' : 'Auto Mode'} />
          </Card>

          <Card className="space-y-3">
            <SectionHeader title="AI Chat" sub="Ask about this chart, trade, or rule." />
            <div className="space-y-3">
              {messages.slice(-5).map((message, index) => (
                <div key={index} className={`rounded-xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-tc-green/10 text-tc-text' : 'bg-tc-surface text-tc-sub'}`}>
                  <div className="mb-1 text-xs font-semibold text-tc-muted">{message.role === 'user' ? 'You' : 'TC'}</div>
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

          <Card className="space-y-3">
            <SectionHeader title="Tool Activity" sub="Transparent browser-side context used by TC." />
            {activities.length === 0 ? (
              <p className="text-sm text-tc-muted">No tools used yet.</p>
            ) : activities.map(activity => (
              <div key={`${activity.at}-${activity.label}`} className="rounded-xl border border-tc-border bg-tc-surface p-3">
                <div className="text-sm font-semibold text-tc-text">{activity.label}</div>
                <div className="mt-1 text-xs text-tc-muted">{activity.detail}</div>
              </div>
            ))}
          </Card>

          {manualOpen && (
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
