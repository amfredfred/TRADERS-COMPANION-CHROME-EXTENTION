import { detectAdapter } from './adapters'
import { getPlatformSnapshot } from './adapters/registry'
import { getVisiblePageText } from './browserAgent'
import { mountOverlay } from './overlay/mount'
import { sendToBackground } from '../shared/lib/messages'
import { detectChartRegion, tryExtractBestCanvasImage, extractChartMetadata } from './chartDetector'
import { renderChartAnnotations, clearChartAnnotations, startChartSelection } from './chartOverlay'
import type { PlatformAdapter } from './adapters/types'
import type {
  SessionStateResponse,
  LockActivatePayload,
  TradeIntentPayload,
} from '../shared/lib/messages'
import type { ChartAnnotation } from '../shared/types/chart'

let adapter: PlatformAdapter
let unmountOverlay: (() => void) | null = null
let destroyed = false
let stopAdapterObserving: (() => void) | null = null
let healthTimer: number | null = null

async function init() {
  if (!chrome.runtime?.id) return
  adapter = detectAdapter()

  // Mount the React overlay (shadow DOM, z-index max)
  const { unmount } = mountOverlay(adapter)
  unmountOverlay = unmount

  // Start position observation
  stopAdapterObserving = adapter.observe()

  adapter.onPositionOpened = position => {
    if (destroyed || !chrome.runtime?.id) return
    sendToBackground({
      type: 'TC_POSITION_OPENED',
      payload: { position, adapterName: adapter.name },
    })
  }

  adapter.onPositionClosed = trade => {
    if (destroyed || !chrome.runtime?.id) return
    sendToBackground({
      type: 'TC_POSITION_CLOSED',
      payload: { trade, adapterName: adapter.name },
    })
  }

  // Intercept buy/sell clicks via capture-phase delegation
  document.addEventListener('click', handleClick, { capture: true })

  // Listen for instructions from the background service worker
  chrome.runtime.onMessage.addListener(handleBackgroundMessage)
  window.addEventListener('message', handlePageBridgeMessage)

  // Check whether a lock is already active (e.g. after page reload or reinstall)
  const sessionState = await sendToBackground<void>({ type: 'TC_GET_SESSION_STATE' })
    .catch(() => null) as SessionStateResponse | null

  if (sessionState?.locked && sessionState.lockedUntil) {
    dispatchOverlayEvent('tc:lock-activate', {
      reason: sessionState.lockReason ?? 'Rule violation',
      reasonDetail: sessionState.lockReason ?? '',
      lockedUntil: sessionState.lockedUntil,
    } satisfies LockActivatePayload)
  }

  healthTimer = window.setInterval(tick, 30_000)
  window.addEventListener('pagehide', destroy, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') tick().catch(() => destroy())
  })
}

function handleClick(e: MouseEvent) {
  if (destroyed || !chrome.runtime?.id) return
  const target = e.target as Element
  const buyBtn  = adapter.detectBuyButton()
  const sellBtn = adapter.detectSellButton()

  const isBuy  = !!buyBtn  && (buyBtn  === target || buyBtn.contains(target))
  const isSell = !!sellBtn && (sellBtn === target || sellBtn.contains(target))

  if (!isBuy && !isSell) return

  // Intercept — do not let the click reach the broker
  e.preventDefault()
  e.stopImmediatePropagation()

  const payload: TradeIntentPayload = {
    direction: isBuy ? 'long' : 'short',
    symbol: adapter.detectSymbol(),
    adapterName: adapter.name,
  }

  sendToBackground({ type: 'TC_TRADE_INTENT_OPEN', payload })
    .then(response => {
      // Background may respond with a gate config or an immediate block
      if (response && typeof response === 'object') {
        const res = response as { blocked?: boolean; reason?: string; gateConfig?: unknown }
        if (res.blocked) {
          dispatchOverlayEvent('tc:gate-blocked', { reason: res.reason })
        } else {
          dispatchOverlayEvent('tc:gate-open', {
            intentId: (res.gateConfig as { intentId?: string })?.intentId,
            direction: payload.direction,
            symbol: payload.symbol,
            gateConfig: res.gateConfig,
          })
        }
      }
    })
    .catch(err => console.error('[TC] Gate request failed', err))
}

