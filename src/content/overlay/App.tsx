import { useEffect } from 'react'
import { useStore } from '../../shared/state/store'
import type { PlatformAdapter } from '../adapters/types'
import type { LockActivatePayload, SessionStateResponse } from '../../shared/lib/messages'
import { sendToBackground } from '../../shared/lib/messages'
import { getLiveSession } from '../../shared/lib/storage'

import SessionHUD from './components/SessionHUD'
import PreTradeGate from './components/PreTradeGate'
import LockOverlay from './components/LockOverlay'

interface Props {
  adapter: PlatformAdapter
}

export default function App({ adapter }: Props) {
  const { overlay, setSession, openGate, activateLock, releaseLock } = useStore()

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

    document.addEventListener('tc:gate-open',     onGateOpen)
    document.addEventListener('tc:gate-blocked',  onGateBlocked)
    document.addEventListener('tc:lock-activate', onLockActivate)
    document.addEventListener('tc:lock-release',  onLockRelease)

    return () => {
      document.removeEventListener('tc:gate-open',     onGateOpen)
      document.removeEventListener('tc:gate-blocked',  onGateBlocked)
      document.removeEventListener('tc:lock-activate', onLockActivate)
      document.removeEventListener('tc:lock-release',  onLockRelease)
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
    </>
  )
}
