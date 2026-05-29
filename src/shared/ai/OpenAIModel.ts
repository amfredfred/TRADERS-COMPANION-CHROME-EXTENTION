import { BaseAIModel } from './BaseAIModel'
import type { AIContentBlock, AIContextPayload, AIStreamChunk } from './types'
import type { SessionSettings } from '../types/playbook'

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

export class OpenAIModel extends BaseAIModel {
  provider = 'gpt4o' as const

  constructor(settings: SessionSettings) {
    super(settings)
  }

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
        messages: messages.map(m => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        })),
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
          // Ignore partial SSE fragments.
        }
      }
    }

    onChunk({ type: 'done' })
  }
}
