import { useEffect, useRef, type RefObject } from 'react'
import {
  ArrowUp, BookOpen, Camera, CheckCheck,
  FileText, HelpCircle, Link2, Paperclip,
  Scale, Square, TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../shared/ui'
import type { AiProvider, SessionSettings } from '../shared/types/playbook'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  isError?: boolean
}

interface QuickPrompt {
  id: string
  label: string
  prompt: string
  Icon: LucideIcon
}

const QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'review-chart',    label: 'Show chart',         prompt: 'Review chart',          Icon: TrendingUp },
  { id: 'check-playbook',  label: 'Check playbook',     prompt: 'Check playbook',        Icon: BookOpen   },
  { id: 'forcing',         label: 'Am I forcing this?', prompt: 'Am I forcing this?',    Icon: Scale      },
  { id: 'missing',         label: 'What is missing?',   prompt: 'What is missing?',      Icon: HelpCircle },
  { id: 'capture',         label: 'Capture',            prompt: 'Capture screenshot',    Icon: Camera     },
  { id: 'log-idea',        label: 'Log idea',           prompt: 'Log trade idea',        Icon: FileText   },
]

function providerLabel(provider: AiProvider): string {
  if (provider === 'claude') return 'Claude'
  if (provider === 'gpt4o') return 'GPT-4o'
  return 'AI Off'
}

export function isProviderConnected(settings: SessionSettings | null): boolean {
  if (!settings) return false
  if (settings.aiProvider === 'claude') return !!settings.claudeApiKey?.trim()
  if (settings.aiProvider === 'gpt4o') return !!settings.openaiApiKey?.trim()
  return false
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Chat status bar ───────────────────────────────────────────────────────────

function ChatStatusBar({ settings, busy }: {
  settings: SessionSettings | null
  busy: boolean
}) {
  const connected = isProviderConnected(settings)
  const provider = settings?.aiProvider ?? 'off'

  const dotClass = !connected ? 'bg-tc-faint' : busy ? 'bg-yellow-400 animate-pulse' : 'bg-tc-green'
  const statusText = !connected ? 'Not connected' : busy ? 'Streaming…' : 'Connected'
  const statusColor = !connected ? 'text-tc-faint' : busy ? 'text-yellow-400' : 'text-tc-green'

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-tc-border/40 bg-tc-bg px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span className="text-[13px] font-medium text-tc-text">{providerLabel(provider)}</span>
      </div>
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

// ── Message bubbles ───────────────────────────────────────────────────────────

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = streaming && !message.content

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-tc-green/15 px-3.5 py-2.5 text-sm">
          <p className="whitespace-pre-wrap break-words leading-relaxed text-tc-text">{message.content}</p>
          <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-tc-green/50">
            <span>{formatTime(message.at)}</span>
            <CheckCheck size={11} />
          </div>
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
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
              {streaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-tc-green align-[-2px]" />
              )}
            </p>
            <div className="mt-1.5 text-[10px] text-tc-muted/60">{formatTime(message.at)}</div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Quick prompt chips ────────────────────────────────────────────────────────

function QuickPromptRow({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto py-2">
      {QUICK_PROMPTS.map(({ id, label, prompt, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onPrompt(prompt)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-tc-surface/80 px-3 text-xs font-medium text-tc-sub ring-1 ring-white/[0.06] transition-colors hover:bg-tc-elevated hover:text-tc-text"
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
  onPrompt: (prompt: string) => void
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
            Connect GPT-4o or Claude to start live trade reviews.
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
            Review the active chart, check your playbook, or challenge your trade idea.
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

export function ChatTab({ settings, messages, busy, streamingMessageId, input, bottomRef, onInput, onSubmit, onPrompt, onStop }: {
  settings: SessionSettings | null
  messages: ChatMessage[]
  busy: boolean
  streamingMessageId: string | null
  input: string
  bottomRef: RefObject<HTMLDivElement>
  onInput: (value: string) => void
  onSubmit: () => void
  onPrompt: (prompt: string) => void
  onStop: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatStatusBar settings={settings} busy={busy} />

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
