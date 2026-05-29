# Trader's Companion — Dynamic AI Chat, Streaming Providers, and Pre-Trade Gate Fix

You are working on the uploaded Chrome extension codebase for Trader's Companion.

This is a React + TypeScript + Tailwind Chrome extension with these relevant files:

- `src/sidepanel/App.tsx`
- `src/popup/App.tsx`
- `src/background/service-worker.ts`
- `src/content/index.ts`
- `src/content/browserAgent.ts`
- `src/content/overlay/App.tsx`
- `src/content/overlay/components/PreTradeGate.tsx`
- `src/content/overlay/components/CompanionPanel.tsx`
- `src/options/App.tsx`
- `src/shared/lib/messages.ts`
- `src/shared/lib/storage.ts`
- `src/shared/types/playbook.ts`
- `src/shared/types/trade.ts`
- `src/shared/ui/*`

The current app feels static because AI responses are currently template-generated in:

- `src/content/browserAgent.ts` via `buildReview(...)`
- `src/background/service-worker.ts` via `buildSidecarReview(...)`

The side panel chat currently calls:

```ts
runTool('captureAndReview', prompt)
```

That returns a prewritten static review. This must be replaced with real provider-backed streaming chat.

Also, when clicking Buy/Sell/open trade, the gate throws:

```txt
Invalidation is required.
```

This is coming from `src/content/overlay/components/PreTradeGate.tsx`:

```ts
if (!invalidation.trim()) return 'Invalidation is required.'
```

That validation is correct in strict mode, but the UX is currently wrong because the gate does not clearly explain that invalidation is a required pre-trade field and it does not help the user fill it quickly.

## Primary goals

1. Make the chat feel like a real AI chat.
2. Remove static canned assistant responses.
3. Add a clean base AI model architecture that all providers extend.
4. Stream AI responses based on the user's selected provider/settings.
5. Keep provider keys in extension storage.
6. Fix pre-trade gate UX around required invalidation.
7. Keep the extension safe: AI is review/accountability only, not trade execution.
8. Do not add fake/demo data.
9. Do not over-engineer.
10. Do not rewrite the whole extension.

---

## Part 1 — Fix the Pre-Trade Gate invalidation UX

File:

```txt
src/content/overlay/components/PreTradeGate.tsx
```

Current behavior:

- User clicks Buy/Sell.
- TC intercepts the click.
- Pre-trade gate opens.
- Submit requires invalidation.
- If invalidation is empty, the user sees `Invalidation is required.`

Keep invalidation required, but improve the flow.

### Required changes

Add a clear required-field UI:

- Mark the invalidation textarea as required.
- Change the label from:

```txt
What invalidates this trade?
```

To something sharper:

```txt
Invalidation rule *
```

Helper text:

```txt
Define the exact price/action that proves this trade idea is wrong. Example: price closes back inside the swept range, or breaks the setup candle low/high.
```

Placeholder examples:

For long:

```txt
Example: M5 candle closes below the sweep low / setup candle low.
```

For short:

```txt
Example: M5 candle closes above the sweep high / setup candle high.
```

The error should appear directly under the invalidation field, not only in a generic card.

### Add quick-fill chips

Under the invalidation textarea, add chips/buttons:

- `Breaks setup candle low`
- `Breaks setup candle high`
- `Closes back inside range`
- `Invalidates HTF bias`
- `Liquidity sweep fails`

Clicking a chip should fill the invalidation field.

For direction-aware defaults:

- If direction is `long`, prioritize low/below wording.
- If direction is `short`, prioritize high/above wording.

### Validation rules

Keep validation strict when enforcement mode is not training.

But make the copy more useful:

Instead of:

```txt
Invalidation is required.
```

Use:

```txt
Add an invalidation rule before submitting. TC needs to know exactly where this idea is wrong.
```

Also disable the submit button until the required fields are valid. The user should not only discover the problem after clicking submit.

### Intended risk issue

Current code uses:

```ts
const intendedRisk = session?.riskPerTrade ? Math.max(session.riskPerTrade - 1.53, 0) : 0
```

This is fake/static and must be removed.

Replace with a user-editable intended risk field:

