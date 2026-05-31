import type { ChartMetadata, ChartRegion } from '../shared/types/chart'

// ── Platform-specific chart root selectors ────────────────────────────────────

const PLATFORM_CHART_SELECTORS: Record<string, string[]> = {
  mt5: [
    '.chart-area',
    '[class*="chartArea"]',
    '[class*="chart-container"]',
    '[class*="ChartContainer"]',
    '[class*="chartWrapper"]',
    '[id*="chart"]',
  ],
  match_trader: [
    // TradingView iframe is the exact chart — use it directly
    'iframe[id^="tradingview_"]',
    'iframe[src^="blob:"]',
    '[data-testid="chart-container"] iframe',
    '#chartContainer iframe',
    // Container fallbacks (include toolbar — less precise)
    '[data-testid="chart-container"]',
    '#chartContainer',
    'chart-tv-entry',
    'mtr-chart-entry',
  ],
}

const GENERIC_CHART_SELECTORS = [
  '[class*="chart-container"]',
  '[class*="chart_container"]',
  '[class*="chartContainer"]',
  '[id*="chart"]',
  '[class*="chart-area"]',
  '[class*="chartArea"]',
  '[class*="price-chart"]',
  '[class*="pane-"]',
  '[class*="-pane"]',
  '[role="application"]',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPlatformKey(): string | null {
  const host = window.location.hostname
  if (/metatrader|mql5|mt5|webterminal/i.test(host)) return 'mt5'
  if (/matchtrader|matchtraderweb|maven\.markets/i.test(host)) return 'match_trader'
  return null
}

function waitForStableFrames(count = 2): Promise<void> {
  let remaining = count
  return new Promise(resolve => {
    function tick() {
      if (--remaining <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// ── Chart root detection ──────────────────────────────────────────────────────

// Match-Trader: TradingView iframe lives inside a known container.
// Query the container first, then return its iframe child — this is more
// reliable than querying all iframes on the page and picking by size.
function findMatchTraderChartIframe(): HTMLIFrameElement | null {
  const container = document.querySelector('#chartContainer, [data-testid="chart-container"]')
  if (container) {
    const iframe = container.querySelector<HTMLIFrameElement>('iframe')
    if (iframe) return iframe
  }
  return document.querySelector<HTMLIFrameElement>('iframe[id^="tradingview_"]')
}

export function findChartRoot(): HTMLElement | null {
  const platform = detectPlatformKey()

  if (platform === 'match_trader') {
    const iframe = findMatchTraderChartIframe()
    if (iframe) {
      const rect = iframe.getBoundingClientRect()
      if (rect.width > 300 && rect.height > 200) return iframe as unknown as HTMLElement
    }
    // Fall through to container-level fallbacks
    const containerSels = ['[data-testid="chart-container"]', '#chartContainer', 'chart-tv-entry', 'mtr-chart-entry']
    for (const sel of containerSels) {
      const el = document.querySelector<HTMLElement>(sel)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width > 300 && rect.height > 200) return el
    }
    return null
  }

  const selectors = platform
    ? [...(PLATFORM_CHART_SELECTORS[platform] ?? []), ...GENERIC_CHART_SELECTORS]
    : GENERIC_CHART_SELECTORS

  for (const selector of selectors) {
    let elements: HTMLElement[]
    try {
      elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
    } catch {
      continue
    }
    const viable = elements
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 300 && rect.height > 200)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    if (viable.length) return viable[0].el
  }
  return null
}

// ── Canvas collection ─────────────────────────────────────────────────────────

export function getVisibleCanvases(root: ParentNode = document): HTMLCanvasElement[] {
  return Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas')).filter(canvas => {
    const rect = canvas.getBoundingClientRect()
    const style = window.getComputedStyle(canvas)
    return (
      rect.width > 100 &&
      rect.height > 100 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    )
  })
}

// ── Composite canvas extraction ───────────────────────────────────────────────

export async function captureCompositeCanvas(canvases: HTMLCanvasElement[]): Promise<string | null> {
  if (!canvases.length) return null

  await waitForStableFrames(2)

  const rects = canvases.map(c => c.getBoundingClientRect())
  const left   = Math.min(...rects.map(r => r.left))
  const top    = Math.min(...rects.map(r => r.top))
  const right  = Math.max(...rects.map(r => r.right))
  const bottom = Math.max(...rects.map(r => r.bottom))

  const width  = Math.round(right - left)
  const height = Math.round(bottom - top)
  if (width < 100 || height < 100) return null

  const dpr = window.devicePixelRatio || 1
  const out = document.createElement('canvas')
  out.width  = width  * dpr
  out.height = height * dpr

  const ctx = out.getContext('2d')
  if (!ctx) return null

  ctx.scale(dpr, dpr)

  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i]
    const r = rects[i]
    try {
      ctx.drawImage(canvas, r.left - left, r.top - top, r.width, r.height)
    } catch {
      // Tainted canvas — skip this layer
    }
  }

  try {
    const dataUrl = out.toDataURL('image/png')
    if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 200) return null
    return dataUrl
  } catch {
    return null
  }
}

