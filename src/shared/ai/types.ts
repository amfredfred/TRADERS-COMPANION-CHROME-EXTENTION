import type { SessionStateResponse } from '../lib/messages'
import type { AiProvider, Playbook, SessionSettings } from '../types/playbook'
import type { PlatformSnapshot } from '../types/platform'
import type { ChartAnnotation, ChartRegion } from '../types/chart'

export type { ChartAnnotation }

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
  /**
   * The captured chart region (populated after a successful captureChartRegion
   * call). Used by the service worker to position annotation overlays.
   */
  capturedRegion?: Pick<ChartRegion, 'x' | 'y' | 'width' | 'height'>
  /**
   * Unique ID for this specific chart capture. Included in the system prompt
   * so the model knows it is reviewing a fresh image and must not reference
   * previous chart descriptions.
   */
  captureId?: string
  /** Unix timestamp (ms) of when the current chart capture was taken. */
  capturedAt?: number
  /**
   * Overrides the auto-built system prompt entirely. Used for trade review flows
   * where the domain-specific prompt must differ from the general chat prompt.
   */
  systemOverride?: string
  /**
   * Overrides the context level computed from intent. Set to `'none'` when the
   * caller builds all context into the prompt string directly (e.g. trade review).
   */
  contextLevel?: 'none' | 'session' | 'full'
}

export interface AIStreamChunk {
  type: 'delta' | 'activity' | 'screenshot' | 'annotations' | 'done' | 'error'
  delta?: string
  activity?: string
  screenshotDataUrl?: string
  /** Structured chart annotations from the draw_chart_annotations tool. */
  annotations?: ChartAnnotation[]
  /** Chart region at time of capture — needed to position the overlay. */
  annotationRegion?: Pick<ChartRegion, 'x' | 'y' | 'width' | 'height'>
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
