import { BaseAIModel } from './BaseAIModel'
import type { AIContextPayload, AIStreamChunk } from './types'
import type { SessionSettings } from '../types/playbook'

export class ClaudeModel extends BaseAIModel {
  provider = 'claude' as const

  constructor(settings: SessionSettings) {
    super(settings)
  }

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
          // Ignore partial SSE fragments.
        }
      }
    }

    onChunk({ type: 'done' })
  }
}
