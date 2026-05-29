import type { SessionStateResponse } from '../lib/messages'
import type { AiProvider, Playbook, SessionSettings } from '../types/playbook'
import type { PlatformSnapshot } from '../types/platform'

export type AIChatRole = 'system' | 'user' | 'assistant'

export interface AIChatMessage {
  role: AIChatRole
  content: string
}

export interface AIContextPayload {
  prompt: string
  messages: AIChatMessage[]
  settings: SessionSettings
  session: SessionStateResponse
  playbooks: Playbook[]
  snapshot?: PlatformSnapshot | null
  visibleText?: string
  screenshotDataUrl?: string
}

export interface AIStreamChunk {
  type: 'delta' | 'activity' | 'done' | 'error'
  delta?: string
  activity?: string
  error?: string
}

export interface AIProviderClient {
  provider: AiProvider
  streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>
}