```ts
const [intendedRiskInput, setIntendedRiskInput] = useState('')
const intendedRisk = Number(intendedRiskInput)
```

Validation:

- required if strict/prop-firm mode
- must be a valid number
- must be greater than 0
- must not exceed `session.riskPerTrade` unless training mode allows warning-only

Do not hardcode `$68.20`, `1 / 3`, or any fake fallback values.

Replace:

```ts
const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 68.20
```

With:

```ts
const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 0
```

If no session exists, show `Start session required`, not fake values.

---

## Part 2 — Replace static AI with real streaming provider architecture

Add a new folder:

```txt
src/shared/ai/
```

Create these files:

```txt
src/shared/ai/types.ts
src/shared/ai/BaseAIModel.ts
src/shared/ai/OpenAIModel.ts
src/shared/ai/ClaudeModel.ts
src/shared/ai/NullAIModel.ts
src/shared/ai/createAIModel.ts
src/shared/ai/context.ts
```

### `src/shared/ai/types.ts`

Create provider-neutral types:

```ts
import type { AiProvider, SessionSettings, Playbook } from '../types/playbook'
import type { SessionStateResponse } from '../lib/messages'
import type { PlatformSnapshot } from '../types/platform'

export type AIChatRole = 'system' | 'user' | 'assistant'

export interface AIChatMessage {
  role: AIChatRole
  content: string
}

export interface AIContextPayload {
  prompt: string
  messages: AIChatMessage[]
  settings: SessionSettings
  session: SessionStateResponse
  playbooks: Playbook[]
  snapshot?: PlatformSnapshot | null
  visibleText?: string
  screenshotDataUrl?: string
}

export interface AIStreamChunk {
  type: 'delta' | 'activity' | 'done' | 'error'
  delta?: string
  activity?: string
  error?: string
}

export interface AIProviderClient {
  provider: AiProvider
  streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>
}
```

### `src/shared/ai/BaseAIModel.ts`

All providers must extend this base.

```ts
import type { AIChatMessage, AIContextPayload, AIProviderClient, AIStreamChunk } from './types'
import type { AiProvider, SessionSettings } from '../types/playbook'

export abstract class BaseAIModel implements AIProviderClient {
  abstract provider: AiProvider

  protected constructor(protected readonly settings: SessionSettings) {}

  abstract streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>

  protected buildSystemPrompt(payload: AIContextPayload): string {
    const activePlaybook = payload.playbooks.find(p => p.active) ?? payload.playbooks[0]

    return [
      `You are Trader's Companion, a professional trading accountability assistant.`,
      `You do not place trades, modify trades, close trades, or provide guaranteed signals.`,
      `Your job is to review context, ask for missing confirmation, check risk discipline, and enforce the user's playbook.`,
      `Be direct, concise, and practical.`,
      `Always mention uncertainty when chart/screenshot/platform context is incomplete.`,
      `Never invent account balance, symbol, timeframe, trade state, or risk values.`,
      `Use the user's session settings and playbook as the source of truth.`,
      activePlaybook ? `Active playbook: ${activePlaybook.name}. Stop rule: ${activePlaybook.stopRule}. Entry confirmation: ${activePlaybook.entryConfirmation}.` : `No active playbook configured.`,
    ].join('\n')
  }

  protected buildContextMessage(payload: AIContextPayload): string {
    const snapshot = payload.snapshot
    const session = payload.session

    return [
      `Current platform context:`,
      `- Platform: ${snapshot?.platformName ?? 'unknown'}`,
      `- Symbol: ${snapshot?.symbol ?? 'not detected'}`,
      `- Timeframe: ${snapshot?.timeframe ?? 'not detected'}`,
      `- Detection status: ${snapshot?.status ?? 'unknown'}`,
      `- Detection confidence: ${snapshot?.confidence ?? 0}%`,
      ``,
      `Session/risk context:`,
      `- Account balance: ${session.accountBalance || 'not available'}`,
      `- Daily budget: ${session.dailyBudget || 'not available'}`,
      `- Risk per trade: ${session.riskPerTrade || 'not available'}`,
      `- Trades today: ${session.tradesOpenedToday}/${session.maxTrades}`,
      `- No Trade Mode: ${session.noTradeMode ? 'on' : 'off'}`,
      `- Locked: ${session.locked ? 'yes' : 'no'}`,
      ``,
      `Visible page text:`,
      payload.visibleText?.trim() ? payload.visibleText.slice(0, 5000) : `No readable visible text captured.`,
    ].join('\n')
  }

  protected buildMessages(payload: AIContextPayload): AIChatMessage[] {
    return [
      { role: 'system', content: this.buildSystemPrompt(payload) },
      { role: 'user', content: this.buildContextMessage(payload) },
      ...payload.messages,
      { role: 'user', content: payload.prompt },
    ]
  }

  protected requireApiKey(value: string | undefined, label: string): string {
    const key = value?.trim()
    if (!key) throw new Error(`${label} is missing. Open TC settings and add your API key.`)
    return key
  }
}
```

### `src/shared/ai/OpenAIModel.ts`

Implement streaming with OpenAI Responses API or Chat Completions streaming.

Use the user's existing provider name `gpt4o`, but map it to a real model string.

Recommended:

```ts
const OPENAI_MODEL = 'gpt-4o-mini'
```

or allow a setting later. Do not hardcode fake provider output.

Basic implementation shape:

```ts
import { BaseAIModel } from './BaseAIModel'
import type { AIContextPayload, AIStreamChunk } from './types'

