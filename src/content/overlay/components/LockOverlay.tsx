import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { LockState } from '../../../shared/lib/storage'

const OVERRIDE_PHRASE = 'I am choosing to override my trading rules'

interface Props {
  lockState: LockState
}

export default function LockOverlay({ lockState }: Props) {
  const releaseLock = useStore(s => s.releaseLock)

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((lockState.lockedUntil - Date.now()) / 1000))
  )
  const [showOverride, setShowOverride] = useState(false)
  const [overrideInput, setOverrideInput] = useState('')
  const [overrideError, setOverrideError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Countdown
  useEffect(() => {
    if (secondsLeft <= 0) { releaseLock(); return }
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(timer); releaseLock(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [secondsLeft, releaseLock])

  // Disable paste in override input — must type the phrase manually
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
  }

  function handleOverrideConfirm() {
    if (overrideInput !== OVERRIDE_PHRASE) {
      setOverrideError(true)
      setTimeout(() => setOverrideError(false), 1500)
      return
    }
    sendToBackground({
      type: 'TC_LOCK_RELEASE',
      payload: { lockId: lockState.id, reason: 'Manual override' },
    }).catch(console.error)
    releaseLock()
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center pointer-events-auto"
      style={{ backdropFilter: 'blur(4px)', background: 'rgba(10,12,18,0.92)' }}
    >
      <div className="w-[480px] bg-[#0f1320] border border-[#ef4444]/40 rounded-xl shadow-[0_0_80px_rgba(239,68,68,0.2)] overflow-hidden">

        {/* Header */}
        <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/30 px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#ef4444]/20 flex items-center justify-center">
            <span className="text-[#ef4444] text-base">🔴</span>
          </div>
          <div>
            <div className="text-[#ef4444] text-sm font-bold uppercase tracking-wider">Rule Broken</div>
            <div className="text-[#94a3b8] text-xs mt-0.5">{lockState.reasonDetail || lockState.reason}</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 text-center space-y-5">
          <p className="text-[#e2e8f0] text-base leading-relaxed">
            {getLockMessage(lockState.reason)}
          </p>

          {/* Countdown */}
          <div>
            <div className="text-[#64748b] text-xs uppercase tracking-widest mb-2">Platform unlocks in</div>
            <div className="text-6xl font-mono font-bold text-[#e2e8f0] tracking-tight">
              {minutes}:{seconds}
            </div>
          </div>

          <p className="text-[#94a3b8] text-sm">
            Step away from the screen.<br />Come back when the timer is done.
          </p>

          {/* Emergency position management */}
          <div className="border border-[#1e2538] rounded-lg px-4 py-3 text-left">
            <div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-1.5">Risk management is always allowed</div>
            <button
              onClick={() => {
                // Allow position management only — briefly dims the overlay
                sendToBackground({ type: 'TC_LOCK_RELEASE', payload: { positionMgmtOnly: true } })
                  .catch(console.error)
                // This does NOT call releaseLock() — lock persists for new orders
              }}
              className="text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors font-medium"
            >
              → Manage existing positions
            </button>
          </div>

          {/* Override section */}
          {!showOverride ? (
            <button
              onClick={() => { setShowOverride(true); setTimeout(() => inputRef.current?.focus(), 100) }}
              className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors underline"
            >
              Override — I understand the consequences
            </button>
          ) : (
            <div className="border border-[#ef4444]/30 bg-[#ef4444]/5 rounded-lg px-4 py-4 text-left space-y-3">
              <p className="text-[#ef4444] text-xs font-semibold">Are you sure you want to override your own rules?</p>
              <p className="text-[#94a3b8] text-xs">Type exactly to confirm:</p>
              <p className="text-[#e2e8f0] text-xs font-mono bg-[#141928] rounded px-2 py-1.5">
                "{OVERRIDE_PHRASE}"
              </p>
              <input
                ref={inputRef}
                type="text"
                value={overrideInput}
                onChange={e => setOverrideInput(e.target.value)}
                onPaste={handlePaste}
                placeholder="Type the phrase exactly…"
                className={`
                  w-full bg-[#141928] border rounded text-[#e2e8f0] text-xs px-3 py-2
                  placeholder:text-[#64748b] focus:outline-none
                  ${overrideError ? 'border-[#ef4444]' : 'border-[#1e2538] focus:border-[#ef4444]/60'}
                `}
              />
              {overrideError && (
                <p className="text-[#ef4444] text-xs">Phrase does not match. Type it exactly.</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowOverride(false); setOverrideInput('') }}
                  className="flex-1 py-1.5 rounded border border-[#1e2538] text-[#64748b] text-xs hover:text-[#94a3b8] transition-colors"
                >
                  Cancel — keep lock
                </button>
                <button
                  onClick={handleOverrideConfirm}
                  disabled={overrideInput.length < 10}
                  className="flex-1 py-1.5 rounded bg-[#ef4444] text-white text-xs font-semibold hover:bg-[#dc2626] disabled:opacity-40 transition-colors"
                >
                  Confirm override
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getLockMessage(reason: string): string {
  switch (reason) {
    case 'revenge_trade':
      return 'You entered a trade too soon after a loss.\nThis is a revenge trade. You knew that when you placed it.'
    case 'daily_budget':
      return 'You have hit your daily loss limit.\nProtecting your account is the right call here.'
    case 'max_trades':
      return 'You have reached your maximum trades for today.\nYou set this limit for a reason.'
    case 'impulse':
      return 'You marked this as an impulse trade.\nYou know your own rules better than anyone.'
    case 'rule_broken':
      return 'You reported breaking a rule.\nHonesty with yourself is the first step.'
    default:
      return 'Trading is paused to protect your account.\nCome back with a clear head.'
  }
}
