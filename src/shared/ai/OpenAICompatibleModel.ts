import { BaseAIModel } from './BaseAIModel'
import type { AIContentBlock, AIContextPayload, AIStreamChunk, CaptureChartFn } from './types'
import type { SessionSettings } from '../types/playbook'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpenAICompatibleOptions = {
  provider: 'gpt4o' | 'deepseek' | 'grok'
  label: string
  apiKey: string
  baseUrl: string
  model: string
  supportsVision: boolean
  supportsTools: boolean
}

type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

function toOpenAICompatibleContent(
  content: string | AIContentBlock[],
  supportsVision: boolean,
): string | OpenAIContentBlock[] {
  if (typeof content === 'string') return content

  const result: OpenAIContentBlock[] = []
  for (const block of content) {
    if (block.type === 'text') {
      result.push({ type: 'text', text: block.text })
    } else if (!supportsVision) {
      result.push({
        type: 'text',
        text: '[Screenshot omitted because selected provider/model is not configured for vision.]',
      })
    } else {
      result.push({
        type: 'image_url',
        image_url: {
          url: `data:${block.mediaType};base64,${block.data}`,
          detail: 'auto',
        },
      })
    }
  }
  return result
}

// ── Tool definition ───────────────────────────────────────────────────────────

const OPENAI_COMPATIBLE_TOOLS = [{
  type: 'function',
  function: {
    name: 'capture_chart',
    description: 'Capture a screenshot of the connected trading chart tab for visual analysis. Use only when visual inspection is required.',
    parameters: { type: 'object', properties: {} },
  },
}]

// ── SSE streaming turn ────────────────────────────────────────────────────────

async function streamOpenAICompatibleTurn(args: {
  url: string
  label: string
  apiKey: string
  body: Record<string, unknown>
  onChunk: (chunk: AIStreamChunk) => void
  signal?: AbortSignal
}): Promise<{ toolCallId: string | null; assistantText: string }> {
  const response = await fetch(args.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(args.body),
    signal: args.signal,
  })

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`${args.label} request failed: ${response.status} ${errorText}`)
  }

  const reader = response.body.getReader()
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
      if (!data || data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta

        if (delta?.content) {
          assistantText += delta.content
          args.onChunk({ type: 'delta', delta: delta.content })
        }

        const toolCall = delta?.tool_calls?.[0]
        if (toolCall?.id) toolCallId = toolCall.id
      } catch {
        // Partial SSE fragment. Ignore.
      }
    }
  }

  return { toolCallId, assistantText }
}

// ── OpenAICompatibleModel ─────────────────────────────────────────────────────

export class OpenAICompatibleModel extends BaseAIModel {
  provider: OpenAICompatibleOptions['provider']

  constructor(
    settings: SessionSettings,
    private readonly options: OpenAICompatibleOptions,
  ) {
    super(settings)
    this.provider = options.provider
  }

  async streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void> {
    const allMessages = this.buildMessages(payload)

    const requiresImage = this.promptLikelyNeedsChartImage(payload.prompt)

    if (requiresImage && !this.options.supportsVision) {
      onChunk({
        type: 'error',
        error: `${this.options.label} is connected, but the selected model is not configured for image/chart review. Use GPT-4o, Claude, Grok vision, or send text-only context.`,
      })
      return
    }

    const apiMessages = allMessages.map(m => ({
      role: m.role,
      content: toOpenAICompatibleContent(m.content, this.options.supportsVision),
    }))

    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: apiMessages,
      stream: true,
      temperature: 0.3,
    }

    if (this.options.supportsTools && this.options.supportsVision) {
      body.tools = OPENAI_COMPATIBLE_TOOLS
      body.tool_choice = 'auto'
    }

    onChunk({ type: 'activity', activity: `Connecting to ${this.options.label}...` })

    const url = `${this.options.baseUrl.replace(/\/$/, '')}/v1/chat/completions`

    const first = await streamOpenAICompatibleTurn({
      url,
      label: this.options.label,
      apiKey: this.options.apiKey,
      body,
      onChunk,
      signal,
    })

    if (!first.toolCallId) {
      onChunk({ type: 'done' })
      return
    }

    if (!this.options.supportsVision) {
      onChunk({
        type: 'error',
        error: `${this.options.label} requested a chart capture, but this provider/model is not vision-capable.`,
      })
      return
    }

    onChunk({ type: 'activity', activity: 'Capturing connected chart...' })
    const dataUrl = await captureChart()

    if (!dataUrl) {
      onChunk({ type: 'error', error: 'Connected chart capture failed. Reconnect TC to the chart tab and try again.' })
      return
    }

    onChunk({ type: 'screenshot', screenshotDataUrl: dataUrl })

    const secondMessages = [
      ...apiMessages,
      {
        role: 'assistant',
        content: first.assistantText || null,
        tool_calls: [{
          id: first.toolCallId,
          type: 'function',
          function: { name: 'capture_chart', arguments: '{}' },
        }],
      },
      { role: 'tool', tool_call_id: first.toolCallId, content: 'Connected chart screenshot captured.' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          { type: 'text', text: 'Analyze this connected chart screenshot.' },
        ],
      },
    ]

    await streamOpenAICompatibleTurn({
      url,
      label: this.options.label,
      apiKey: this.options.apiKey,
      body: { ...body, messages: secondMessages },
      onChunk,
      signal,
    })

    onChunk({ type: 'done' })
  }

  private promptLikelyNeedsChartImage(prompt: string): boolean {
    return /chart|price action|candle|candlestick|setup|entry|sell|buy|trend|market|visible|screenshot|review/i.test(prompt)
  }
}
