import { useEffect, useRef, useState } from 'react'
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

  useEffect(() => {
    if (secondsLeft <= 0) {
      releaseLock()
      return
    }

    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          releaseLock()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsLeft, releaseLock])

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

  function handlePositionManagement() {
    sendToBackground({ type: 'TC_LOCK_RELEASE', payload: { positionMgmtOnly: true } })
      .catch(console.error)
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center p-5 pointer-events-auto"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(2,6,23,0.88)' }}
    >
      <section className="w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-[#ef4444]/45 bg-[#0b101a]/95 shadow-[0_24px_90px_rgba(0,0,0,0.8)]">
        <header className="border-b border-[#ef4444]/30 bg-[#ef4444]/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#ef4444]/50 bg-[#ef4444]/15 text-[11px] font-black text-[#fca5a5]">
              LOCK
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#fca5a5]">New entries blocked</div>
              <div className="mt-0.5 text-xs text-[#cbd5e1]">{lockState.reasonDetail || lockState.reason}</div>
            </div>
          </div>
        </header>

        <div className="px-6 py-6">
          <div className="mb-5 rounded-md border border-[#253047] bg-[#0f1320]/90 px-4 py-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">Why TC stopped this</div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-[#e2e8f0]">{getLockMessage(lockState.reason)}</p>
          </div>

          <div className="mb-5 text-center">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">Unlock countdown</div>
            <div className="font-mono text-6xl font-black tracking-tight text-[#f8fafc]">{minutes}:{seconds}</div>
          </div>

          <div className="mb-5 rounded-md border border-[#22c55e]/25 bg-[#22c55e]/10 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#22c55e]">Risk management remains available</div>
            <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
              TC is blocking new entries only. You can still close, reduce, or protect existing positions.
            </p>
            <button
              onClick={handlePositionManagement}
              className="mt-3 rounded-md border border-[#22c55e]/40 px-3 py-2 text-xs font-bold text-[#22c55e] transition hover:bg-[#22c55e]/10"
            >
              Manage Existing Positions
            </button>
          </div>

          {!showOverride ? (
            <button
              onClick={() => {
                setShowOverride(true)
                setTimeout(() => inputRef.current?.focus(), 100)
              }}
              className="w-full rounded-md border border-[#253047] bg-[#111827] py-2.5 text-xs font-semibold text-[#94a3b8] transition hover:border-[#475569] hover:text-[#e2e8f0]"
            >
              Override - I understand the consequences
            </button>
          ) : (
            <div className="rounded-md border border-[#ef4444]/35 bg-[#ef4444]/10 px-4 py-4">
              <div className="text-xs font-bold text-[#fca5a5]">Override requires a typed confirmation.</div>
              <div className="mt-2 rounded bg-[#0f1320] px-2 py-1.5 font-mono text-[11px] text-[#e2e8f0]">
                {OVERRIDE_PHRASE}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={overrideInput}
                onChange={e => setOverrideInput(e.target.value)}
                onPaste={handlePaste}
                placeholder="Type the phrase exactly"
                className={`mt-3 w-full rounded-md border bg-[#111827] px-3 py-2 text-xs text-[#e2e8f0] placeholder:text-[#64748b] focus:outline-none ${overrideError ? 'border-[#ef4444]' : 'border-[#253047] focus:border-[#ef4444]/70'}`}
              />
              {overrideError && <p className="mt-2 text-xs text-[#fca5a5]">Phrase does not match.</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowOverride(false)
                    setOverrideInput('')
                  }}
                  className="rounded-md border border-[#253047] py-2 text-xs font-semibold text-[#94a3b8] transition hover:border-[#475569] hover:text-[#e2e8f0]"
                >
                  Keep Lock
                </button>
                <button
                  onClick={handleOverrideConfirm}
                  disabled={overrideInput.length < 10}
                  className="rounded-md bg-[#ef4444] py-2 text-xs font-bold text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Override
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function getLockMessage(reason: string): string {
  switch (reason) {
    case 'revenge_trade':
      return 'Your last trade closed at a loss and this new order came too soon after it. That is the exact moment this extension is built to interrupt.'
    case 'daily_budget':
      return 'You have reached the daily loss budget you set for this session. New entries are paused to protect the account.'
    case 'max_trades':
      return 'You reached your maximum trades for today. Taking another trade now would override your own session limit.'
    case 'impulse':
      return 'You marked this as an impulse trade. TC is honoring that honesty by blocking the order.'
    case 'rule_broken':
      return 'You reported that this trade breaks your rules. New entries are paused so the rule breach does not become a position.'
    default:
      return 'Trading is paused to protect the account and give you space before the next decision.'
  }
}
