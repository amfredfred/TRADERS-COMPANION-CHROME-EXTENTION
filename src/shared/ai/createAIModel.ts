import type { SessionSettings } from '../types/playbook'
import { ClaudeModel } from './ClaudeModel'
import { DeepSeekModel } from './DeepSeekModel'
import { GrokModel } from './GrokModel'
import { NullAIModel } from './NullAIModel'
import { OpenAIModel } from './OpenAIModel'
import type { AIProviderClient } from './types'

export function createAIModel(settings: SessionSettings): AIProviderClient {
  switch (settings.aiProvider) {
    case 'gpt4o':
      return new OpenAIModel(settings)
    case 'claude':
      return new ClaudeModel(settings)
    case 'deepseek':
      return new DeepSeekModel(settings)
    case 'grok':
      return new GrokModel(settings)
    case 'off':
    default:
      return new NullAIModel(settings)
  }
}
