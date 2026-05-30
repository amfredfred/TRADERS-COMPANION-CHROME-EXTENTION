import { OpenAICompatibleModel } from './OpenAICompatibleModel'
import type { SessionSettings } from '../types/playbook'

export class GrokModel extends OpenAICompatibleModel {
  constructor(settings: SessionSettings) {
    const apiKey = settings.grokApiKey?.trim()
    if (!apiKey) throw new Error('Grok API key is missing. Add it in Settings -> AI Provider.')

    const model = settings.grokModel?.trim() || 'grok-3-mini'

    super(settings, {
      provider: 'grok',
      label: 'Grok',
      apiKey,
      baseUrl: 'https://api.x.ai',
      model,
      supportsVision: isGrokVisionModel(model),
      supportsTools: true,
    })
  }
}

function isGrokVisionModel(model: string): boolean {
  // Keep centralized and easy to update as xAI changes model capabilities.
  return /grok/i.test(model)
}
