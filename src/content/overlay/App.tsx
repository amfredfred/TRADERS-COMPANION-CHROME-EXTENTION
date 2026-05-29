import { useEffect, useState } from 'react'
import { useStore } from '../../shared/state/store'
import type { PlatformAdapter } from '../adapters/types'
import type { LockActivatePayload } from '../../shared/lib/messages'
import { sendToBackground } from '../../shared/lib/messages'
import type { SessionStateResponse } from '../../shared/lib/messages'
import { getLiveSession } from '../../shared/lib/storage'
import type { TabPinState } from '../../shared/types/platform'

import SessionHUD from './components/SessionHUD'
import PreTradeGate from './components/PreTradeGate'
import LockOverlay from './components/LockOverlay'
import CompanionPanel from './components/CompanionPanel'

interface Props {
  adapter: PlatformAdapter
}

export default function App({ adapter }: Props) {
  const { overlay, setSession, openGate, activateLock, releaseLock, showExitPrompt } = useStore()
  const [pinned, setPinned] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Bootstrap session state from storage
  useEffect(() => {
    getLiveSession().then(s => { if (s) setSession(s) })
  }, [setSession])

  // Subscribe to custom events dispatched by the content script
  useEffect(() => {
    function onGateOpen(e: Event) {
      const { intentId, direction, symbol } = (e as CustomEvent).detail ?? {}
      if (intentId) openGate(intentId, direction, symbol ?? null)
    }

    function onGateBlocked(e: Event) {
      const { reason } = (e as CustomEvent).detail ?? {}
      console.warn('[TC] Gate blocked:', reason)
      // TODO: show brief block toast
    }

    function onLockActivate(e: Event) {
      const payload = (e as CustomEvent<LockActivatePayload>).detail
      activateLock({
        id: crypto.randomUUID(),
        reason: payload.reason,
        reasonDetail: payload.reasonDetail,
        lockedAt: Date.now(),
        lockedUntil: payload.lockedUntil,
      })
    }

    function onLockRelease() {
      releaseLock()
    }

    function onCompanionPinned(e: Event) {
      const payload = (e as CustomEvent<{ collapsed?: boolean }>).detail
      setPinned(true)
      setCollapsed(!!payload?.collapsed)
    }

    function onCompanionUnpinned() {
      setPinned(false)
    }

    function onCompanionCollapse(e: Event) {
      const payload = (e as CustomEvent<{ collapsed: boolean }>).detail
      setCollapsed(!!payload?.collapsed)
      setPinned(true)
    }

    document.addEventListener('tc:gate-open',    onGateOpen)
    document.addEventListener('tc:gate-blocked', onGateBlocked)
    document.addEventListener('tc:lock-activate', onLockActivate)
    document.addEventListener('tc:lock-release',  onLockRelease)
    document.addEventListener('tc:companion-pinned', onCompanionPinned)
    document.addEventListener('tc:companion-unpinned', onCompanionUnpinned)
    document.addEventListener('tc:companion-collapse', onCompanionCollapse)

    return () => {
      document.removeEventListener('tc:gate-open',    onGateOpen)
      document.removeEventListener('tc:gate-blocked', onGateBlocked)
      document.removeEventListener('tc:lock-activate', onLockActivate)
      document.removeEventListener('tc:lock-release',  onLockRelease)
      document.removeEventListener('tc:companion-pinned', onCompanionPinned)
      document.removeEventListener('tc:companion-unpinned', onCompanionUnpinned)
      document.removeEventListener('tc:companion-collapse', onCompanionCollapse)
    }
  }, [openGate, activateLock, releaseLock, showExitPrompt])

  useEffect(() => {
    sendToBackground({ type: 'TC_GET_PIN_STATE' })
      .then(res => {
        const pin = res as TabPinState | null
        if (pin?.pinned) {
          setPinned(true)
          setCollapsed(pin.panelCollapsed)
        }
      })
      .catch(() => {})
  }, [])

  // Refresh session state from background periodically
  useEffect(() => {
    const refresh = () => {
      sendToBackground<void>({ type: 'TC_GET_SESSION_STATE' })
        .then(res => {
          const r = res as SessionStateResponse | null
          if (!r) return
          setSession({
            accountId: '',
            startedAt: Date.now(),
            accountBalance: 0,
            dailyBudget: r.dailyBudget,
            riskPerTrade: r.riskPerTrade,
            tradesOpenedToday: r.tradesOpenedToday,
            maxTrades: r.maxTrades,
            dailyPnl: r.dailyPnl,
            peakDailyPnl: Math.max(r.dailyPnl, 0),
            noTradeMode: r.noTradeMode,
            lockState: r.locked ? { id: '', reason: r.lockReason ?? '', reasonDetail: '', lockedAt: 0, lockedUntil: r.lockedUntil ?? 0 } : null,
            disciplineScore: r.disciplineScore,
            enforcementMode: 'strict',
          })
        })
        .catch(() => { /* background may not be ready yet */ })
    }

    refresh()
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [setSession])

  const isManualMode = adapter.name === 'generic'

  return (
    <>
      {/* Persistent HUD — always visible */}
      <SessionHUD isManualMode={isManualMode} />

      {/* Pre-Trade Gate modal */}
      {overlay.gateVisible && (
        <PreTradeGate
          intentId={overlay.gateIntentId!}
          direction={overlay.gateDirection!}
          symbol={overlay.gateSymbol}
        />
      )}

      {/* Platform lock overlay — full screen, highest priority */}
      {overlay.lockVisible && overlay.lockState && (
        <LockOverlay lockState={overlay.lockState} />
      )}

      {pinned && (
        <CompanionPanel
          adapter={adapter}
          collapsed={collapsed}
          onCollapse={next => {
            setCollapsed(next)
            sendToBackground({ type: 'TC_COMPANION_COLLAPSE', payload: { collapsed: next } }).catch(() => {})
          }}
          onUnpin={() => {
            setPinned(false)
            sendToBackground({ type: 'TC_UNPIN_TAB' }).catch(() => {})
          }}
        />
      )}
    </>
  )
}
