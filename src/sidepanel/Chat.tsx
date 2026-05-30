import React, { useEffect, useRef, useState, type RefObject } from 'react'
import {
  ArrowRight, ArrowUp, BookOpen, Camera, Check, CheckCheck,
  ChevronDown, FileText, HelpCircle, Link2, Paperclip,
  Scale, Square, TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../shared/ui'
import { getProviderCapability } from '../shared/ai/providerConfig'
import type { ChatIntent } from '../shared/ai/chatIntent'
import type { AiProvider, SessionSettings } from '../shared/types/playbook'

const ALL_PROVIDERS: AiProvider[] = ['gpt4o', 'claude', 'deepseek', 'grok']

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  isError?: boolean
  screenshotDataUrl?: string
}

/** Metadata attached to a quick-prompt chip click. */
export interface QuickPromptMeta {
  intent: ChatIntent
  /** True means perform a standalone chart capture (no AI turn). */
  captureChart: boolean
}

interface QuickPrompt {
  id: string
  label: string
  prompt: string
  intent: ChatIntent
  /** If true, triggers a standalone screenshot capture instead of an AI turn. */
  captureChart: boolean
  Icon: LucideIcon
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'review-chart',
    label: 'Show chart',
    prompt: 'Review the connected chart.',
    intent: 'force_chart_recapture',
    captureChart: false,
    Icon: TrendingUp,
  },
  {
    id: 'check-playbook',
    label: 'Check playbook',
    prompt: 'Check this against my playbook.',
    intent: 'playbook_check',
    captureChart: false,
    Icon: BookOpen,
  },
  {
    id: 'forcing',
    label: 'Am I forcing this?',
    prompt: 'Am I forcing this trade?',
    intent: 'discipline_check',
    captureChart: false,
    Icon: Scale,
  },
  {
    id: 'missing',
    label: 'What is missing?',
    prompt: 'What is missing from my setup?',
    intent: 'general_trading_question',
    captureChart: false,
    Icon: HelpCircle,
  },
  {
    id: 'capture',
    label: 'Capture chart',
    prompt: 'Capture connected chart',
    intent: 'chart_review',
    captureChart: true,
    Icon: Camera,
  },
  {
    id: 'log-idea',
    label: 'Log idea',
    prompt: 'Log trade idea',
    intent: 'trade_log',
    captureChart: false,
    Icon: FileText,
  },
]

function providerLabel(provider: AiProvider): string {
  return getProviderCapability(provider).label
}

export function isProviderConnected(settings: SessionSettings | null): boolean {
  if (!settings || settings.aiProvider === 'off') return false
  const meta = getProviderCapability(settings.aiProvider)
  if (!meta.keyField) return false
  return !!String(settings[meta.keyField] ?? '').trim()
}

