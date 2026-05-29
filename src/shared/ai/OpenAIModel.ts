import { BaseAIModel } from './BaseAIModel'
import type { AIContentBlock, AIContextPayload, AIStreamChunk, CaptureChartFn } from './types'
import type { SessionSettings } from '../types/playbook'

// ── Types ─────────────────────────────────────────────────────────────────────

type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }

function toOpenAIContent(content: string | AIContentBlock[]): string | OpenAIContentBlock[] {
  if (typeof content === 'string') return content
  return content.map(block =>
    block.type === 'text'
      ? { type: 'text' as const, text: block.text }
      : { type: 'image_url' as const, image_url: { url: `data:${block.mediaType};base64,${block.data}`, detail: 'auto' as const } }
  )
}

// ── Tool definition ───────────────────────────────────────────────────────────

const OPENAI_TOOLS = [{
  type: 'function',
  function: {
    name: 'capture_chart',
    description: 'Capture a screenshot of the current trading chart for visual analysis. Call this when the user asks about chart patterns, trends, price action, market direction, setups, signals, or anything requiring visual inspection of the chart.',
    parameters: { type: 'object', properties: {} },
  },
}]

// ── Streaming turn ────────────────────────────────────────────────────────────

interface TurnResult {
  toolCallId: string | null
  assistantText: string
}

async function streamTurn(
  headers: Record<string, string>,
  body: object,
  onChunk: (chunk: AIStreamChunk) => void,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed: ${res.status} ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let toolCallId: string | null = null
  let assistantText = ''

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
        const delta = json.choices?.[0]?.delta

        if (delta?.content) {
          assistantText += delta.content
          onChunk({ type: 'delta', delta: delta.content })
        }

        if (delta?.tool_calls?.[0]?.id) {
          toolCallId = delta.tool_calls[0].id
        }
      } catch {
        // Partial SSE fragment — ignore.
      }
    }
  }

  return { toolCallId, assistantText }
}

// ── OpenAIModel ───────────────────────────────────────────────────────────────

export class OpenAIModel extends BaseAIModel {
  provider = 'gpt4o' as const

  constructor(settings: SessionSettings) {
    super(settings)
  }

  async streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void> {
    const apiKey = this.requireApiKey(this.settings.openaiApiKey, 'OpenAI API key')
    const allMessages = this.buildMessages(payload)

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }

    const baseBody = {
      model: 'gpt-4o-mini',
      stream: true,
      temperature: 0.3,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
    }

    onChunk({ type: 'activity', activity: 'Connecting to OpenAI...' })

    const apiMessages = allMessages.map(m => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    }))

    // First turn
    const { toolCallId, assistantText } = await streamTurn(
      headers,
      { ...baseBody, messages: apiMessages },
      onChunk,
      signal,
    )

    if (!toolCallId) {
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

    // Second turn: assistant + tool result + image as follow-up user message
    const secondMessages = [
      ...apiMessages,
      {
        role: 'assistant',
        content: assistantText || null,
        tool_calls: [{
          id: toolCallId,
          type: 'function',
          function: { name: 'capture_chart', arguments: '{}' },
        }],
      },
      { role: 'tool', tool_call_id: toolCallId, content: 'Chart screenshot captured.' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          { type: 'text', text: 'Analyze this chart.' },
        ],
      },
    ]

    await streamTurn(headers, { ...baseBody, messages: secondMessages }, onChunk, signal)
    onChunk({ type: 'done' })
  }
}
