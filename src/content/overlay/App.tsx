import { useEffect } from 'react'
import { useStore } from '../../shared/state/store'
import type { PlatformAdapter } from '../adapters/types'
import type { LockActivatePayload } from '../../shared/lib/messages'
import { getLiveSession } from '../../shared/lib/storage'

import TradeReview from './components/TradeReview'
import LockOverlay from './components/LockOverlay'

interface Props {
  adapter: PlatformAdapter
}

export default function App({ adapter: _adapter }: Props) {
  const { overlay, setSession, openGate, activateLock, releaseLock } = useStore()

  useEffect(() => {
    getLiveSession().then(s => { if (s) setSession(s) })
  }, [setSession])

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

  return (
    <>
      {overlay.gateVisible && (
        <TradeReview
          intentId={overlay.gateIntentId!}
          direction={overlay.gateDirection!}
          symbol={overlay.gateSymbol}
        />
      )}

      {overlay.lockVisible && overlay.lockState && (
        <LockOverlay lockState={overlay.lockState} />
      )}
    </>
  )
}
