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
  /** Classified chat intent — drives context level and tool gating. */
  intent?: string
  /**
   * Whether to include platform/chart context (snapshot, visible text) in the
   * built messages and to offer the capture_chart tool to the model.
   * Derived from intent by the service worker.
   */
  includeChartContext?: boolean
}

export interface AIStreamChunk {
  type: 'delta' | 'activity' | 'screenshot' | 'done' | 'error'
  delta?: string
  activity?: string
  screenshotDataUrl?: string
  error?: string
}

/** Called by the model when it needs a chart screenshot. Returns base64 data URL or null. */
export type CaptureChartFn = () => Promise<string | null>

export interface AIProviderClient {
  provider: AiProvider
  streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void>
}
