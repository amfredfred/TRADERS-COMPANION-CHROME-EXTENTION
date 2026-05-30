import { BaseAIModel } from './BaseAIModel'
import type { AIContentBlock, AIContextPayload, AIStreamChunk, CaptureChartFn, ChartAnnotation } from './types'
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

// ── Tool definitions ──────────────────────────────────────────────────────────

/** Offered in Turn 1 — lets the AI request a chart screenshot. */
const CAPTURE_CHART_TOOLS = [{
  type: 'function',
  function: {
    name: 'capture_chart',
    description: 'Capture a cropped screenshot of the connected trading chart tab for visual analysis. Call this only when the user wants a chart review or visual context is required.',
    parameters: { type: 'object', properties: {} },
  },
}]

/** Offered in Turn 2 (after image provided) — lets the AI mark up the chart. */
const ANNOTATION_TOOLS = [{
  type: 'function',
  function: {
    name: 'draw_chart_annotations',
    description: 'Draw review annotations over the connected chart image using normalized coordinates (0–1 relative to the chart image). Only call this when you can clearly identify chart structures. Do not annotate if the chart is unclear or context is missing.',
    parameters: {
      type: 'object',
      required: ['annotations'],
      properties: {
        annotations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'type', 'confidence'],
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['line', 'box', 'arrow', 'label'] },
              label: { type: 'string' },
              text: { type: 'string' },
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
              x1: { type: 'number', minimum: 0, maximum: 1 },
              y1: { type: 'number', minimum: 0, maximum: 1 },
              x2: { type: 'number', minimum: 0, maximum: 1 },
              y2: { type: 'number', minimum: 0, maximum: 1 },
              width: { type: 'number', minimum: 0, maximum: 1 },
              height: { type: 'number', minimum: 0, maximum: 1 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  },
}]

// ── SSE streaming turn ────────────────────────────────────────────────────────

type TurnResult = {
  toolCallId: string | null
  toolCallName: string | null
  toolCallArgs: string
  assistantText: string
}

async function streamOpenAICompatibleTurn(args: {
  url: string
  label: string
  apiKey: string
  body: Record<string, unknown>
  onChunk: (chunk: AIStreamChunk) => void
  signal?: AbortSignal
}): Promise<TurnResult> {
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
  let toolCallName: string | null = null
  let toolCallArgs = ''
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

        // Accumulate streaming tool call fields
        const toolCall = delta?.tool_calls?.[0]
        if (toolCall?.id) toolCallId = toolCall.id
        if (toolCall?.function?.name) toolCallName = toolCall.function.name
        if (toolCall?.function?.arguments) toolCallArgs += toolCall.function.arguments
      } catch {
        // Partial SSE fragment — ignore
      }
    }
  }

  return { toolCallId, toolCallName, toolCallArgs, assistantText }
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

    const apiMessages = allMessages.map(m => ({
      role: m.role,
      content: toOpenAICompatibleContent(m.content, this.options.supportsVision),
    }))

    // Offer capture_chart tool only for chart review intents + vision-capable providers.
    const offerChartTool =
      payload.includeChartContext === true &&
      this.options.supportsTools &&
      this.options.supportsVision

    const url = `${this.options.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    const baseBody: Record<string, unknown> = {
      model: this.options.model,
      messages: apiMessages,
      stream: true,
      temperature: 0.3,
    }

    if (offerChartTool) {
      baseBody.tools = CAPTURE_CHART_TOOLS
      baseBody.tool_choice = 'auto'
    }

    onChunk({ type: 'activity', activity: `Connecting to ${this.options.label}…` })

    // ── Turn 1 ─────────────────────────────────────────────────────────────────
    const first = await streamOpenAICompatibleTurn({
      url, label: this.options.label, apiKey: this.options.apiKey,
      body: baseBody, onChunk, signal,
    })

    // No tool call → text-only response, done.
    if (!first.toolCallId || first.toolCallName !== 'capture_chart') {
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

    // ── Chart capture ──────────────────────────────────────────────────────────
    onChunk({ type: 'activity', activity: 'Capturing connected chart area…' })
    const dataUrl = await captureChart()

    if (!dataUrl) {
      onChunk({ type: 'error', error: 'Connected chart capture failed. Reconnect TC to the chart tab and try again.' })
      return
    }

    onChunk({ type: 'screenshot', screenshotDataUrl: dataUrl })

    const turn2Messages = [
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
      { role: 'tool', tool_call_id: first.toolCallId, content: 'Cropped chart screenshot captured successfully.' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          { type: 'text', text: 'Review this cropped chart image. If you can clearly identify key structures, call draw_chart_annotations with normalized coordinates (0–1). Only annotate when confident.' },
        ],
      },
    ]

    // ── Turn 2 — offer annotation tool ────────────────────────────────────────
    const turn2Body: Record<string, unknown> = {
      ...baseBody,
      messages: turn2Messages,
      tools: ANNOTATION_TOOLS,
      tool_choice: 'auto',
    }

    const second = await streamOpenAICompatibleTurn({
      url, label: this.options.label, apiKey: this.options.apiKey,
      body: turn2Body, onChunk, signal,
    })

    // If the AI called draw_chart_annotations, parse and emit
    if (second.toolCallName === 'draw_chart_annotations' && second.toolCallArgs) {
      const annotations = parseAnnotations(second.toolCallArgs)
      if (annotations.length > 0) {
        onChunk({
          type: 'annotations',
          annotations,
          annotationRegion: payload.capturedRegion,
        })
      }
    }

    onChunk({ type: 'done' })
  }
}

// ── Annotation parsing ────────────────────────────────────────────────────────

function parseAnnotations(argsJson: string): ChartAnnotation[] {
  try {
    const parsed = JSON.parse(argsJson) as { annotations?: unknown[] }
    if (!Array.isArray(parsed?.annotations)) return []

    return parsed.annotations.filter((a): a is ChartAnnotation => {
      if (typeof a !== 'object' || !a) return false
      const ann = a as Record<string, unknown>
      return (
        typeof ann.id === 'string' &&
        typeof ann.type === 'string' &&
        ['line', 'box', 'arrow', 'label'].includes(ann.type as string) &&
        typeof ann.confidence === 'number'
      )
    })
  } catch {
    return []
  }
}
