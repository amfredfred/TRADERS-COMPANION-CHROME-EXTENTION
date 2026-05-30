import type { AiProvider, SessionSettings } from '../types/playbook'

export type AIProviderCapability = {
  id: AiProvider
  label: string
  baseUrl?: string
  defaultModel?: string
  supportsStreaming: boolean
  supportsVision: boolean
  supportsTools: boolean
  keyField?: keyof SessionSettings
  modelField?: keyof SessionSettings
}

export const AI_PROVIDER_CAPABILITIES: Record<AiProvider, AIProviderCapability> = {
  off: {
    id: 'off',
    label: 'AI Off',
    supportsStreaming: false,
    supportsVision: false,
    supportsTools: false,
  },
  gpt4o: {
    id: 'gpt4o',
    label: 'GPT-4o',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    keyField: 'openaiApiKey',
    modelField: 'openaiModel',
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    defaultModel: 'claude-3-5-haiku-latest',
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    keyField: 'claudeApiKey',
    modelField: 'claudeModel',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    supportsStreaming: true,
    supportsVision: false,
    supportsTools: true,
    keyField: 'deepseekApiKey',
    modelField: 'deepseekModel',
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    baseUrl: 'https://api.x.ai',
    defaultModel: 'grok-3-mini',
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    keyField: 'grokApiKey',
    modelField: 'grokModel',
  },
}

export function getProviderCapability(provider: AiProvider): AIProviderCapability {
  return AI_PROVIDER_CAPABILITIES[provider]
}

export function getProviderApiKey(settings: SessionSettings): string | undefined {
  const meta = getProviderCapability(settings.aiProvider)
  if (!meta.keyField) return undefined
  const val = settings[meta.keyField]
  return typeof val === 'string' ? val : undefined
}

export function getProviderModel(settings: SessionSettings): string {
  const meta = getProviderCapability(settings.aiProvider)
  if (!meta.modelField) return meta.defaultModel ?? ''
  const val = settings[meta.modelField]
  return (typeof val === 'string' && val.trim()) ? val.trim() : (meta.defaultModel ?? '')
}

export function promptLikelyRequiresVision(prompt: string): boolean {
  return /chart|screenshot|visible|price action|candle|candlestick|setup|entry|buy|sell|trend|market direction|support|resistance|what.*see|how.*look/i.test(prompt)
}
