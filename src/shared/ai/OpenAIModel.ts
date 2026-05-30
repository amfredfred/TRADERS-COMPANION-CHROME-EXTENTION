import { OpenAICompatibleModel } from './OpenAICompatibleModel'
import type { SessionSettings } from '../types/playbook'

export class OpenAIModel extends OpenAICompatibleModel {
  constructor(settings: SessionSettings) {
    const apiKey = settings.openaiApiKey?.trim()
    if (!apiKey) throw new Error('OpenAI API key is missing. Add it in Settings -> AI Provider.')

    super(settings, {
      provider: 'gpt4o',
      label: 'GPT-4o',
      apiKey,
      baseUrl: 'https://api.openai.com',
      model: settings.openaiModel?.trim() || 'gpt-4o-mini',
      supportsVision: true,
      supportsTools: true,
    })
  }
}
