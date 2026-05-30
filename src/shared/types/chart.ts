/**
 * Shared chart capture and annotation types.
 *
 * Used by content scripts (detection, overlay), the service worker (capture,
 * crop), and the AI model layer (annotation tool schema).
 */

// ── Region ────────────────────────────────────────────────────────────────────

/**
 * A detected chart region in CSS pixels relative to the page viewport.
 * `tabId` / `windowId` are populated by the service worker after the content
 * script returns the raw coordinates.
 */
export type ChartRegion = {
  x: number
  y: number
  width: number
  height: number
  devicePixelRatio: number
  source: 'canvas' | 'chart-container' | 'manual-selection'
  confidence: number
  tabId?: number
  windowId?: number
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export type ChartMetadata = {
  title?: string
  url?: string
  domain?: string
  symbol?: string
  timeframe?: string
  platform?: string
  detectedFrom?: 'dom' | 'title' | 'url' | 'unknown'
}

// ── Annotations ───────────────────────────────────────────────────────────────

/**
 * AI-proposed chart annotations using normalized coordinates (0–1) relative
 * to the cropped chart image. The extension renders these as an SVG overlay.
 */
export type ChartAnnotation =
  | {
      id: string
      type: 'line'
      label?: string
      x1: number
      y1: number
      x2: number
      y2: number
      confidence: number
    }
  | {
      id: string
      type: 'box'
      label?: string
      x: number
      y: number
      width: number
      height: number
      confidence: number
    }
  | {
      id: string
      type: 'arrow'
      label?: string
      x1: number
      y1: number
      x2: number
      y2: number
      confidence: number
    }
  | {
      id: string
      type: 'label'
      text: string
      x: number
      y: number
      confidence: number
    }

// ── Capture result ────────────────────────────────────────────────────────────

export type ChartCaptureErrorCode =
  | 'NO_CONNECTED_TAB'
  | 'TAB_NOT_FOUND'
  | 'CHART_REGION_NOT_FOUND'
  | 'CHART_TOO_SMALL'
  | 'CHART_BLURRED_OR_EMPTY'
  | 'CAPTURE_FAILED'

export type ChartCaptureResult =
  | {
      ok: true
      tabId: number
      windowId: number
      croppedDataUrl: string
      region: ChartRegion
      metadata: ChartMetadata
      capturedAt: number
    }
  | {
      ok: false
      code: ChartCaptureErrorCode
      error: string
    }

// ── Content-script detect response ────────────────────────────────────────────

/** Returned by TC_DETECT_CHART_REGION from the content script. */
export type ChartRegionDetectResponse = {
  region: Omit<ChartRegion, 'tabId' | 'windowId'> | null
  metadata: ChartMetadata
  /** Present if a canvas element was successfully extracted via toDataURL. */
  canvasDataUrl?: string | null
}

/** Returned by TC_CAPTURE_CHART_REGION from the service worker. */
export type CaptureChartRegionResponse =
  | { ok: true; croppedDataUrl: string; region: ChartRegion; metadata: ChartMetadata; capturedAt: number }
  | { ok: false; code: ChartCaptureErrorCode; error: string }