function isSpecificProviderConnected(provider: AiProvider, settings: SessionSettings | null): boolean {
  if (!settings || provider === 'off') return false
  const meta = getProviderCapability(provider)
  if (!meta.keyField) return false
  return !!String(settings[meta.keyField] ?? '').trim()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Provider switcher dropdown ────────────────────────────────────────────────

function ProviderSwitcher({ settings, busy, onProviderChange }: {
  settings: SessionSettings | null
  busy: boolean
  onProviderChange: (provider: AiProvider) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentProvider = settings?.aiProvider ?? 'off'
  const connected = isProviderConnected(settings)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const dotClass = !connected ? 'bg-tc-faint' : busy ? 'bg-yellow-400 animate-pulse' : 'bg-tc-green'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-medium text-tc-text transition-colors hover:bg-tc-surface/60 disabled:pointer-events-none"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span>{providerLabel(currentProvider)}</span>
        <ChevronDown size={11} className={`text-tc-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-tc-border/60 bg-tc-elevated shadow-xl shadow-black/30">
          {ALL_PROVIDERS.map(provider => {
            const provConnected = isSpecificProviderConnected(provider, settings)
            const isCurrent = provider === currentProvider

            return (
              <button
                key={provider}
                type="button"
                onClick={() => {
                  if (provConnected) {
                    onProviderChange(provider)
                    setOpen(false)
                  } else {
                    chrome.runtime?.openOptionsPage?.()
                    setOpen(false)
                  }
                }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                  isCurrent
                    ? 'bg-tc-surface/80 text-tc-text'
                    : provConnected
                      ? 'text-tc-sub hover:bg-tc-surface/50 hover:text-tc-text'
                      : 'cursor-default text-tc-faint/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex w-3.5 items-center justify-center">
                    {isCurrent ? (
                      <Check size={12} className="text-tc-green" />
                    ) : provConnected ? (
                      <span className="h-1 w-1 rounded-full bg-tc-green/50" />
                    ) : null}
                  </span>
                  <span className="font-medium">{providerLabel(provider)}</span>
                </div>

                {!provConnected && (
                  <span className="flex items-center gap-0.5 text-[10px] text-tc-faint/50">
                    Configure
                    <ArrowRight size={10} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Chat status bar ───────────────────────────────────────────────────────────

function ChatStatusBar({ settings, busy, onProviderChange }: {
  settings: SessionSettings | null
  busy: boolean
  onProviderChange: (provider: AiProvider) => void
}) {
  const connected = isProviderConnected(settings)

  const statusText = !connected ? 'Not connected' : busy ? 'Streaming…' : 'Connected'
  const statusColor = !connected ? 'text-tc-faint' : busy ? 'text-yellow-400' : 'text-tc-green'

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-tc-border/40 bg-tc-bg px-3">
      <ProviderSwitcher settings={settings} busy={busy} onProviderChange={onProviderChange} />
      <div className={`flex items-center gap-1.5 text-[11px] ${statusColor}`}>
        <Link2 size={11} />
        <span>{statusText}</span>
      </div>
    </div>
  )
}

// ── Typing dots ───────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:240ms]" />
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Match **bold** and `code` inline
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      parts.push(<strong key={m.index} className="font-semibold text-tc-text">{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      parts.push(
        <code key={m.index} className="rounded bg-tc-surface px-1 py-0.5 font-mono text-[11px] text-tc-green/90">
          {m[2]}
        </code>
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed) {
      i++
      continue
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      nodes.push(
        <pre key={`code-${i}`} className="mt-1.5 overflow-x-auto rounded-lg bg-tc-surface p-3 font-mono text-[11px] text-tc-sub ring-1 ring-white/[0.05]">
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // Numbered list — collect consecutive numbered lines
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = []
      let num = 1
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''))
        i++
        num++
      }
      nodes.push(
        <ol key={`ol-${i}`} className="mt-1.5 space-y-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[10px] font-semibold tabular-nums text-tc-green/60">{idx + 1}.</span>
              <span className="leading-relaxed text-tc-sub">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().slice(2))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} className="mt-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-tc-green/60" />
              <span className="leading-relaxed text-tc-sub">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Section header — short line ending with ':'
    if (/^[^-*\d].{0,60}:$/.test(trimmed)) {
      nodes.push(
        <p key={`h-${i}`} className={`${nodes.length > 0 ? 'mt-3' : ''} text-[11px] font-semibold uppercase tracking-wide text-tc-green/70`}>
          {trimmed.slice(0, -1)}
        </p>
      )
      i++
      continue
    }

    // Normal paragraph
    nodes.push(
      <p key={`p-${i}`} className="leading-relaxed text-tc-sub">
        {renderInline(trimmed)}
      </p>
    )
    i++
  }

  return (
    <div className="space-y-0.5">
      {nodes}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-tc-green align-[-2px]" />
      )}
    </div>
  )
}

// ── Message bubbles ───────────────────────────────────────────────────────────

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = streaming && !message.content

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] space-y-1.5">
          {message.screenshotDataUrl && (
            <div className="overflow-hidden rounded-2xl rounded-br-sm ring-1 ring-white/[0.08]">
              <img
                src={message.screenshotDataUrl}
                alt="Chart screenshot"
                className="block w-full"
              />
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl rounded-br-sm bg-tc-green/15 px-3.5 py-2.5 text-sm">
              <p className="whitespace-pre-wrap break-words leading-relaxed text-tc-text">{message.content}</p>
              <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-tc-green/50">
                <span>{formatTime(message.at)}</span>
                <CheckCheck size={11} />
              </div>
            </div>
          )}
          {!message.content && message.screenshotDataUrl && (
            <div className="flex items-center justify-end gap-1 text-[10px] text-tc-green/50">
              <span>{formatTime(message.at)}</span>
              <CheckCheck size={11} />
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
      <div className={`max-w-[84%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm ${
        message.isError
          ? 'bg-tc-red/10 text-tc-red ring-1 ring-tc-red/25'
          : 'bg-tc-elevated text-tc-text'
      }`}>
        {isEmpty ? (
          <TypingDots />
        ) : (
          <>
            {message.isError ? (
              <p className="leading-relaxed">{message.content}</p>
            ) : (
              <MarkdownContent content={message.content} streaming={streaming} />
            )}
            <div className="mt-2 text-[10px] text-tc-muted/60">{formatTime(message.at)}</div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Quick prompt chips ────────────────────────────────────────────────────────

function QuickPromptRow({ onPrompt }: { onPrompt: (prompt: string, meta: QuickPromptMeta) => void }) {
  return (
    <div className="flex flex-wrap gap-2 py-2">
      {QUICK_PROMPTS.map(({ id, label, prompt, intent, captureChart, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onPrompt(prompt, { intent, captureChart })}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tc-surface/80 px-3 text-xs font-medium text-tc-sub ring-1 ring-white/[0.06] transition-colors hover:bg-tc-elevated hover:text-tc-text"
        >
          <Icon size={12} className="text-tc-green/70" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyChat({ settings, onPrompt }: {
  settings: SessionSettings | null
  onPrompt: (prompt: string, meta: QuickPromptMeta) => void
}) {
  const connected = isProviderConnected(settings)

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tc-surface ring-1 ring-white/[0.06]">
          <Link2 size={20} className="text-tc-muted" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-tc-text">No AI provider connected</p>
          <p className="mt-1 text-[12px] leading-relaxed text-tc-muted">
            Connect GPT-4o, Claude, DeepSeek, or Grok to start live trade reviews.
          </p>
        </div>
        <Button variant="primary" onClick={() => chrome.runtime?.openOptionsPage?.()}>
          Connect AI Provider
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tc-green/10 ring-1 ring-tc-green/20">
          <span className="text-[13px] font-black text-tc-green">TC</span>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-tc-text">Ask your trading assistant</p>
          <p className="mt-1 text-[12px] leading-relaxed text-tc-muted">
            Review the connected chart, check your playbook, or challenge your trade idea.
          </p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <QuickPromptRow onPrompt={onPrompt} />
      </div>
    </div>
  )
}

// ── Composer ──────────────────────────────────────────────────────────────────

function ChatInput({ value, busy, disabled, onChange, onSubmit, onStop }: {
  value: string
  busy: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleChange(val: string) {
    onChange(val)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 112)}px`
    }
  }

  useEffect(() => {
    if (!value && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value])

  const canSend = !disabled && !!value.trim()

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-tc-border/50 bg-tc-panel p-2 transition-colors focus-within:border-tc-green/40">
      <button
        type="button"
        title="Attach"
        className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-tc-faint transition-colors hover:bg-tc-surface hover:text-tc-muted"
      >
        <Paperclip size={15} />
      </button>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (canSend && !busy) onSubmit()
          }
        }}
        placeholder={disabled ? 'No AI provider connected…' : 'Ask TC about this chart…'}
        disabled={disabled}
        rows={1}
        className="scrollbar-none max-h-28 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-5 text-tc-text outline-none placeholder:text-tc-faint disabled:opacity-40"
      />

      {busy ? (
        <button
          type="button"
          onClick={onStop}
          className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tc-red/15 text-tc-red transition-colors hover:bg-tc-red/25"
          aria-label="Stop response"
        >
          <Square size={13} strokeWidth={0} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tc-green text-[#06150f] transition-all hover:brightness-110 disabled:bg-tc-surface disabled:text-tc-muted"
          aria-label="Send message"
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

// ── ChatTab ───────────────────────────────────────────────────────────────────

export function ChatTab({ settings, messages, busy, streamingMessageId, input, bottomRef, hasAnnotations, onInput, onSubmit, onPrompt, onStop, onClearAnnotations, onProviderChange }: {
  settings: SessionSettings | null
  messages: ChatMessage[]
  busy: boolean
  streamingMessageId: string | null
  input: string
  bottomRef: RefObject<HTMLDivElement>
  hasAnnotations?: boolean
  onInput: (value: string) => void
  onSubmit: () => void
  onPrompt: (prompt: string, meta: QuickPromptMeta) => void
  onStop: () => void
  onClearAnnotations?: () => void
  onProviderChange: (provider: AiProvider) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatStatusBar settings={settings} busy={busy} onProviderChange={onProviderChange} />

      {/* Scrollable thread */}
      <div className="tc-scrollbar min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyChat settings={settings} onPrompt={onPrompt} />
        ) : (
          <div className="space-y-4 px-4 py-4">
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                message={message}
                streaming={message.id === streamingMessageId}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-tc-border/40 bg-tc-bg">
        {hasAnnotations && onClearAnnotations && (
          <div className="flex items-center justify-between px-4 pt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-tc-green">
              <span className="h-1.5 w-1.5 rounded-full bg-tc-green" />
              Annotations drawn on chart
            </span>
            <button
              type="button"
              onClick={onClearAnnotations}
              className="text-[11px] text-tc-faint underline-offset-2 hover:text-tc-sub hover:underline"
            >
              Clear
            </button>
          </div>
        )}
        {messages.length > 0 && (
          <div className="px-4">
            <QuickPromptRow onPrompt={onPrompt} />
          </div>
        )}
        <div className="px-4 pb-4 pt-1">
          <ChatInput
            value={input}
            busy={busy}
            disabled={!isProviderConnected(settings)}
            onChange={onInput}
            onSubmit={onSubmit}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  )
}
