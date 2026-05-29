import type { SessionStateResponse } from '../lib/messages'
import type { AiProvider, Playbook, SessionSettings } from '../types/playbook'
import type { PlatformSnapshot } from '../types/platform'

export type AIChatRole = 'system' | 'user' | 'assistant'

export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_base64'; mediaType: 'image/png' | 'image/jpeg'; data: string }

export interface AIChatMessage {
  role: AIChatRole
  content: string | AIContentBlock[]
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
  type: 'delta' | 'activity' | 'screenshot' | 'done' | 'error'
  delta?: string
  activity?: string
  screenshotDataUrl?: string
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
