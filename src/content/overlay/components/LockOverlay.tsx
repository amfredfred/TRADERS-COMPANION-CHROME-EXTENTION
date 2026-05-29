import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { LockState } from '../../../shared/lib/storage'
import { Button, Card, AlertBox } from '../../../shared/ui'

const OVERRIDE_PHRASE = 'I am choosing to override my trading rules'

interface Props {
  lockState: LockState
}

export default function LockOverlay({ lockState }: Props) {
  const releaseLock = useStore(s => s.releaseLock)

  const [secondsLeft,   setSecondsLeft]   = useState(() => Math.max(0, Math.ceil((lockState.lockedUntil - Date.now()) / 1000)))
  const [showOverride,  setShowOverride]  = useState(false)
  const [overrideInput, setOverrideInput] = useState('')
  const [overrideError, setOverrideError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  function handleOverrideConfirm() {
    if (overrideInput !== OVERRIDE_PHRASE) {
      setOverrideError(true)
      setTimeout(() => setOverrideError(false), 1500)
      return
    }
    sendToBackground({ type: 'TC_LOCK_RELEASE', payload: { lockId: lockState.id, reason: 'Manual override' } }).catch(console.error)
    releaseLock()
  }

  function handlePositionManagement() {
    sendToBackground({ type: 'TC_LOCK_RELEASE', payload: { positionMgmtOnly: true } }).catch(console.error)
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center p-6 pointer-events-auto"
      style={{
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        background: 'rgba(3,5,12,0.90)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <section className="w-[500px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-tc-red/35 bg-tc-bg shadow-tc-overlay">

        {/* Header */}
        <header className="border-b border-tc-red/20 bg-tc-red/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-tc-red/35 bg-tc-red/15">
              <svg className="h-4 w-4 text-[#fca5a5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#fca5a5]">New entries blocked</div>
              <div className="mt-0.5 text-[12px] text-tc-sub">{lockState.reasonDetail || lockState.reason}</div>
            </div>
          </div>
        </header>

        <div className="px-5 py-5 space-y-4">

          {/* Why TC stopped this */}
          <Card padding="md" className="bg-tc-surface border-tc-border">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-tc-muted">Why TC stopped this</div>
            <p className="text-[13px] leading-relaxed text-tc-sub">{getLockMessage(lockState.reason)}</p>
          </Card>

          {/* Countdown */}
          <div className="text-center py-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tc-muted">Unlock countdown</div>
            <div className="font-mono text-[56px] font-black leading-none tracking-tight text-tc-text tabular-nums">
              {mm}:{ss}
            </div>
          </div>

          {/* Position management */}
          <AlertBox
            tone="success"
            title="Risk management remains available"
            body="TC is blocking new entries only. You can still close, reduce, or move to breakeven on existing positions."
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePositionManagement}
              className="mt-2 border-tc-green/30 text-tc-green hover:border-tc-green/50 hover:bg-tc-green/10"
            >
              Manage existing positions
            </Button>
          </AlertBox>

          {/* Override section */}
          {!showOverride ? (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => { setShowOverride(true); setTimeout(() => inputRef.current?.focus(), 80) }}
              className="text-tc-faint hover:text-tc-muted border border-tc-border"
            >
              Override — I understand the consequences
            </Button>
          ) : (
            <Card padding="md" tone="danger" className="space-y-3">
              <div className="text-[12px] font-semibold text-[#fca5a5]">
                Type the phrase exactly to confirm override:
              </div>
              <div className="rounded-lg bg-tc-bg px-3 py-2 font-mono text-[11px] text-tc-sub select-none">
                {OVERRIDE_PHRASE}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={overrideInput}
                onChange={e => setOverrideInput(e.target.value)}
                onPaste={e => e.preventDefault()}
                placeholder="Type phrase above exactly"
                className={[
                  'w-full rounded-[10px] border bg-tc-surface px-3 py-2 text-[13px] text-tc-text placeholder:text-tc-faint focus:outline-none transition-colors',
                  overrideError ? 'border-tc-red' : 'border-tc-border focus:border-tc-red/50',
                ].join(' ')}
              />
              {overrideError && <p className="text-[11px] text-[#fca5a5]">Phrase does not match.</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => { setShowOverride(false); setOverrideInput('') }}
                >
                  Keep Lock
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  disabled={overrideInput.length < 10}
                  onClick={handleOverrideConfirm}
                >
                  Confirm Override
                </Button>
              </div>
            </Card>
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
