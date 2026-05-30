/**
 * Chart annotation overlay for Trader's Companion.
 *
 * Injects a pointer-events-free SVG layer above the detected chart container.
 * Annotations use normalized coordinates (0–1) relative to the cropped chart
 * image, which maps cleanly to the chart's on-screen dimensions.
 */

import type { ChartAnnotation } from '../shared/types/chart'

const OVERLAY_ID = 'tc-chart-annotation-overlay'
const SELECTION_ID = 'tc-chart-selection-overlay'

// Colors keyed by confidence band
function annotationColor(confidence: number): string {
  if (confidence >= 0.75) return '#4ade80'   // tc-green — high confidence
  if (confidence >= 0.5) return '#facc15'    // amber — medium confidence
  return '#f87171'                            // red — low confidence
}

// ── Overlay rendering ─────────────────────────────────────────────────────────

/**
 * Renders AI-proposed annotations as an SVG overlay on top of the chart.
 * Removes any existing overlay first.
 *
 * @param annotations  Array of normalized-coordinate annotation objects.
 * @param chartRegion  Optional explicit region (x/y/w/h in CSS px). If omitted,
 *                     the overlay re-detects the chart element from the DOM.
 */
export function renderChartAnnotations(
  annotations: ChartAnnotation[],
  chartRegion?: { x: number; y: number; width: number; height: number },
): void {
  clearChartAnnotations()

  const region = chartRegion ?? detectRegionFromDom()
  if (!region) return

  const { x, y, width, height } = region

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = OVERLAY_ID
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    width: ${width}px;
    height: ${height}px;
    pointer-events: none;
    z-index: 2147483646;
    overflow: visible;
    font-family: Inter, system-ui, sans-serif;
  `

  // Arrow marker definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
  marker.setAttribute('id', 'tc-arrowhead')
  marker.setAttribute('markerWidth', '8')
  marker.setAttribute('markerHeight', '6')
  marker.setAttribute('refX', '8')
  marker.setAttribute('refY', '3')
  marker.setAttribute('orient', 'auto')
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  poly.setAttribute('points', '0 0, 8 3, 0 6')
  poly.setAttribute('fill', '#4ade80')
  marker.appendChild(poly)
  defs.appendChild(marker)
  svg.appendChild(defs)

  for (const ann of annotations) {
    appendAnnotation(svg, ann, width, height)
  }

  document.body.appendChild(svg)
}

function appendAnnotation(
  svg: SVGSVGElement,
  ann: ChartAnnotation,
  w: number,
  h: number,
): void {
  const color = annotationColor(ann.confidence)

  if (ann.type === 'line') {
    const line = svgEl('line')
    setAttrs(line, {
      x1: ann.x1 * w, y1: ann.y1 * h,
      x2: ann.x2 * w, y2: ann.y2 * h,
      stroke: color, 'stroke-width': '1.5', 'stroke-dasharray': '5 3',
    })
    svg.appendChild(line)
    if (ann.label) svg.appendChild(label(ann.label, ann.x1 * w, ann.y1 * h - 6, color))
  }

  if (ann.type === 'box') {
    const rect = svgEl('rect')
    setAttrs(rect, {
      x: ann.x * w, y: ann.y * h,
      width: ann.width * w, height: ann.height * h,
      fill: color + '18', stroke: color, 'stroke-width': '1.5',
    })
    svg.appendChild(rect)
    if (ann.label) svg.appendChild(label(ann.label, ann.x * w + 4, ann.y * h - 5, color))
  }

  if (ann.type === 'arrow') {
    const line = svgEl('line')
    setAttrs(line, {
      x1: ann.x1 * w, y1: ann.y1 * h,
      x2: ann.x2 * w, y2: ann.y2 * h,
      stroke: color, 'stroke-width': '2',
      'marker-end': 'url(#tc-arrowhead)',
    })
    svg.appendChild(line)
    if (ann.label) svg.appendChild(label(ann.label, ann.x2 * w + 5, ann.y2 * h, color))
  }

  if (ann.type === 'label') {
    svg.appendChild(label(ann.text, ann.x * w, ann.y * h, color))
  }
}

function label(text: string, x: number, y: number, color: string): SVGTextElement {
  const bg = svgEl('rect') as SVGRectElement
  const t = svgEl('text') as SVGTextElement
  t.textContent = text
  setAttrs(t, {
    x, y, fill: color,
    'font-size': '11', 'font-weight': '600', 'font-family': 'Inter, system-ui, sans-serif',
  })
  void bg // background rect could be added for legibility; skipping for minimal DOM
  return t
}

function svgEl(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag)
}

function setAttrs(el: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v))
  }
}

function detectRegionFromDom(): { x: number; y: number; width: number; height: number } | null {
  const selectors = [
    'canvas', '[class*="chart-container"]', '[class*="tv-chart"]',
    '[class*="pane"]', '[class*="chart"]',
  ]
  for (const sel of selectors) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel))
    const visible = els
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 300 && rect.height >= 250)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    if (visible.length) {
      const { rect } = visible[0]
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }
  }
  return null
}

// ── Clear overlay ─────────────────────────────────────────────────────────────

export function clearChartAnnotations(): void {
  document.getElementById(OVERLAY_ID)?.remove()
}

// ── Manual chart selection ────────────────────────────────────────────────────

/**
 * Shows a drag-to-select overlay so the user can manually define the chart
 * region. Returns the selected region in CSS pixels, or null if cancelled.
 */
export function startChartSelection(): Promise<
  { x: number; y: number; width: number; height: number } | null
> {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.id = SELECTION_ID
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      background: rgba(0,0,0,0.35);
    `

    const hint = document.createElement('div')
    hint.style.cssText = `
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: #06150f;
      color: #4ade80;
      border: 1px solid rgba(74,222,128,0.4);
      border-radius: 8px;
      padding: 8px 18px;
      font: 600 13px/1.5 Inter, system-ui, sans-serif;
      pointer-events: none;
      white-space: nowrap;
    `
    hint.textContent = 'Drag to select the chart area  ·  Esc to cancel'
    overlay.appendChild(hint)

    const sel = document.createElement('div')
    sel.style.cssText = `
      position: absolute;
      border: 2px solid #4ade80;
      background: rgba(74,222,128,0.07);
      pointer-events: none;
      display: none;
      border-radius: 2px;
    `
    overlay.appendChild(sel)

    let startX = 0, startY = 0, dragging = false

    function onMouseDown(e: MouseEvent) {
      e.preventDefault()
      startX = e.clientX
      startY = e.clientY
      dragging = true
      sel.style.display = 'block'
      sel.style.left = startX + 'px'
      sel.style.top = startY + 'px'
      sel.style.width = '0'
      sel.style.height = '0'
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      const x = Math.min(e.clientX, startX)
      const y = Math.min(e.clientY, startY)
      sel.style.left = x + 'px'
      sel.style.top = y + 'px'
      sel.style.width = Math.abs(e.clientX - startX) + 'px'
      sel.style.height = Math.abs(e.clientY - startY) + 'px'
    }

    function onMouseUp(e: MouseEvent) {
      if (!dragging) return
      dragging = false
      const x = Math.min(e.clientX, startX)
      const y = Math.min(e.clientY, startY)
      const w = Math.abs(e.clientX - startX)
      const h = Math.abs(e.clientY - startY)
      cleanup()
      // Reject tiny drag (accidental click)
      if (w < 100 || h < 80) { resolve(null); return }
      resolve({ x, y, width: w, height: h })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { cleanup(); resolve(null) }
    }

    function cleanup() {
      overlay.removeEventListener('mousedown', onMouseDown)
      overlay.removeEventListener('mousemove', onMouseMove)
      overlay.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
    }

    overlay.addEventListener('mousedown', onMouseDown)
    overlay.addEventListener('mousemove', onMouseMove)
    overlay.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', onKeyDown, true)
    document.body.appendChild(overlay)
  })
}
