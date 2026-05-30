import { BaseAIModel } from './BaseAIModel'
import type { AIContentBlock, AIContextPayload, AIStreamChunk, CaptureChartFn } from './types'
import type { SessionSettings } from '../types/playbook'

// ── Types ─────────────────────────────────────────────────────────────────────

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, never> }
  | { type: 'tool_result'; tool_use_id: string; content: ClaudeContentBlock[] }

function toClaudeContent(content: string | AIContentBlock[]): string | ClaudeContentBlock[] {
  if (typeof content === 'string') return content
  return content.map(block =>
    block.type === 'text'
      ? { type: 'text' as const, text: block.text }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: block.mediaType, data: block.data } }
  )
}

// ── Tool definition ───────────────────────────────────────────────────────────

const CLAUDE_TOOLS = [{
  name: 'capture_chart',
  description: 'Capture a screenshot of the current trading chart for visual analysis. Call this when the user asks about chart patterns, trends, price action, market direction, setups, signals, or anything requiring visual inspection of the chart.',
  input_schema: { type: 'object', properties: {}, required: [] },
}]

// ── Streaming turn ────────────────────────────────────────────────────────────

interface TrackedBlock {
  type: 'text' | 'tool_use'
  text: string
  id: string
  name: string
}

interface TurnResult {
  toolUseId: string | null
  assistantBlocks: ClaudeContentBlock[]
}

async function streamTurn(
  url: string,
  headers: Record<string, string>,
  body: object,
  onChunk: (chunk: AIStreamChunk) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => '')
    throw new Error(`Claude request failed: ${res.status} ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const blocks = new Map<number, TrackedBlock>()
  let toolUseId: string | null = null

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

        if (json.type === 'content_block_start') {
          const cb = json.content_block
          blocks.set(json.index, { type: cb.type, text: '', id: cb.id ?? '', name: cb.name ?? '' })
        }

        if (json.type === 'content_block_delta') {
          const block = blocks.get(json.index)
          if (!block) continue
          if (block.type === 'text' && json.delta?.type === 'text_delta') {
            block.text += json.delta.text
            onChunk({ type: 'delta', delta: json.delta.text })
          }
        }

        if (json.type === 'content_block_stop') {
          const block = blocks.get(json.index)
          if (block?.type === 'tool_use') toolUseId = block.id
        }
      } catch {
        // Partial SSE fragment — ignore.
      }
    }
  }

  const assistantBlocks: ClaudeContentBlock[] = Array.from(blocks.values()).map(b =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'tool_use', id: b.id, name: b.name, input: {} }
  )

  return { toolUseId, assistantBlocks }
}

// ── ClaudeModel ───────────────────────────────────────────────────────────────

export class ClaudeModel extends BaseAIModel {
  provider = 'claude' as const

  constructor(settings: SessionSettings) {
    super(settings)
  }

  async streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void> {
    const apiKey = this.requireApiKey(this.settings.claudeApiKey, 'Claude API key')
    const allMessages = this.buildMessages(payload)
    const system = allMessages.find(m => m.role === 'system')?.content ?? ''
    const nonSystem = allMessages.filter(m => m.role !== 'system')

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }

    const baseBody = {
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1200,
      temperature: 0.3,
      stream: true,
      system: typeof system === 'string' ? system : '',
      tools: CLAUDE_TOOLS,
    }

    onChunk({ type: 'activity', activity: 'Connecting to Claude...' })

    const apiMessages = nonSystem.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: toClaudeContent(m.content),
    }))

    // ── Fast path: image was pre-captured by the service worker ──────────────
    // screenshotDataUrl is embedded in apiMessages (via buildMessages). Skip the
    // capture-tool turn and send directly for a single-turn analysis response.
    if (payload.screenshotDataUrl) {
      await streamTurn(
        'https://api.anthropic.com/v1/messages',
        headers,
        { ...baseBody, tools: undefined, messages: apiMessages },
        onChunk,
        signal,
      )
      onChunk({ type: 'done' })
      return
    }

    // ── Standard path: offer capture_chart tool ────────────────────────────────
    const { toolUseId, assistantBlocks } = await streamTurn(
      'https://api.anthropic.com/v1/messages',
      headers,
      { ...baseBody, messages: apiMessages },
      onChunk,
      signal,
    )

    if (!toolUseId) {
      onChunk({ type: 'done' })
      return
    }

    // Tool call — capture the chart
    onChunk({ type: 'activity', activity: 'Capturing chart...' })
    const dataUrl = await captureChart()

    if (!dataUrl) {
      onChunk({ type: 'error', error: 'Chart capture failed. Make sure a trading tab is active.' })
      return
    }

    onChunk({ type: 'screenshot', screenshotDataUrl: dataUrl })

    // Second turn with tool result + image
    const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
    const secondMessages = [
      ...apiMessages,
      { role: 'assistant' as const, content: assistantBlocks },
      {
        role: 'user' as const,
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: [{
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64 },
          }],
        }],
      },
    ]

    await streamTurn(
      'https://api.anthropic.com/v1/messages',
      headers,
      { ...baseBody, messages: secondMessages },
      onChunk,
      signal,
    )

    onChunk({ type: 'done' })
  }
}
