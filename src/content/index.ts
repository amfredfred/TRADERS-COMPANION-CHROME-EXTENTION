import { detectAdapter } from './adapters'
import { mountOverlay } from './overlay/mount'
import { sendToBackground } from '../shared/lib/messages'
import type { PlatformAdapter } from './adapters/types'
import type {
  SessionStateResponse,
  LockActivatePayload,
  TradeIntentPayload,
} from '../shared/lib/messages'

let adapter: PlatformAdapter
let unmountOverlay: (() => void) | null = null

async function init() {
  adapter = detectAdapter()

  // Mount the React overlay (shadow DOM, z-index max)
  const { unmount } = mountOverlay(adapter.name)
  unmountOverlay = unmount

  // Start position observation
  const stopObserving = adapter.observe()

  adapter.onPositionOpened = position => {
    sendToBackground({
      type: 'TC_POSITION_OPENED',
      payload: { position, adapterName: adapter.name },
    })
  }

  adapter.onPositionClosed = trade => {
    sendToBackground({
      type: 'TC_POSITION_CLOSED',
      payload: { trade, adapterName: adapter.name },
    })
  }

  // Intercept buy/sell clicks via capture-phase delegation
  document.addEventListener('click', handleClick, { capture: true })

  // Listen for instructions from the background service worker
  chrome.runtime.onMessage.addListener(handleBackgroundMessage)

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

  window.addEventListener('unload', () => {
    stopObserving()
    unmountOverlay?.()
    document.removeEventListener('click', handleClick, { capture: true })
    chrome.runtime.onMessage.removeListener(handleBackgroundMessage)
  })
}

function handleClick(e: MouseEvent) {
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

function handleBackgroundMessage(msg: unknown) {
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
  }
}

function dispatchOverlayEvent(name: string, detail: unknown) {
  document.dispatchEvent(new CustomEvent(name, { detail }))
}

// Entry point — wait for DOM if needed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init().catch(err => console.error('[TC] Init failed', err))
}
