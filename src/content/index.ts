import { detectAdapter } from './adapters'
import { getPlatformSnapshot } from './adapters/registry'
import { getVisiblePageText } from './browserAgent'
import { mountOverlay } from './overlay/mount'
import { sendToBackground } from '../shared/lib/messages'
import { getLiveSession } from '../shared/lib/storage'
import { captureChartImage, detectChartRegion, extractChartMetadata } from './chartDetector'
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
let detectionTimer: number | null = null
let domObserver: MutationObserver | null = null

// ── Click execution guard ─────────────────────────────────────────────────────
// Two responsibilities:
//  1. Block real execution hazards (pending, debounce, budget, lock).
//  2. Re-trigger the original broker click after guards pass.
//
// Advisory concerns (low confidence, missing notes, no playbook) never block.
let isTradeIntentPending = false
let lastTradeClickMs = 0
const TRADE_CLICK_DEBOUNCE_MS = 1000

// Set to true just before a TC-synthetic re-trigger click so the listener
// lets it pass through to the broker without further interception.
let skipNextTradeClick = false

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

  void tick()
  scheduleDetectionUpdate('content_loaded')
  healthTimer = window.setInterval(tick, 30_000)
  window.addEventListener('pagehide', destroy, { once: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleDetectionUpdate('visible')
    if (document.visibilityState === 'hidden') tick().catch(() => destroy())
  })
  window.addEventListener('focus', handleFocus)
  window.addEventListener('storage', handleStorage)

  domObserver = new MutationObserver(() => scheduleDetectionUpdate('dom_mutation'))
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-testid', 'data-e2e', 'id'],
  })

  // ── SPA / route-change watcher ────────────────────────────────────────────
  // Re-run adapter detection when the URL changes (pushState/replaceState/popstate).
  // Debounced 1500 ms to let SPA frameworks finish rendering before we scan the DOM.
  let spaDebounce: ReturnType<typeof setTimeout> | null = null

  function onRouteChange() {
    if (spaDebounce) clearTimeout(spaDebounce)
    spaDebounce = setTimeout(() => {
      spaDebounce = null
      if (destroyed || !chrome.runtime?.id) return
      try {
        stopAdapterObserving?.()
        adapter = detectAdapter()
        stopAdapterObserving = adapter.observe()
        // Re-wire position callbacks
        adapter.onPositionOpened = position => {
          if (destroyed || !chrome.runtime?.id) return
          sendToBackground({ type: 'TC_POSITION_OPENED', payload: { position, adapterName: adapter.name } })
        }
        adapter.onPositionClosed = trade => {
          if (destroyed || !chrome.runtime?.id) return
          sendToBackground({ type: 'TC_POSITION_CLOSED', payload: { trade, adapterName: adapter.name } })
        }
        // Notify background so sidepanel refreshes
        scheduleDetectionUpdate('route_change')
      } catch { /* ignore */ }
    }, 1500)
  }

  // Patch history methods — these don't fire events natively
  const _pushState    = history.pushState.bind(history)
  const _replaceState = history.replaceState.bind(history)
  history.pushState = (...args) => { _pushState(...args); onRouteChange() }
  history.replaceState = (...args) => { _replaceState(...args); onRouteChange() }
  window.addEventListener('popstate', onRouteChange)
}

function handleFocus() {
  scheduleDetectionUpdate('focus')
}

function handleStorage() {
  scheduleDetectionUpdate('storage')
}

function scheduleDetectionUpdate(_reason: string) {
  if (destroyed || !chrome.runtime?.id) return
  if (detectionTimer !== null) window.clearTimeout(detectionTimer)
  detectionTimer = window.setTimeout(() => {
    detectionTimer = null
    void publishDetectionUpdate()
  }, 300)
}

async function publishDetectionUpdate() {
  if (destroyed || !chrome.runtime?.id) return
  const balance = adapter.detectAccountBalance()
  const equity = adapter.detectEquity?.() ?? null
  const pnl = adapter.detectPnL?.() ?? null
  await sendToBackground({
    type: 'TC_CONTENT_STATUS',
    payload: {
      snapshot: getPlatformSnapshot(adapter, 'auto_platform'),
      balance,
      equity,
      pnl,
    },
  }).catch(() => destroy())
}

function handleClick(e: MouseEvent) {
  if (destroyed || !chrome.runtime?.id) return

  const target  = e.target as Element
  const buyBtn  = adapter.detectBuyButton()
  const sellBtn = adapter.detectSellButton()
  const isBuy   = !!buyBtn  && (buyBtn  === target || buyBtn.contains(target))
  const isSell  = !!sellBtn && (sellBtn === target || sellBtn.contains(target))

  if (!isBuy && !isSell) return

  // Let TC's own synthetic re-trigger pass through to the broker.
  if (skipNextTradeClick) {
    skipNextTradeClick = false
    return
  }

  // Always intercept real user clicks so we control what happens next.
  e.preventDefault()
  e.stopImmediatePropagation()

  // ── Sync guards (immediate, no async) ───────────────────────────────────
  const now = Date.now()
  if (isTradeIntentPending) {
    console.info('[TC] Trade click ignored — submission in progress')
    return
  }
  if (now - lastTradeClickMs < TRADE_CLICK_DEBOUNCE_MS) {
    console.info('[TC] Trade click ignored — debounce active')
    return
  }

  isTradeIntentPending = true
  lastTradeClickMs = now

  const direction: 'long' | 'short' = isBuy ? 'long' : 'short'
  const symbol = adapter.detectSymbol()
  const button = (isBuy ? buyBtn : sellBtn) as HTMLElement

  // Async guard check → re-trigger → advisory panel.
  handleTradeButtonClick(direction, symbol, button)
    .finally(() => { isTradeIntentPending = false })
}

