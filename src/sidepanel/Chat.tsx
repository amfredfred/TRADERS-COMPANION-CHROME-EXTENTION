import type { RefObject } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '../shared/ui'
import type { SessionSettings } from '../shared/types/playbook'
import type { AiProvider } from '../shared/types/playbook'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
}

const QUICK_PROMPTS = [
  'Review chart',
  'Check playbook',
  'Am I forcing this?',
  'What is missing?',
  'Capture screenshot',
  'Log trade idea',
]

function providerLabel(provider: AiProvider): string {
  if (provider === 'claude') return 'Claude'
  if (provider === 'gpt4o') return 'GPT-4o'
  return 'AI Off'
}

function isProviderConnected(settings: SessionSettings | null): boolean {
  if (!settings) return false
  if (settings.aiProvider === 'claude') return !!settings.claudeApiKey?.trim()
  if (settings.aiProvider === 'gpt4o') return !!settings.openaiApiKey?.trim()
  return false
}

function ChatHeader({ settings, busy }: {
  settings: SessionSettings | null
  busy: boolean
}) {
  const connected = isProviderConnected(settings)
  const provider = settings?.aiProvider ?? 'off'

  const dotClass = !connected
    ? 'bg-tc-faint'
    : busy
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-tc-green'

  const statusText = !connected ? 'Not connected' : busy ? 'Thinking…' : 'Connected'

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-tc-border/50 bg-tc-panel px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span className="text-sm font-semibold text-tc-text">{providerLabel(provider)}</span>
      </div>
      <span className="text-[11px] text-tc-muted">{statusText}</span>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-tc-muted"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  const isUser = message.role === 'user'
  const isEmpty = streaming && !message.content

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'rounded-br-sm bg-tc-green/20 text-tc-text'
          : 'rounded-bl-sm bg-tc-surface text-tc-sub'
      }`}>
        {isEmpty
          ? <TypingDots />
          : (
            <span className="whitespace-pre-wrap">
              {message.content}
              {streaming && <span className="ml-px animate-pulse text-tc-green">▌</span>}
            </span>
          )
        }
      </div>
    </div>
  )
}

function EmptyChat({ settings, onPrompt }: {
  settings: SessionSettings | null
  onPrompt: (prompt: string) => void
}) {
  const connected = isProviderConnected(settings)

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div className="text-[15px] font-semibold text-tc-text">Your AI provider isn't configured</div>
        <p className="text-sm leading-relaxed text-tc-muted">
          Connect Claude or GPT-4o in settings to get trade reviews and rule-based feedback.
        </p>
        <Button variant="primary" onClick={() => chrome.runtime.openOptionsPage()}>
          Connect AI Provider
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <div>
        <div className="text-[15px] font-semibold text-tc-text">Ask your trading assistant</div>
        <p className="mt-1 text-sm text-tc-muted">
          TC uses your playbook, session context, and visible chart to give grounded feedback.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_PROMPTS.map(prompt => (
          <button
            key={prompt}
            onClick={() => onPrompt(prompt)}
            className="rounded-full border border-tc-border bg-tc-surface px-3 py-1.5 text-xs text-tc-sub transition-colors hover:border-tc-green/50 hover:text-tc-text"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatInput({ value, busy, disabled, onChange, onSubmit, onStop }: {
  value: string
  busy: boolean
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
}) {
  const canSend = !disabled && !!value.trim()

  return (
    <div className="flex items-end gap-3 rounded-2xl bg-tc-surface px-4 py-3 ring-1 ring-white/[0.06] transition-shadow focus-within:ring-tc-green/30">
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (canSend && !busy) onSubmit()
          }
        }}
        placeholder={disabled ? 'Configure an AI provider in settings…' : 'Ask TC…'}
        disabled={disabled}
        rows={1}
        className="max-h-28 min-h-[20px] flex-1 resize-none bg-transparent text-sm text-tc-text placeholder:text-tc-faint focus:outline-none disabled:opacity-40"
        style={{ lineHeight: '1.5' }}
      />
      {busy ? (
        <button
          onClick={onStop}
          className="mb-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tc-red/15 text-tc-red transition-colors hover:bg-tc-red/25"
          aria-label="Stop"
        >
          <Square size={12} strokeWidth={0} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={!canSend}
          className="mb-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tc-green text-[#06150f] transition-all hover:brightness-110 disabled:opacity-25"
          aria-label="Send"
        >
          <ArrowUp size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

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
  const connected = isProviderConnected(settings)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader settings={settings} busy={busy} />

      {/* Scrollable message thread */}
      <div className="tc-scrollbar min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyChat settings={settings} onPrompt={onPrompt} />
        ) : (
          <div className="space-y-3 px-4 py-4">
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
      <div className="shrink-0 border-t border-tc-border/50 bg-tc-panel px-4 pb-4 pt-3">
        {messages.length > 0 && (
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_PROMPTS.slice(0, 4).map(prompt => (
              <button
                key={prompt}
                onClick={() => onPrompt(prompt)}
                className="shrink-0 whitespace-nowrap rounded-full border border-tc-border bg-tc-surface px-2.5 py-1 text-[11px] text-tc-muted transition-colors hover:border-tc-green/40 hover:text-tc-text"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <ChatInput
          value={input}
          busy={busy}
          disabled={!connected}
          onChange={onInput}
          onSubmit={onSubmit}
          onStop={onStop}
        />
      </div>
    </div>
  )
}
