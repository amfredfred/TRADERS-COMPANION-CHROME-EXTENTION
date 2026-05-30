/**
 * Chart region detection for the Trader's Companion content script.
 *
 * Detects the best visible chart element, extracts metadata, and optionally
 * tries a direct canvas pixel extraction (fast path). The service worker
 * enriches the returned region with tabId / windowId.
 */

import type { ChartMetadata, ChartRegion } from '../shared/types/chart'

const MIN_CHART_WIDTH = 300
const MIN_CHART_HEIGHT = 250

// ── Element detection ─────────────────────────────────────────────────────────

type Candidate = {
  element: HTMLElement
  rect: DOMRect
  source: ChartRegion['source']
  score: number
}

/**
 * Heuristically finds the most likely chart element from the current document.
 * Uses multiple selector strategies so it works across TradingView, Tradovate,
 * TopstepX, NinjaTrader Web, and other DOM structures.
 */
function scoreCandidates(): Candidate[] {
  const strategies: Array<{ selector: string; source: ChartRegion['source'] }> = [
    // Canvas elements are usually the chart itself
    { selector: 'canvas', source: 'canvas' },
    // TradingView-specific containers
    { selector: '[class*="chart-container"]', source: 'chart-container' },
    { selector: '[class*="chart_container"]', source: 'chart-container' },
    { selector: '[class*="tv-chart"]', source: 'chart-container' },
    { selector: '[class*="price-chart"]', source: 'chart-container' },
    // Generic pane / chart divs
    { selector: '[class*="pane-"]', source: 'chart-container' },
    { selector: '[class*="-pane"]', source: 'chart-container' },
    { selector: '[class*="chartPane"]', source: 'chart-container' },
    { selector: '[class*="chart-pane"]', source: 'chart-container' },
    // SVG chart roots (D3, recharts, etc.)
    { selector: 'svg[class*="chart"]', source: 'chart-container' },
    // Broad fallback — large-ish divs with "chart" somewhere
    { selector: '[id*="chart"]', source: 'chart-container' },
    { selector: '[data-chart]', source: 'chart-container' },
  ]

  const seen = new Set<Element>()
  const results: Candidate[] = []

  for (const { selector, source } of strategies) {
    let elements: HTMLElement[]
    try {
      elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
    } catch {
      continue
    }

    for (const element of elements) {
      if (seen.has(element)) continue
      seen.add(element)

      const rect = element.getBoundingClientRect()
      if (
        rect.width < MIN_CHART_WIDTH ||
        rect.height < MIN_CHART_HEIGHT ||
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= window.innerHeight ||
        rect.left >= window.innerWidth
      ) {
        continue
      }

      // Reject very narrow/tall aspect ratios (sidebars, panels)
      const aspectRatio = rect.width / rect.height
      if (aspectRatio < 0.5 || aspectRatio > 6) continue

      results.push({
        element,
        rect,
        source,
        score: rect.width * rect.height,
      })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

// ── Public: detect chart region ───────────────────────────────────────────────

export function detectChartRegion(): Omit<ChartRegion, 'tabId' | 'windowId'> | null {
  const candidates = scoreCandidates()
  if (!candidates.length) return null

  const best = candidates[0]
  const { rect, source } = best
  const dpr = window.devicePixelRatio || 1

  // Confidence depends on source type and whether selection was unique
  const confidence =
    source === 'canvas' ? 0.9 :
    source === 'manual-selection' ? 1.0 :
    candidates.length === 1 ? 0.85 : 0.7

  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    devicePixelRatio: dpr,
    source,
    confidence,
  }
}

// ── Public: try direct canvas extraction ─────────────────────────────────────

/**
 * Attempts to extract the chart image directly from a canvas element via
 * `toDataURL`. Returns null if the canvas is tainted, zero-sized, or WebGL-
 * backed without software fallback.
 */
export function tryExtractBestCanvasImage(): string | null {
  const candidates = scoreCandidates()
  const canvasCandidates = candidates.filter(c => c.element instanceof HTMLCanvasElement)
  if (!canvasCandidates.length) return null

  const canvas = canvasCandidates[0].element as HTMLCanvasElement
  try {
    const dataUrl = canvas.toDataURL('image/png')
    // Tainted canvases return 'data:,' or throw a SecurityError
    if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) return null
    return dataUrl
  } catch {
    return null
  }
}

// ── Public: extract page/chart metadata ──────────────────────────────────────

/**
 * Infers chart context (symbol, timeframe, platform) from the page title, URL,
 * and DOM. Best-effort — does not guess if the signal is weak.
 */
export function extractChartMetadata(): ChartMetadata {
  const title = document.title?.trim() || undefined
  const url = window.location.href
  const domain = window.location.hostname

  // Symbol: look for typical FX/crypto/futures patterns at start of title
  const symbolMatch = title?.match(
    /\b([A-Z]{2,6}(?:USD|EUR|GBP|JPY|BTC|ETH|AUD|CAD|CHF|NZD)?(?:\/[A-Z]{2,6})?)\b/
  )
  // Timeframe: common abbreviations
  const tfMatch = title?.match(
    /\b(M1|M5|M15|M30|H1|H2|H4|H8|D1|W1|MN|1m|5m|15m|30m|1h|2h|4h|8h|1d|1w|daily|weekly)\b/i
  )

  // Platform detection from domain
  let platform: string | undefined
  if (domain.includes('tradingview')) platform = 'TradingView'
  else if (domain.includes('topstep')) platform = 'TopstepX'
  else if (domain.includes('tradovate')) platform = 'Tradovate'
  else if (domain.includes('ninjatrade')) platform = 'NinjaTrader'
  else if (domain.includes('thinkorswim') || domain.includes('schwab')) platform = 'thinkorswim'
  else if (domain.includes('tradestation')) platform = 'TradeStation'
  else if (domain.includes('interactive') || domain.includes('ibkr')) platform = 'IBKR'

  const symbol = symbolMatch?.[1]?.toUpperCase()
  const timeframe = tfMatch?.[1]?.toUpperCase()

  return {
    title,
    url,
    domain,
    symbol,
    timeframe,
    platform,
    detectedFrom: symbol || timeframe ? 'title' : 'url',
  }
}
