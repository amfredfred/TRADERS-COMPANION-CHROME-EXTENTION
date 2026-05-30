import { useEffect, useState } from 'react'
import { useStore } from '../../shared/state/store'
import type { PlatformAdapter } from '../adapters/types'
import type { LockActivatePayload } from '../../shared/lib/messages'
import { getLiveSession } from '../../shared/lib/storage'

import TradeAIPanel from './components/TradeAIPanel'
import LockOverlay from './components/LockOverlay'

interface Props {
  adapter: PlatformAdapter
}

interface BlockedNotice {
  reason: string
  message: string
}

export default function App({ adapter: _adapter }: Props) {
  const { overlay, setSession, openGate, closeGate, activateLock, releaseLock } = useStore()
  const [blockedNotice, setBlockedNotice] = useState<BlockedNotice | null>(null)

  useEffect(() => {
    getLiveSession().then(s => { if (s) setSession(s) })
  }, [setSession])

  useEffect(() => {
    function onGateOpen(e: Event) {
      const { intentId, direction, symbol } = (e as CustomEvent).detail ?? {}
      if (intentId) openGate(intentId, direction, symbol ?? null)
    }

    function onGateBlocked(e: Event) {
      // Deprecated path — surface as a blocked notice for visibility
      const { reason } = (e as CustomEvent).detail ?? {}
      console.warn('[TC] Gate blocked:', reason)
    }

    function onExecutionBlocked(e: Event) {
      const { reason, message } = (e as CustomEvent<BlockedNotice>).detail ?? {}
      setBlockedNotice({ reason, message })
      // Auto-dismiss after 4 s
      setTimeout(() => setBlockedNotice(null), 4000)
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

    document.addEventListener('tc:gate-open',          onGateOpen)
    document.addEventListener('tc:gate-blocked',       onGateBlocked)
    document.addEventListener('tc:execution-blocked',  onExecutionBlocked)
    document.addEventListener('tc:lock-activate',      onLockActivate)
    document.addEventListener('tc:lock-release',       onLockRelease)

    return () => {
      document.removeEventListener('tc:gate-open',          onGateOpen)
      document.removeEventListener('tc:gate-blocked',       onGateBlocked)
      document.removeEventListener('tc:execution-blocked',  onExecutionBlocked)
      document.removeEventListener('tc:lock-activate',      onLockActivate)
      document.removeEventListener('tc:lock-release',       onLockRelease)
    }
  }, [openGate, activateLock, releaseLock])

  return (
    <>
      {overlay.gateVisible && (
        <TradeAIPanel
          intentId={overlay.gateIntentId!}
          direction={overlay.gateDirection!}
          symbol={overlay.gateSymbol}
          onClose={closeGate}
        />
      )}

      {overlay.lockVisible && overlay.lockState && (
        <LockOverlay lockState={overlay.lockState} />
      )}

      {blockedNotice && (
        <ExecutionBlockedToast
          message={blockedNotice.message}
          onDismiss={() => setBlockedNotice(null)}
        />
      )}
    </>
  )
}

// ── Execution blocked toast ───────────────────────────────────────────────────
// Shown briefly when a real execution guard fires (budget, lock, no-trade-mode).
// Positioned bottom-left so it doesn't overlap the advisory panel (bottom-right).

function ExecutionBlockedToast({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        width: 'min(340px, calc(100vw - 32px))',
        zIndex: 2147483645,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        className="flex items-start gap-3 rounded-xl border border-tc-red/40 bg-tc-panel px-4 py-3"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
      >
        <span className="mt-0.5 text-sm font-bold text-tc-red">⊘</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-tc-red">Execution blocked</p>
          <p className="mt-0.5 text-xs leading-relaxed text-tc-muted">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 text-xs text-tc-faint hover:text-tc-muted"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
