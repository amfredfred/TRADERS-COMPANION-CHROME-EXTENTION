import type { SessionSettings } from '../types/playbook'
import { ClaudeModel } from './ClaudeModel'
import { NullAIModel } from './NullAIModel'
import { OpenAIModel } from './OpenAIModel'
import type { AIProviderClient } from './types'

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
