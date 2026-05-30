import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Camera, Square } from 'lucide-react'
import { TC_AI_STREAM_PORT } from '../../../shared/lib/messages'
import type { AIStreamChunk } from '../../../shared/ai/types'
import { getSettings } from '../../../shared/lib/storage'
import type { LiveSessionState } from '../../../shared/lib/storage'
import type { SessionSettings } from '../../../shared/types/playbook'
import { getProviderCapability } from '../../../shared/ai/providerConfig'
import { useStore } from '../../../shared/state/store'
import { getChatIntent } from '../../../shared/ai/chatIntent'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  direction: 'long' | 'short'
  symbol: string | null
}

interface TradeChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  isError?: boolean
  screenshotDataUrl?: string
}

// ── Quick prompts ──────────────────────────────────────────────────────────────

const TRADE_QUICK_PROMPTS = [
  { id: 'playbook',     label: 'Playbook match?',   prompt: 'Does this trade match my playbook?' },
  { id: 'forcing',      label: 'Forcing it?',        prompt: 'Am I forcing this trade?' },
  { id: 'invalidation', label: 'Invalidation?',      prompt: 'Where should my invalidation be?' },
  { id: 'missing',      label: "What's missing?",    prompt: 'What is missing from this setup?' },
  { id: 'risk',         label: 'Risk check',         prompt: 'Is my current risk level acceptable?' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function isProviderReady(settings: SessionSettings | null): boolean {
  if (!settings || settings.aiProvider === 'off') return false
  const meta = getProviderCapability(settings.aiProvider)
  if (!meta.keyField) return false
  return !!String(settings[meta.keyField] ?? '').trim()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function buildTradeContext(
  direction: 'long' | 'short',
  symbol: string | null,
  session: LiveSessionState | null,
): string {
  const lines = [
    `Current trade context:`,
    `- Direction: ${direction === 'long' ? 'Long (Buy)' : 'Short (Sell)'}`,
  ]
  if (symbol) lines.push(`- Symbol: ${symbol}`)
  if (session) {
    const dailyLoss = Math.abs(Math.min(0, session.dailyPnl))
    const budgetLeft = session.dailyBudget > 0 ? Math.max(0, session.dailyBudget - dailyLoss) : null
    lines.push(`- Trades today: ${session.tradesOpenedToday} / ${session.maxTrades}`)
    if (budgetLeft !== null) lines.push(`- Daily budget remaining: $${budgetLeft.toFixed(2)}`)
    if (session.riskPerTrade > 0) lines.push(`- Risk per trade: $${session.riskPerTrade.toFixed(2)}`)
    if (session.lockState) lines.push(`- Account: Locked`)
    if (session.noTradeMode) lines.push(`- No Trade Mode: active`)
  }
  return lines.join('\n')
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TradeChatTab({ direction, symbol }: Props) {
  const session = useStore(s => s.session)
  const [settings, setSettings] = useState<SessionSettings | null>(null)
  const [messages, setMessages] = useState<TradeChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    getSettings().then(s => setSettings(s))
    return () => {
      portRef.current?.disconnect()
      portRef.current = null
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const providerReady = isProviderReady(settings)

  function handleInput(val: string) {
    setInput(val)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 100)}px`
    }
  }

  async function handleSend(overridePrompt?: string) {
    const prompt = (overridePrompt ?? input).trim()
    if (!prompt || busy || !providerReady) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setBusy(true)

    const intent = attachScreenshot ? 'force_chart_recapture' : getChatIntent(prompt)

    const userMsg: TradeChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      at: Date.now(),
    }
    const assistantId = crypto.randomUUID()
    const assistantMsg: TradeChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      at: Date.now(),
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreamingId(assistantId)

    // Build context-enriched history:
    // Prepend trade context as the first message so AI always knows
    // the direction, symbol, and session state for this trade.
    const tradeContext = buildTradeContext(direction, symbol, session)
    const history = [
      { role: 'user' as const, content: tradeContext },
      ...messages
        .filter(m => m.content.trim())
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content })),
    ]

    portRef.current?.disconnect()

    try {
      const port = chrome.runtime.connect({ name: TC_AI_STREAM_PORT })
      portRef.current = port

      port.onMessage.addListener((msg: AIStreamChunk) => {
        if (msg.type === 'screenshot') {
          const dataUrl = msg.screenshotDataUrl
          if (dataUrl) {
            setMessages(prev =>
              prev.map(m => m.id === userMsg.id ? { ...m, screenshotDataUrl: dataUrl } : m)
            )
          }
          return
        }

        if (msg.type === 'delta') {
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: m.content + (msg.delta ?? '') } : m)
          )
          return
        }

        if (msg.type === 'done') {
          finishStream(port)
          return
        }

        if (msg.type === 'error') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: msg.error || 'AI request failed.', isError: true }
                : m
            )
          )
          finishStream(port)
        }
      })

      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null
        setBusy(false)
        setStreamingId(null)
      })

      port.postMessage({
        type: 'TC_AI_STREAM_START',
        payload: {
          prompt,
          messages: history,
          intent,
        },
      })
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Failed to connect to AI.', isError: true }
            : m
        )
      )
      setBusy(false)
      setStreamingId(null)
    }
  }

  function finishStream(port: chrome.runtime.Port) {
    setBusy(false)
    setStreamingId(null)
    if (portRef.current === port) portRef.current = null
    try { port.disconnect() } catch { /* ok */ }
  }

  function stopStreaming() {
    portRef.current?.postMessage({ type: 'TC_AI_STREAM_CANCEL' })
    portRef.current?.disconnect()
    portRef.current = null
    setBusy(false)
    setStreamingId(null)
  }

  // ── No provider state ─────────────────────────────────────────────────────
  if (!providerReady) {
    return <NoProviderState />
  }

  // ── Main chat UI ──────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* Message thread */}
      <div className="tc-scrollbar min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onPrompt={handleSend} />
        ) : (
          <div className="space-y-3 px-4 py-4">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                streaming={msg.id === streamingId}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
        {messages.length === 0 && <div ref={bottomRef} />}
      </div>

      {/* Quick prompts (shown after first message) */}
      {messages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2 pt-1">
          {TRADE_QUICK_PROMPTS.map(qp => (
            <button
              key={qp.id}
              type="button"
              onClick={() => handleSend(qp.prompt)}
              disabled={busy}
              className="inline-flex h-7 items-center rounded-full bg-tc-surface/80 px-3 text-[11px] font-medium text-tc-sub ring-1 ring-white/[0.06] transition-colors hover:bg-tc-elevated hover:text-tc-text disabled:opacity-40"
            >
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-tc-border px-4 pb-4 pt-3">

        {/* Screenshot toggle */}
        <label className="mb-2.5 flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={attachScreenshot}
            onChange={e => setAttachScreenshot(e.target.checked)}
            className="h-3.5 w-3.5 accent-tc-green"
          />
          <Camera size={11} className={attachScreenshot ? 'text-tc-green' : 'text-tc-faint'} />
          <span className={`text-[11px] ${attachScreenshot ? 'text-tc-green' : 'text-tc-muted'}`}>
            Attach chart screenshot
          </span>
        </label>

        {/* Input row */}
        <div className="flex items-end gap-2 rounded-xl border border-tc-border/60 bg-tc-surface px-3 py-2 transition-colors focus-within:border-tc-green/40">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!busy) void handleSend()
              }
            }}
            placeholder="Ask about this trade…"
            rows={1}
            className="[&::-webkit-scrollbar]:hidden max-h-24 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-5 text-tc-text outline-none placeholder:text-tc-faint"
          />

          {busy ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-tc-red/15 text-tc-red transition-colors hover:bg-tc-red/25"
              aria-label="Stop"
            >
              <Square size={11} strokeWidth={0} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim()}
              className="mb-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-tc-green text-[#06150f] transition-all hover:brightness-110 disabled:bg-tc-surface disabled:text-tc-faint"
              aria-label="Send"
            >
              <ArrowUp size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function NoProviderState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tc-surface ring-1 ring-white/[0.06]">
        <span className="text-lg text-tc-faint">∅</span>
      </div>
      <div>
        <p className="text-[13px] font-semibold text-tc-text">No AI provider connected</p>
        <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
          Connect an AI provider to use trade chat.
        </p>
      </div>
      <button
        type="button"
        onClick={() => chrome.runtime?.openOptionsPage?.()}
        className="rounded-lg bg-tc-green/15 px-4 py-2 text-xs font-semibold text-tc-green ring-1 ring-tc-green/20 transition-colors hover:bg-tc-green/25"
      >
        Connect AI Provider
      </button>
    </div>
  )
}

function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tc-green/10 ring-1 ring-tc-green/20">
          <span className="text-[11px] font-black text-tc-green">TC</span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-tc-text">Trade Assistant</p>
          <p className="mt-1 text-[11px] leading-relaxed text-tc-muted">
            Ask about this setup, playbook fit, or risk.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4">
        {TRADE_QUICK_PROMPTS.map(qp => (
          <button
            key={qp.id}
            type="button"
            onClick={() => onPrompt(qp.prompt)}
            className="inline-flex h-7 items-center rounded-full bg-tc-surface/80 px-3 text-[11px] font-medium text-tc-sub ring-1 ring-white/[0.06] transition-colors hover:bg-tc-elevated hover:text-tc-text"
          >
            {qp.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ message, streaming }: { message: TradeChatMessage; streaming?: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = streaming && !message.content

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] space-y-1.5">
          {message.screenshotDataUrl && (
            <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.08]">
              <img
                src={message.screenshotDataUrl}
                alt="Chart screenshot"
                className="block w-full"
              />
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl rounded-br-sm bg-tc-green/15 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-tc-text">
                {message.content}
              </p>
              <p className="mt-1 text-right text-[10px] text-tc-green/50">
                {formatTime(message.at)}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tc-green/15 text-[10px] font-bold text-tc-green">
        TC
      </div>
      <div
        className={`max-w-[84%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm ${
          message.isError
            ? 'bg-tc-red/10 ring-1 ring-tc-red/25'
            : 'bg-tc-elevated'
        }`}
      >
        {isEmpty ? (
          <TypingDots />
        ) : (
          <>
            <p className={`whitespace-pre-wrap leading-relaxed ${message.isError ? 'text-tc-red' : 'text-tc-sub'}`}>
              {message.content}
            </p>
            {streaming && !message.isError && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-tc-green align-[-2px]" />
            )}
            <p className="mt-1.5 text-[10px] text-tc-faint">{formatTime(message.at)}</p>
          </>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:240ms]" />
    </div>
  )
}