export class OpenAIModel extends BaseAIModel {
  provider = 'gpt4o' as const

  async streamChat(payload: AIContextPayload, onChunk: (chunk: AIStreamChunk) => void, signal?: AbortSignal): Promise<void> {
    const apiKey = this.requireApiKey(this.settings.openaiApiKey, 'OpenAI API key')
    const messages = this.buildMessages(payload)

    onChunk({ type: 'activity', activity: 'Connecting to OpenAI...' })

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        stream: true,
        temperature: 0.3,
        messages,
      }),
      signal,
    })

    if (!res.ok || !res.body) {
      const errorText = await res.text().catch(() => '')
      throw new Error(`OpenAI request failed: ${res.status} ${errorText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) onChunk({ type: 'delta', delta })
        } catch {
          // Ignore malformed SSE fragments.
        }
      }
    }

    onChunk({ type: 'done' })
  }
}
```

### `src/shared/ai/ClaudeModel.ts`

Implement Anthropic streaming.

```ts
import { BaseAIModel } from './BaseAIModel'
import type { AIContextPayload, AIStreamChunk } from './types'

export class ClaudeModel extends BaseAIModel {
  provider = 'claude' as const

  async streamChat(payload: AIContextPayload, onChunk: (chunk: AIStreamChunk) => void, signal?: AbortSignal): Promise<void> {
    const apiKey = this.requireApiKey(this.settings.claudeApiKey, 'Claude API key')
    const messages = this.buildMessages(payload)
    const system = messages.find(m => m.role === 'system')?.content ?? ''
    const nonSystemMessages = messages.filter(m => m.role !== 'system')

    onChunk({ type: 'activity', activity: 'Connecting to Claude...' })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1200,
        temperature: 0.3,
        stream: true,
        system,
        messages: nonSystemMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
      signal,
    })

    if (!res.ok || !res.body) {
      const errorText = await res.text().catch(() => '')
      throw new Error(`Claude request failed: ${res.status} ${errorText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()

        try {
          const json = JSON.parse(data)
          if (json.type === 'content_block_delta') {
            const delta = json.delta?.text
            if (delta) onChunk({ type: 'delta', delta })
          }
        } catch {
          // Ignore malformed SSE fragments.
        }
      }
    }

    onChunk({ type: 'done' })
  }
}
```

### `src/shared/ai/NullAIModel.ts`

When AI provider is off, do not pretend to be AI.

```ts
import { BaseAIModel } from './BaseAIModel'
import type { AIContextPayload, AIStreamChunk } from './types'

export class NullAIModel extends BaseAIModel {
  provider = 'off' as const

