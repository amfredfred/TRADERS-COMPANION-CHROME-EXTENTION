import { useEffect, useRef, useState } from 'react'
import { AlertBox, Badge, Button, Card, Modal, StatRow } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { LockState } from '../../../shared/lib/storage'

const OVERRIDE_PHRASE = 'I am choosing to override my trading rules'

interface Props {
  lockState: LockState
}

export default function LockOverlay({ lockState }: Props) {
  const releaseLock = useStore(s => s.releaseLock)
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((lockState.lockedUntil - Date.now()) / 1000)))
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

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const seconds = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Modal className="max-w-[560px]" >
      <div className="border-b border-tc-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="danger">Platform Lock</Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-tc-text">New entries are blocked</h1>
            <p className="mt-2 text-sm leading-6 text-tc-muted">{getLockMessage(lockState.reason)}</p>
          </div>
          <div className="rounded-2xl border border-tc-border bg-tc-surface px-4 py-3 text-center">
            <div className="text-xs text-tc-muted">Unlocks in</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-tc-text">{minutes}:{seconds}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <Card padding="none">
          <StatRow label="Blocked" value="New orders and new entries" tone="danger" />
          <StatRow label="Allowed" value="Close, reduce, or protect positions" tone="success" />
          <StatRow label="Reason" value={lockState.reasonDetail || lockState.reason} />
        </Card>

        <AlertBox tone="success" title="Risk management remains available" body="TC is firm about new entries, but it should never trap you in an existing position.">
          <Button variant="secondary" onClick={handlePositionManagement}>Manage Existing Positions</Button>
        </AlertBox>

        {!showOverride ? (
          <Button variant="ghost" fullWidth onClick={() => {
            setShowOverride(true)
            setTimeout(() => inputRef.current?.focus(), 100)
          }}>
            Override with confirmation phrase
          </Button>
        ) : (
          <Card tone="danger" className="space-y-3">
            <div>
              <div className="text-sm font-semibold text-tc-red">Manual override</div>
              <p className="mt-1 text-xs leading-5 text-tc-sub">Type the phrase exactly to release the lock early.</p>
            </div>
            <div className="rounded-xl border border-tc-border bg-tc-bg px-3 py-2 font-mono text-xs text-tc-text">{OVERRIDE_PHRASE}</div>
            <input
              ref={inputRef}
              value={overrideInput}
              onChange={e => setOverrideInput(e.target.value)}
              onPaste={e => e.preventDefault()}
              placeholder="Type the phrase exactly"
              className="h-11 w-full rounded-xl border border-tc-border bg-tc-surface px-3 text-sm text-tc-text placeholder:text-tc-faint focus:border-tc-red/60 focus:outline-none"
            />
            {overrideError && <p className="text-xs text-tc-red">Phrase does not match.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => { setShowOverride(false); setOverrideInput('') }}>Keep Lock</Button>
              <Button variant="danger" onClick={handleOverrideConfirm}>Confirm Override</Button>
            </div>
          </Card>
        )}
      </div>
    </Modal>
  )
}

function getLockMessage(reason: string): string {
  switch (reason) {
    case 'revenge_trade':
      return 'A new trade was attempted too soon after a loss.'
    case 'daily_budget':
      return 'The daily loss budget for this session has been reached.'
    case 'max_trades':
      return 'The maximum number of trades for today has been reached.'
    case 'impulse':
      return 'This trade was marked as an impulse trade.'
    case 'rule_broken':
      return 'The pre-trade gate recorded a rule violation.'
    default:
      return 'Trading is paused to protect the account and reset decision quality.'
  }
}
