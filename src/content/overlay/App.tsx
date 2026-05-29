import { useEffect, useState } from 'react'
import { useStore } from '../../shared/state/store'
import type { PlatformAdapter } from '../adapters/types'
import type { LockActivatePayload, SessionStateResponse } from '../../shared/lib/messages'
import { sendToBackground } from '../../shared/lib/messages'
import { getLiveSession } from '../../shared/lib/storage'

import PreTradeGate from './components/PreTradeGate'
import LockOverlay from './components/LockOverlay'
import CompanionPanel from './components/CompanionPanel'

interface Props {
  adapter: PlatformAdapter
}

export default function App({ adapter: _adapter }: Props) {
  const { overlay, setSession, openGate, activateLock, releaseLock } = useStore()
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [fallbackCollapsed, setFallbackCollapsed] = useState(false)

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

    function onDockedSidecarOpen(e: Event) {
      const payload = (e as CustomEvent<{ collapsed?: boolean }>).detail
      setFallbackOpen(true)
      setFallbackCollapsed(!!payload?.collapsed)
    }

    function onCompanionUnpinned() {
      setFallbackOpen(false)
    }

    function onCompanionCollapse(e: Event) {
      const payload = (e as CustomEvent<{ collapsed?: boolean }>).detail
      setFallbackOpen(true)
      setFallbackCollapsed(!!payload?.collapsed)
    }

    document.addEventListener('tc:gate-open',     onGateOpen)
    document.addEventListener('tc:gate-blocked',  onGateBlocked)
    document.addEventListener('tc:lock-activate', onLockActivate)
    document.addEventListener('tc:lock-release',  onLockRelease)
    document.addEventListener('tc:docked-sidecar-open', onDockedSidecarOpen)
    document.addEventListener('tc:companion-unpinned', onCompanionUnpinned)
    document.addEventListener('tc:companion-collapse', onCompanionCollapse)

    return () => {
      document.removeEventListener('tc:gate-open',     onGateOpen)
      document.removeEventListener('tc:gate-blocked',  onGateBlocked)
      document.removeEventListener('tc:lock-activate', onLockActivate)
      document.removeEventListener('tc:lock-release',  onLockRelease)
      document.removeEventListener('tc:docked-sidecar-open', onDockedSidecarOpen)
      document.removeEventListener('tc:companion-unpinned', onCompanionUnpinned)
      document.removeEventListener('tc:companion-collapse', onCompanionCollapse)
    }
  }, [openGate, activateLock, releaseLock])

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
            lockState: r.locked
              ? { id: '', reason: r.lockReason ?? '', reasonDetail: '', lockedAt: 0, lockedUntil: r.lockedUntil ?? 0 }
              : null,
            disciplineScore: r.disciplineScore,
            enforcementMode: 'strict',
          })
        })
        .catch(() => {})
    }

    refresh()
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [setSession])

  return (
    <>
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

      {fallbackOpen && (
        <CompanionPanel
          adapter={_adapter}
          collapsed={fallbackCollapsed}
          onCollapse={collapsed => {
            setFallbackCollapsed(collapsed)
            sendToBackground({ type: 'TC_COMPANION_COLLAPSE', payload: { collapsed } }).catch(() => {})
          }}
          onUnpin={() => {
            setFallbackOpen(false)
            sendToBackground({ type: 'TC_UNPIN_TAB' }).catch(() => {})
          }}
        />
      )}
    </>
  )
}
