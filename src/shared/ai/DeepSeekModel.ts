import { OpenAICompatibleModel } from './OpenAICompatibleModel'
import type { SessionSettings } from '../types/playbook'

export class DeepSeekModel extends OpenAICompatibleModel {
  constructor(settings: SessionSettings) {
    const apiKey = settings.deepseekApiKey?.trim()
    if (!apiKey) throw new Error('DeepSeek API key is missing. Add it in Settings -> AI Provider.')

    super(settings, {
      provider: 'deepseek',
      label: 'DeepSeek',
      apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: settings.deepseekModel?.trim() || 'deepseek-chat',
      supportsVision: false,
      supportsTools: true,
    })
  }
}