// ── Public: capture chart image ───────────────────────────────────────────────

export async function captureChartImage(): Promise<{ dataUrl: string | null; region: Omit<ChartRegion, 'tabId' | 'windowId'> | null }> {
  const root = findChartRoot()

  // Match-Trader: chart canvases live inside the same-origin blob: iframe.
  // Access iframe.contentDocument directly to get them.
  let canvases: HTMLCanvasElement[] = []
  if (detectPlatformKey() === 'match_trader') {
    const iframe = findMatchTraderChartIframe()
    if (iframe?.contentDocument) {
      canvases = getVisibleCanvases(iframe.contentDocument)
    }
  }

  if (!canvases.length) {
    canvases = getVisibleCanvases(root ?? document)
  }

  // Region: iframe/root bounding rect in the parent frame viewport
  let region: Omit<ChartRegion, 'tabId' | 'windowId'> | null = null

  const regionEl = (detectPlatformKey() === 'match_trader' ? findMatchTraderChartIframe() : null) ?? root
  if (regionEl) {
    const r = regionEl.getBoundingClientRect()
    region = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width:  Math.round(r.width),
      height: Math.round(r.height),
      devicePixelRatio: window.devicePixelRatio || 1,
      source: canvases.length ? 'canvas' : 'chart-container',
      confidence: canvases.length ? 0.95 : 0.7,
    }
  }

  const dataUrl = canvases.length ? await captureCompositeCanvas(canvases) : null
  return { dataUrl, region }
}

// ── Public: detect chart region (bounding box only, no pixel data) ────────────

export function detectChartRegion(): Omit<ChartRegion, 'tabId' | 'windowId'> | null {
  const root = findChartRoot()

  if (root) {
    const r = root.getBoundingClientRect()
    if (r.width > 200 && r.height > 150) {
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width:  Math.round(r.width),
        height: Math.round(r.height),
        devicePixelRatio: window.devicePixelRatio || 1,
        source: 'chart-container',
        confidence: 0.75,
      }
    }
  }

  // Fallback: largest canvas
  const canvases = getVisibleCanvases(document)
  if (canvases.length) {
    const rects  = canvases.map(c => c.getBoundingClientRect())
    const left   = Math.min(...rects.map(r => r.left))
    const top    = Math.min(...rects.map(r => r.top))
    const right  = Math.max(...rects.map(r => r.right))
    const bottom = Math.max(...rects.map(r => r.bottom))
    return {
      x: Math.round(left),
      y: Math.round(top),
      width:  Math.round(right - left),
      height: Math.round(bottom - top),
      devicePixelRatio: window.devicePixelRatio || 1,
      source: 'canvas',
      confidence: 0.9,
    }
  }

  return null
}

// ── Public: extract page/chart metadata ──────────────────────────────────────

export function extractChartMetadata(): ChartMetadata {
  const title  = document.title?.trim() || undefined
  const url    = window.location.href
  const domain = window.location.hostname

  let platform: string | undefined
  if (/metatrader|mql5|mt5/i.test(domain))           platform = 'MT5 Web'
  else if (/matchtrader|maven\.markets/i.test(domain)) platform = 'Match-Trader'

  // Match-Trader: symbol and timeframe are in the outer Angular header DOM
  let symbol: string | undefined
  let timeframe: string | undefined
  let detectedFrom: ChartMetadata['detectedFrom'] = 'url'

  if (platform === 'Match-Trader') {
    const symEl = document.querySelector('[data-testid="header-symbol"]')
    const rawSym = symEl?.textContent?.trim().replace(/\s+/g, '')
    if (rawSym) { symbol = rawSym; detectedFrom = 'dom' }

    // Timeframe button text is like " D1 " or " H1 "
    const tfEl = document.querySelector('chart-tv-interval-button button')
    const rawTf = tfEl?.textContent?.trim()
    if (rawTf) { timeframe = rawTf; detectedFrom = 'dom' }
  }

  // Fallback: parse from page title
  if (!symbol) {
    const m = title?.match(/\b([A-Z]{2,6}(?:USD|EUR|GBP|JPY|BTC|ETH|AUD|CAD|CHF|NZD)?(?:\/[A-Z]{2,6})?)\b/)
    if (m) { symbol = m[1].toUpperCase(); detectedFrom = 'title' }
  }
  if (!timeframe) {
    const m = title?.match(/\b(M1|M5|M15|M30|H1|H2|H4|H8|D1|W1|MN|1m|5m|15m|30m|1h|2h|4h|8h|1d|1w|daily|weekly)\b/i)
    if (m) { timeframe = m[1].toUpperCase(); detectedFrom = detectedFrom === 'dom' ? 'dom' : 'title' }
  }

  return { title, url, domain, symbol, timeframe, platform, detectedFrom }
}
