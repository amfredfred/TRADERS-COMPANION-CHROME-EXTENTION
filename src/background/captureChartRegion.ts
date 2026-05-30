/**
 * Chart region capture pipeline.
 *
 * Orchestrates the full chart-review capture flow:
 *   1. Ask content script to detect chart region + try canvas extraction
 *   2. Use direct canvas pixel data when available (fastest, no screenshot)
 *   3. Otherwise: capture full tab screenshot via CDP / activate-restore
 *   4. Crop to the detected chart region using OffscreenCanvas
 *   5. Validate the cropped image (size, contrast)
 *
 * Always sends the connected tab — never the active browser tab.
 */

import { clearConnectedTabState, getConnectedTabState, patchConnectedTabState } from './connectedTabStore'
import { sendToTab } from '../shared/lib/messages'
import type {
  ChartCaptureResult,
  ChartMetadata,
  ChartRegion,
  ChartRegionDetectResponse,
} from '../shared/types/chart'

const MIN_CROP_WIDTH_PX = 500
const MIN_CROP_HEIGHT_PX = 350

// ── Main entry point ──────────────────────────────────────────────────────────

export async function captureChartRegion(): Promise<ChartCaptureResult> {
  // Validate connected tab
  const connected = await getConnectedTabState()
  if (!connected?.tabId || !connected.windowId) {
    return {
      ok: false,
      code: 'NO_CONNECTED_TAB',
      error: 'No chart tab is connected. Attach TC to a chart tab first.',
    }
  }

  const tab = await chrome.tabs.get(connected.tabId).catch(() => null)
  if (!tab?.id) {
    await clearConnectedTabState()
    return {
      ok: false,
      code: 'TAB_NOT_FOUND',
      error: 'Connected tab is no longer available. Reconnect TC to a chart tab.',
    }
  }

  await patchConnectedTabState({
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  })

  // Step 1: Detect chart region + metadata in connected tab
  const detectRes = await sendToTab(tab.id, {
    type: 'TC_DETECT_CHART_REGION',
    payload: {},
  }).catch(() => null) as ChartRegionDetectResponse | null

  const rawRegion = detectRes?.region ?? null
  const metadata: ChartMetadata = detectRes?.metadata ?? {}
  const canvasDataUrl = detectRes?.canvasDataUrl ?? null

  // Step 2: Fast path — direct canvas extraction succeeded
  if (canvasDataUrl && rawRegion) {
    const region: ChartRegion = { ...rawRegion, tabId: tab.id, windowId: tab.windowId }
    const pixelW = rawRegion.width * rawRegion.devicePixelRatio
    const pixelH = rawRegion.height * rawRegion.devicePixelRatio
    const quality = await checkImageQuality(canvasDataUrl, pixelW, pixelH)
    if (quality.ok) {
      return {
        ok: true,
        tabId: tab.id,
        windowId: tab.windowId,
        croppedDataUrl: canvasDataUrl,
        region,
        metadata,
        capturedAt: Date.now(),
      }
    }
    // Canvas image failed quality check — fall through to screenshot path
  }

  // Step 3: Capture the full connected tab
  const fullDataUrl = await captureFullTab(tab.id, tab.windowId)
  if (!fullDataUrl) {
    return {
      ok: false,
      code: 'CAPTURE_FAILED',
      error: 'Failed to capture the connected chart tab. Reconnect TC and try again.',
    }
  }

  // Step 4: Require a detected region to crop
  if (!rawRegion) {
    return {
      ok: false,
      code: 'CHART_REGION_NOT_FOUND',
      error:
        'Could not detect the chart area on this page. ' +
        'Reconnect TC on the chart tab or use the "Select chart area" button.',
    }
  }

  const region: ChartRegion = { ...rawRegion, tabId: tab.id, windowId: tab.windowId }

  // Step 5: Crop to chart region
  const croppedDataUrl = await cropDataUrlToRegion(fullDataUrl, region).catch(() => null)
  if (!croppedDataUrl) {
    return {
      ok: false,
      code: 'CAPTURE_FAILED',
      error: 'Failed to crop the chart area from the screenshot.',
    }
  }

  // Step 6: Validate cropped image
  const pixelW = Math.round(rawRegion.width * rawRegion.devicePixelRatio)
  const pixelH = Math.round(rawRegion.height * rawRegion.devicePixelRatio)

  if (pixelW < MIN_CROP_WIDTH_PX || pixelH < MIN_CROP_HEIGHT_PX) {
    return {
      ok: false,
      code: 'CHART_TOO_SMALL',
      error: `Chart area is too small for review (${pixelW}×${pixelH}px). Enlarge the chart panel and try again.`,
    }
  }

  const quality = await checkImageQuality(croppedDataUrl, pixelW, pixelH)
  if (!quality.ok) {
    return {
      ok: false,
      code: 'CHART_BLURRED_OR_EMPTY',
      error: `Chart image quality is too low to review (${quality.reason}). Enlarge the chart and try again.`,
    }
  }

  return {
    ok: true,
    tabId: tab.id,
    windowId: tab.windowId,
    croppedDataUrl,
    region,
    metadata,
    capturedAt: Date.now(),
  }
}