function handleBackgroundMessage(msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) {
  if (destroyed) {
    sendResponse({ ok: false, error: 'Content script is disconnected. Refresh this trading tab to reconnect TC.' })
    return true
  }
  const message = msg as { type: string; payload?: unknown }
  switch (message.type) {
    case 'TC_LOCK_ACTIVATE':
      dispatchOverlayEvent('tc:lock-activate', message.payload)
      adapter.blockNewOrders()
      break
    case 'TC_LOCK_RELEASE':
      dispatchOverlayEvent('tc:lock-release', {})
      adapter.unblockNewOrders()
      break
    case 'TC_GATE_OPEN':
      dispatchOverlayEvent('tc:gate-open', message.payload)
      break
    case 'TC_GET_PLATFORM_SNAPSHOT':
      sendResponse(getPlatformSnapshot(adapter, 'manual_attach'))
      return true
    case 'TC_AGENT_TOOL_REQUEST': {
      const payload = message.payload as { tool?: string } | undefined
      if (payload?.tool === 'getVisiblePageText') {
        sendResponse(getVisiblePageText())
        return true
      }
      if (payload?.tool === 'getPlatformSnapshot') {
        sendResponse(getPlatformSnapshot(adapter, 'manual_attach'))
        return true
      }
      sendResponse({ ok: false, error: 'Tool not available in content script.' })
      return true
    }

    case 'TC_DETECT_CHART_REGION': {
      const region = detectChartRegion()
      const metadata = extractChartMetadata()
      const canvasDataUrl = tryExtractBestCanvasImage()
      sendResponse({ region, metadata, canvasDataUrl })
      return true
    }

    case 'TC_RENDER_CHART_ANNOTATIONS': {
      const { annotations, region } = (message.payload ?? {}) as {
        annotations?: ChartAnnotation[]
        region?: { x: number; y: number; width: number; height: number }
      }
      if (Array.isArray(annotations)) {
        renderChartAnnotations(annotations, region)
      }
      sendResponse({ ok: true })
      return true
    }

    case 'TC_CLEAR_CHART_ANNOTATIONS':
      clearChartAnnotations()
      sendResponse({ ok: true })
      return true

    case 'TC_START_CHART_SELECTION':
      startChartSelection()
        .then(region => sendResponse({ ok: true, region }))
        .catch(() => sendResponse({ ok: false, region: null }))
      return true  // async response
  }
  return false
}

function dispatchOverlayEvent(name: string, detail: unknown) {
  document.dispatchEvent(new CustomEvent(name, { detail }))
}

async function tick() {
  if (destroyed) return
  if (!chrome.runtime?.id) {
    destroy()
    return
  }

  await sendToBackground({ type: 'TC_HEALTH_CHECK' }).catch(() => destroy())
}

function destroy() {
  if (destroyed) return
  destroyed = true
  stopAdapterObserving?.()
  stopAdapterObserving = null
  unmountOverlay?.()
  unmountOverlay = null
  document.removeEventListener('click', handleClick, { capture: true })
  window.removeEventListener('message', handlePageBridgeMessage)
  if (healthTimer !== null) {
    window.clearInterval(healthTimer)
    healthTimer = null
  }
  try {
    chrome.runtime?.onMessage?.removeListener(handleBackgroundMessage)
  } catch {
    // Extension was reloaded; the old content script is intentionally inert now.
  }
}

function handlePageBridgeMessage(event: MessageEvent) {
  if (destroyed || event.source !== window) return
  const data = event.data as { source?: string; type?: string; requestId?: string } | undefined
  if (data?.source !== 'TC_PAGE') return

  if (data.type === 'TC_GET_SESSION_STATE') {
    sendToBackground({ type: 'TC_GET_SESSION_STATE' })
      .then(payload => {
        window.postMessage({ source: 'TC_CONTENT', type: 'TC_SESSION_STATE_RESULT', requestId: data.requestId, payload }, '*')
      })
      .catch(error => {
        window.postMessage({ source: 'TC_CONTENT', type: 'TC_SESSION_STATE_RESULT', requestId: data.requestId, error: String(error) }, '*')
      })
  }
}

// Entry point — wait for DOM if needed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init().catch(err => console.error('[TC] Init failed', err))
}