  async streamChat(_payload: AIContextPayload, onChunk: (chunk: AIStreamChunk) => void): Promise<void> {
    onChunk({
      type: 'error',
      error: 'AI review is disabled. Open TC settings and select OpenAI or Claude to enable live chat.',
    })
  }
}
```

### `src/shared/ai/createAIModel.ts`

```ts
import type { SessionSettings } from '../types/playbook'
import type { AIProviderClient } from './types'
import { OpenAIModel } from './OpenAIModel'
import { ClaudeModel } from './ClaudeModel'
import { NullAIModel } from './NullAIModel'

export function createAIModel(settings: SessionSettings): AIProviderClient {
  switch (settings.aiProvider) {
    case 'gpt4o':
      return new OpenAIModel(settings)
    case 'claude':
      return new ClaudeModel(settings)
    case 'off':
    default:
      return new NullAIModel(settings)
  }
}
```

---

## Part 3 — Add real streaming transport

`chrome.runtime.sendMessage` is not enough for good token streaming.

Use a long-lived port.

File:

```txt
src/shared/lib/messages.ts
```

Add types:

```ts
export interface AIStreamStartPayload {
  tabId?: number
  prompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type AIStreamPortMessage =
  | { type: 'TC_AI_STREAM_START'; payload: AIStreamStartPayload }
  | { type: 'TC_AI_STREAM_CANCEL' }
```

Add a new port name constant:

```ts
export const TC_AI_STREAM_PORT = 'tc-ai-stream'
```

File:

```txt
src/background/service-worker.ts
```

Add:

```ts
import { createAIModel } from '../shared/ai/createAIModel'
import type { AIStreamStartPayload } from '../shared/lib/messages'
```

Then register a port listener near the existing `onMessage` listener:

```ts
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'tc-ai-stream') return

  let controller: AbortController | null = null

  port.onMessage.addListener(async message => {
    if (message?.type === 'TC_AI_STREAM_CANCEL') {
      controller?.abort()
      controller = null
      return
    }

    if (message?.type !== 'TC_AI_STREAM_START') return

    controller?.abort()
    controller = new AbortController()

    try {
      const payload = message.payload as AIStreamStartPayload
      await handleAIStream(port, payload, controller.signal)
    } catch (error) {
      port.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  })

  port.onDisconnect.addListener(() => {
    controller?.abort()
    controller = null
  })
})
```

Create `handleAIStream`:

```ts
async function handleAIStream(
  port: chrome.runtime.Port,
  payload: AIStreamStartPayload,
  signal: AbortSignal,
): Promise<void> {
  const settings = await getSettings()
  if (!settings) {
    port.postMessage({ type: 'error', error: 'TC settings are not configured.' })
    return
  }

  const tab = await resolveToolTab({} as chrome.runtime.MessageSender, payload.tabId)
  const account = await getActiveAccount()
  const playbookResult = await chrome.storage.local.get(`playbooks_${account?.id ?? 'default'}`)
  const playbooks = playbookResult[`playbooks_${account?.id ?? 'default'}`] ?? []

  const [snapshot, visibleText, session, capture] = await Promise.all([
    tab?.id ? getTabSnapshot(tab.id).catch(() => null) : Promise.resolve(null),
    tab?.id ? sendToTab(tab.id, { type: 'TC_AGENT_TOOL_REQUEST', payload: { tool: 'getVisiblePageText' } }).catch(() => '') : Promise.resolve(''),
    buildSessionStateResponse(),
    tab?.id ? handleAgentToolRequest({} as chrome.runtime.MessageSender, { tabId: tab.id, tool: 'captureVisibleChart' } as AgentToolRequest).catch(() => null) : Promise.resolve(null),
  ])

  const model = createAIModel(settings)

  await model.streamChat(
    {
      prompt: payload.prompt,
      messages: payload.messages,
      settings,
      session,
      playbooks,
      snapshot,
      visibleText: typeof visibleText === 'string' ? visibleText : '',
      screenshotDataUrl: (capture as { dataUrl?: string } | null)?.dataUrl,
    },
    chunk => port.postMessage(chunk),
    signal,
  )
}
```

Do not delete `TC_AGENT_TOOL_REQUEST` immediately because other code still uses it. But stop using static `captureAndReview` for the main side panel chat.

---

## Part 4 — Refactor side panel chat to stream like real chat

File:

```txt
src/sidepanel/App.tsx
```

Current chat flow:

```ts
const review = await runTool('captureAndReview', prompt)
setMessages([...assistant message with review.response])
```

Replace this with port-based streaming.

### Add state

```ts
const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
const aiPortRef = useRef<chrome.runtime.Port | null>(null)
```

### Add cleanup

```ts
useEffect(() => {
  return () => {
    aiPortRef.current?.disconnect()
    aiPortRef.current = null
  }
}, [])
```

### Replace `submitPrompt`

Behavior:

1. Add user message immediately.
2. Add empty assistant message immediately.
3. Open `chrome.runtime.connect({ name: 'tc-ai-stream' })`.
4. Send `TC_AI_STREAM_START` with prompt, tabId, and message history.
5. Append deltas into the assistant message as chunks arrive.
6. Show activity messages separately.
7. On done, stop busy state.
8. On error, append error in the assistant bubble.

Implementation shape:

```ts
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

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: prompt,
    at: Date.now(),
  }

  const assistantId = crypto.randomUUID()
  const assistantMessage: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    at: Date.now(),
  }

  setMessages(current => [...current, userMessage, assistantMessage])
  setStreamingMessageId(assistantId)

  aiPortRef.current?.disconnect()
  const port = chrome.runtime.connect({ name: 'tc-ai-stream' })
  aiPortRef.current = port

  port.onMessage.addListener(message => {
    if (message.type === 'activity') {
      setActivities(current => [
        { label: 'AI', detail: message.activity, at: Date.now() },
        ...current,
      ].slice(0, 8))
      return
    }

    if (message.type === 'delta') {
      const delta = message.delta ?? ''
      setMessages(current => current.map(item =>
        item.id === assistantId
          ? { ...item, content: item.content + delta }
          : item
      ))
      return
    }

    if (message.type === 'done') {
      setBusy(false)
      setStreamingMessageId(null)
      port.disconnect()
      aiPortRef.current = null
      return
    }

    if (message.type === 'error') {
      setMessages(current => current.map(item =>
        item.id === assistantId
          ? { ...item, content: message.error || 'AI request failed.' }
          : item
      ))
      setBusy(false)
      setStreamingMessageId(null)
      port.disconnect()
      aiPortRef.current = null
    }
  })

  port.onDisconnect.addListener(() => {
    setBusy(false)
    setStreamingMessageId(null)
    if (aiPortRef.current === port) aiPortRef.current = null
  })

  const history = messages
    .filter(m => m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content }))

  port.postMessage({
    type: 'TC_AI_STREAM_START',
    payload: {
      tabId: tabStatus?.tabId ?? undefined,
      prompt,
      messages: history,
    },
  })
}
```

### Chat UI improvements

Make the chat visually behave like chat:

- Assistant bubble left.
- User bubble right.
- Use max width around 85%.
- Show streaming cursor while response is streaming.
- Keep composer sticky at bottom.
- Enter sends, Shift+Enter creates newline.
- Disable send while streaming, but allow Cancel/Stop.
- Add a `Stop` button while busy that sends `TC_AI_STREAM_CANCEL`.

Add:

```ts
function stopStreaming() {
  aiPortRef.current?.postMessage({ type: 'TC_AI_STREAM_CANCEL' })
  aiPortRef.current?.disconnect()
  aiPortRef.current = null
  setBusy(false)
  setStreamingMessageId(null)
}
```

Pass it into `ChatComposer` and show `Stop` instead of `Send` while busy.

### Empty state

If the only message is the initial assistant static message, replace it with a proper empty state instead of fake chat content.

Initial messages should be empty:

```ts
const [messages, setMessages] = useState<ChatMessage[]>([])
```

Then render:

```tsx
{messages.length === 0 && (
  <EmptyState
    title="Ask TC to review this trade."
    body="TC will use your selected AI provider, current tab context, playbook, session risk, and visible chart/page context."
  />
)}
```

Do not preload a fake assistant message.

---

## Part 5 — Remove static `captureAndReview` from the primary chat path

Do not delete `captureAndReview` yet if the fallback companion panel still uses it.

But update `CompanionPanel.tsx` too, otherwise fallback still feels static.

File:

```txt
src/content/overlay/components/CompanionPanel.tsx
```

Current behavior imports:

```ts
import { captureAndReview } from '../../browserAgent'
```

This is static. Replace fallback panel chat with the same background AI stream port if possible.

If using port from content script is too complex, make the fallback panel call background using a new message type that streams is not possible with sendMessage. Prefer using `chrome.runtime.connect({ name: 'tc-ai-stream' })` from content script as well.

Fallback panel should share the same streaming helper as sidepanel if practical.

Recommended shared helper:

```txt
src/shared/ai/useAIStream.ts
```

Only do this if it does not create complexity. Otherwise duplicate a small local port handler in sidepanel and CompanionPanel.

---

## Part 6 — Provider settings must actually control behavior

File:

```txt
src/options/App.tsx
```

Existing settings already include:

```ts
aiProvider: 'off' | 'gpt4o' | 'claude'
openaiApiKey?: string
claudeApiKey?: string
```

Make sure:

- If `aiProvider` is `off`, chat shows a clear disabled state.
- If OpenAI selected and no OpenAI key exists, chat shows setup required.
- If Claude selected and no Claude key exists, chat shows setup required.
- The test connection button should call the real provider endpoint, not just validate non-empty key.
- Provider switching should persist.

Add optional model settings later only if needed. Do not over-engineer now.

---

## Part 7 — Manifest/CSP/permissions check

Check the extension manifest/build config.

The extension must allow requests to:

```txt
https://api.openai.com/*
https://api.anthropic.com/*
```

Add them to `host_permissions` if missing.

Do not expose API keys to content pages. Provider calls should happen in the extension background service worker, not injected page context.

---

## Part 8 — Error handling

Handle these cases cleanly:

### Provider off

Message:

```txt
AI review is disabled. Open Settings → AI Provider and select OpenAI or Claude.
```

### Missing key

Message:

```txt
OpenAI API key is missing. Add it in Settings → AI Provider.
```

or:

```txt
Claude API key is missing. Add it in Settings → AI Provider.
```

### Extension reloaded/context invalidated

Message:

```txt
TC was reloaded. Refresh the trading tab to reconnect the companion.
```

### No trading tab

Message:

```txt
No trading tab is attached. Open a supported trading page or use manual review mode.
```

### Screenshot unavailable

Do not fail the entire chat. Continue with text/snapshot/session context and say screenshot was unavailable.

---

## Part 9 — Remove fake/static values

Search and remove hardcoded/fake values such as:

```ts
68.20
session?.tradesOpenedToday ?? 1
/ 3
Math.max(session.riskPerTrade - 1.53, 0)
```

Replace with real session/settings values or `Not available`.

No fake data. No demo state. No canned AI response pretending to be intelligent.

---

## Part 10 — Acceptance criteria

The implementation is complete only when all these are true:

1. Clicking Buy/Sell still opens the pre-trade gate.
2. The gate clearly shows invalidation as required.
3. The submit button is disabled until invalidation, setup reason, checklist, session, and intended risk are valid.
4. The invalidation error appears beside the invalidation field.
5. Intended risk is entered by the user or calculated from real platform/order data only. No fake risk values.
6. Side panel chat starts empty with a proper empty state.
7. Sending a message creates a user bubble immediately.
8. Assistant bubble streams token-by-token from the selected AI provider.
9. OpenAI and Claude both extend `BaseAIModel`.
10. Provider selection in settings controls which model is used.
11. If provider is off or key is missing, the chat shows a clear actionable error.
12. `captureAndReview` static template is no longer used by the main sidepanel chat.
13. Background service worker owns provider API calls.
14. Content script does not expose API keys to the trading page.
15. No static canned response is returned as if it were AI.
16. No fake/demo values remain in risk/session UI.
17. Extension context invalidation is handled without console spam.
18. TypeScript builds cleanly.
19. Existing extension message flows still work.
20. The final UI feels like a real professional trading companion, not a static mockup.