/**
 * Runs the execution guard (async checks: session lock, no-trade-mode, daily
 * budget). If all pass, the original broker click is re-triggered immediately
 * and the advisory review panel opens as a non-blocking side effect.
 */
async function handleTradeButtonClick(
  direction: 'long' | 'short',
  symbol: string | null,
  button: HTMLElement,
): Promise<void> {
  // Read session from local storage — fast, no network call.
  const session = await getLiveSession().catch(() => null)

  if (session) {
    // ── Real execution blockers ────────────────────────────────────────────

    // 1. Platform lock
    if (session.lockState && session.lockState.lockedUntil > Date.now()) {
      dispatchOverlayEvent('tc:execution-blocked', {
        reason: 'locked',
        message: 'Platform lock is active. New entries are blocked.',
      })
      return
    }

    // 2. No Trade Mode
    if (session.noTradeMode) {
      dispatchOverlayEvent('tc:execution-blocked', {
        reason: 'no_trade_mode',
        message: 'No Trade Mode is active. New entries are paused.',
      })
      return
    }

    // 3. Daily budget exhausted
    if (session.dailyBudget > 0) {
      const dailyLoss = Math.abs(Math.min(0, session.dailyPnl))
      if (dailyLoss >= session.dailyBudget) {
        dispatchOverlayEvent('tc:execution-blocked', {
          reason: 'daily_budget',
          message: `Daily loss budget of $${session.dailyBudget.toFixed(2)} has been reached. New entries are blocked.`,
        })
        return
      }
    }
  }

  // ── All guards passed ────────────────────────────────────────────────────

  // Re-trigger the original broker click. skipNextTradeClick lets our
  // capture-phase listener pass this synthetic event through untouched.
  skipNextTradeClick = true
  button.click()

  // Open the advisory review panel as a non-blocking side effect.
  // We deliberately do NOT await this — execution has already been
  // re-triggered above. The panel is an observer only.
  fireAdvisoryReview(direction, symbol)
}

/**
 * Registers the trade intent with the background (creates a tracking machine)
 * and opens the advisory review panel. Never awaited by the execution path.
 */
async function fireAdvisoryReview(
  direction: 'long' | 'short',
  symbol: string | null,
): Promise<void> {
  try {
    const payload: TradeIntentPayload = { direction, symbol, adapterName: adapter.name }
    const response = await sendToBackground({ type: 'TC_TRADE_INTENT_OPEN', payload }) as
      | { blocked?: boolean; reason?: string; gateConfig?: { intentId?: string } }
      | null

    if (response?.blocked) {
      // Rare race: background has a block we didn't detect locally — surface it.
      dispatchOverlayEvent('tc:execution-blocked', {
        reason: response.reason ?? 'blocked',
        message: getBlockMessage(response.reason),
      })
      return
    }

    dispatchOverlayEvent('tc:gate-open', {
      intentId: response?.gateConfig?.intentId,
      direction,
      symbol,
    })
  } catch (err) {
    console.error('[TC] Advisory review failed', err)
  }
}

function getBlockMessage(reason?: string): string {
  switch (reason) {
    case 'daily_budget':  return 'Daily loss budget has been reached. New entries are blocked.'
    case 'no_trade_mode': return 'No Trade Mode is active. New entries are paused.'
    default:              return 'Platform lock is active. New entries are blocked.'
  }
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
      sendResponse(getPlatformSnapshot(adapter, 'auto_platform'))
      return true
    case 'TC_AGENT_TOOL_REQUEST': {
      const payload = message.payload as { tool?: string } | undefined
      if (payload?.tool === 'getVisiblePageText') {
        sendResponse(getVisiblePageText())
        return true
      }
      if (payload?.tool === 'getPlatformSnapshot') {
        sendResponse(getPlatformSnapshot(adapter, 'auto_platform'))
        return true
      }
      sendResponse({ ok: false, error: 'Tool not available in content script.' })
      return true
    }

    case 'TC_DETECT_CHART_REGION': {
      const metadata = extractChartMetadata()
      captureChartImage()
        .then(({ dataUrl, region }) => sendResponse({ region, metadata, canvasDataUrl: dataUrl }))
        .catch(() => sendResponse({ region: detectChartRegion(), metadata, canvasDataUrl: null }))
      return true  // async response
    }

    case 'TC_HIDE_TC_UI': {
      const host = document.getElementById('tc-extension-host')
      if (host) host.style.visibility = 'hidden'
      sendResponse({ ok: true })
      return true
    }

    case 'TC_SHOW_TC_UI': {
      const host = document.getElementById('tc-extension-host')
      if (host) host.style.visibility = ''
      sendResponse({ ok: true })
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

  const balance = adapter.detectAccountBalance()
  const equity  = adapter.detectEquity?.() ?? null
  const pnl     = adapter.detectPnL?.() ?? null
  await sendToBackground({
    type: 'TC_HEALTH_CHECK',
    payload: { balance, equity, pnl },
  }).catch(() => destroy())
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
  if (detectionTimer !== null) {
    window.clearTimeout(detectionTimer)
    detectionTimer = null
  }
  domObserver?.disconnect()
  domObserver = null
  window.removeEventListener('focus', handleFocus)
  window.removeEventListener('storage', handleStorage)
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