// ── Full tab capture ──────────────────────────────────────────────────────────

async function captureFullTab(tabId: number, windowId: number): Promise<string | null> {
  // Preferred: CDP debugger — works on inactive/background tabs
  const target = { tabId }
  let attached = false
  try {
    await chrome.debugger.attach(target, '1.3')
    attached = true
    await chrome.debugger.sendCommand(target, 'Page.enable')
    const result = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    }) as { data?: string }
    if (result?.data) return `data:image/png;base64,${result.data}`
  } catch { /* fall through */ } finally {
    if (attached) { try { await chrome.debugger.detach(target) } catch { /* ignore */ } }
  }

  // Fallback: activate the tab, capture the visible area, then restore focus
  try {
    const [prevTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await chrome.windows.update(windowId, { focused: true })
    await chrome.tabs.update(tabId, { active: true })
    await wait(200)
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    if (prevTab?.id) {
      await chrome.windows.update(prevTab.windowId ?? windowId, { focused: true }).catch(() => {})
      await chrome.tabs.update(prevTab.id, { active: true }).catch(() => {})
    }
    return dataUrl
  } catch {
    return null
  }
}

// ── Image crop via OffscreenCanvas ────────────────────────────────────────────

export async function cropDataUrlToRegion(
  dataUrl: string,
  region: ChartRegion,
): Promise<string> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)

  const dpr = region.devicePixelRatio || 1
  const sx = Math.max(0, Math.round(region.x * dpr))
  const sy = Math.max(0, Math.round(region.y * dpr))
  const sw = Math.min(Math.round(region.width * dpr), bitmap.width - sx)
  const sh = Math.min(Math.round(region.height * dpr), bitmap.height - sy)

  if (sw <= 0 || sh <= 0) {
    bitmap.close()
    throw new Error(`Crop region out of image bounds (${sw}×${sh})`)
  }

  const canvas = new OffscreenCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('OffscreenCanvas 2D context not available')
  }

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  bitmap.close()

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' })
  return blobToDataUrl(croppedBlob)
}

// ── Image quality check ───────────────────────────────────────────────────────

async function checkImageQuality(
  dataUrl: string,
  _widthPx: number,
  _heightPx: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)

    if (bitmap.width < MIN_CROP_WIDTH_PX || bitmap.height < MIN_CROP_HEIGHT_PX) {
      bitmap.close()
      return { ok: false, reason: `too small (${bitmap.width}×${bitmap.height}px)` }
    }

    // Downsample to 32×32 and check channel spread (detects blank/solid-color images)
    const sample = new OffscreenCanvas(32, 32)
    const ctx = sample.getContext('2d')
    if (!ctx) { bitmap.close(); return { ok: true } }

    ctx.drawImage(bitmap, 0, 0, 32, 32)
    bitmap.close()

    const { data } = ctx.getImageData(0, 0, 32, 32)
    let minR = 255, maxR = 0, minG = 255, maxG = 0

    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < minR) minR = data[i]
      if (data[i] > maxR) maxR = data[i]
      if (data[i + 1] < minG) minG = data[i + 1]
      if (data[i + 1] > maxG) maxG = data[i + 1]
    }

    const contrast = Math.max(maxR - minR, maxG - minG)
    if (contrast < 8) {
      return { ok: false, reason: 'image appears blank or very low contrast' }
    }

    return { ok: true }
  } catch {
    return { ok: true } // Validation errors should not block the capture
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Encode in chunks to avoid call-stack limits on large images
  const parts: string[] = []
  const chunkSize = 32768
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength))
    let s = ''
    for (let j = 0; j < chunk.length; j++) s += String.fromCharCode(chunk[j])
    parts.push(s)
  }

  return `data:image/png;base64,${btoa(parts.join(''))}`
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
