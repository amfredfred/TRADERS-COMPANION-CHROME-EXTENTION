import { BaseAIModel } from './BaseAIModel'
import type { AIContextPayload, AIStreamChunk } from './types'
import type { SessionSettings } from '../types/playbook'

export class NullAIModel extends BaseAIModel {
  provider = 'off' as const

  constructor(settings: SessionSettings) {
    super(settings)
  }

  async streamChat(_payload: AIContextPayload, onChunk: (chunk: AIStreamChunk) => void): Promise<void> {
    onChunk({
      type: 'error',
      error: 'AI review is disabled. Open Settings -> AI Provider and select OpenAI or Claude.',
    })
  }
}
