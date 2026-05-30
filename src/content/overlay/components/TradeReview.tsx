import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Card, Input, SectionHeader, SidePanel, Textarea } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'
import { sendToBackground, TC_TRADE_REVIEW_PORT } from '../../../shared/lib/messages'
import type { GateAnsweredPayload } from '../../../shared/lib/messages'
import type { AIStreamChunk } from '../../../shared/ai/types'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
}

type Phase = 'loading' | 'streaming' | 'ready' | 'error'

export default function TradeReview({ intentId, direction, symbol }: Props) {
  const closeGate = useStore(s => s.closeGate)
  const session = useStore(s => s.session)

  const portRef = useRef<chrome.runtime.Port | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [activity, setActivity] = useState('Connecting…')
  const [reviewText, setReviewText] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [invalidation, setInvalidation] = useState('')
  const [intendedRiskInput, setIntendedRiskInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Execution guard ──────────────────────────────────────────────────────────
  // Only real reasons to block: daily budget exhausted or submission in flight.
  const riskLimit = session?.riskPerTrade ?? 0
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : Infinity
  const dailyBudgetExhausted = session !== null && session.dailyBudget > 0 && dailyBudgetLeft <= 0

  // Button is always enabled once the AI review starts (or errors).
  // Advisory content never blocks — only budget exhausted or in-flight submission does.
  const canProceed = !submitting && !dailyBudgetExhausted

  // ── Advisory session checklist ─────────────────────────────────────────────
  // These show warnings but do NOT gate the Proceed button.
  const checks: Array<{ label: string; pass: boolean | null; detail: string }> = [
    {
      label: 'Trade slots',
      pass: session ? session.tradesOpenedToday < session.maxTrades : null,
      detail: session ? `${session.tradesOpenedToday} / ${session.maxTrades} used` : 'No session',
    },
    {
      label: 'Daily budget',
      pass: session ? dailyBudgetLeft > 0 : null,
      detail: session ? `$${dailyBudgetLeft.toFixed(2)} remaining` : 'No session',
    },
    {
      label: 'Account unlocked',
      pass: session ? !session.lockState : null,
      detail: session?.lockState ? 'Platform is locked' : 'Clear',
    },
    {
      label: 'No Trade Mode',
      pass: session ? !session.noTradeMode : null,
      detail: session?.noTradeMode ? 'No Trade Mode is ON' : 'Off',
    },
  ]

  // ── Port lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    const port = chrome.runtime.connect({ name: TC_TRADE_REVIEW_PORT })
    portRef.current = port

    port.onMessage.addListener((msg: AIStreamChunk) => {
      if (msg.type === 'activity') {
        setActivity(msg.activity ?? '')
        setPhase(prev => (prev === 'streaming' || prev === 'ready' ? prev : 'loading'))
      } else if (msg.type === 'screenshot') {
        setScreenshotDataUrl(msg.screenshotDataUrl ?? null)
      } else if (msg.type === 'delta') {
        setPhase('streaming')
        setReviewText(prev => prev + (msg.delta ?? ''))
      } else if (msg.type === 'done') {
        setPhase('ready')
      } else if (msg.type === 'error') {
        // Review error — show inline, but still allow trade
        setPhase('error')
      }
    })

    port.onDisconnect.addListener(() => {
      portRef.current = null
    })

    port.postMessage({ type: 'TC_TRADE_REVIEW_START', payload: { intentId, direction, symbol } })

    return () => {
      try { port.postMessage({ type: 'TC_TRADE_REVIEW_CANCEL' }) } catch { /* already disconnected */ }
      try { port.disconnect() } catch { /* already disconnected */ }
      portRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Take trade ───────────────────────────────────────────────────────────────
  async function handleProceed() {
    if (!canProceed) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await sendToBackground({
        type: 'TC_GATE_ANSWERED',
        payload: {
          tradeIntentId: intentId,
          answers: {
            setupDescription: `Trade review: ${direction} ${symbol ?? ''} — execution confirmed by trader.`,
            stopLoss: invalidation.trim() || 'Not specified',
            invalidation: invalidation.trim() || 'Not specified',
            intendedRisk: parseFloat(intendedRiskInput) || riskLimit || 0,
            rulesFollowed: true,
            setupGrade: 'A',
            checklistItems: {},
          },
        } satisfies GateAnsweredPayload,
      })
      closeGate()
    } catch {
      setSubmitError('Could not submit. Try again.')
      setSubmitting(false)
    }
  }

  const dirLabel = direction === 'long' ? 'Long / Buy' : 'Short / Sell'
  const enforcementMode = session?.enforcementMode ?? 'training'
  const badgeTone = enforcementMode === 'training' ? 'warning' : 'success'
  const badgeLabel =
    enforcementMode === 'training' ? 'Training' : enforcementMode === 'prop_firm' ? 'Prop Firm' : 'Strict'

  return (
    <div
      className="fixed inset-0 z-[2147483645] pointer-events-auto"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Backdrop — clicking it cancels */}
      <div
        className="absolute inset-y-0 left-0 right-[420px] bg-black/60 backdrop-blur-[3px]"
        onClick={closeGate}
      />

      <SidePanel className="absolute inset-y-0 right-0 flex flex-col" width="420px">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="border-b border-tc-border p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">
                TC
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-tc-text">Trade Review</h1>
                <p className="text-sm text-tc-muted">
                  {dirLabel}{symbol ? ` · ${symbol}` : ''}
                </p>
              </div>
            </div>
            <Badge tone={badgeTone}>{badgeLabel}</Badge>
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────────────────── */}
        <main className="flex-1 space-y-4 overflow-y-auto p-6 tc-scrollbar">

          {/* Chart screenshot thumbnail */}
          {screenshotDataUrl && (
            <div className="overflow-hidden rounded-xl border border-tc-border">
              <img src={screenshotDataUrl} alt="Captured chart" className="w-full object-contain" />
            </div>
          )}

          {/* ── AI Review card — advisory only ── */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-tc-muted">
                AI Review
              </span>
              <span className="rounded-full bg-tc-surface px-2 py-0.5 text-[10px] text-tc-faint border border-tc-border">
                Advisory only
              </span>
            </div>

            {phase === 'loading' && (
              <div className="flex items-center gap-3 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-tc-green" />
                <span className="text-sm text-tc-muted">{activity}</span>
              </div>
            )}

            {(phase === 'streaming' || phase === 'ready') && (
              <div className="space-y-1.5">
                <ReviewMarkdown text={reviewText} />
                {phase === 'streaming' && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-tc-green align-middle" />
                )}
              </div>
            )}

            {phase === 'error' && (
              <p className="text-sm text-tc-muted">
                Review unavailable. You may still take the trade.
              </p>
            )}
          </Card>

          {/* ── Advisory session checklist — warnings, not gates ── */}
          <section>
            <SectionHeader title="Session Status" sub="Advisory — does not block execution." />
            <div className="mt-3 space-y-2">
              {checks.map(check => (
                <div key={check.label} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckIcon pass={check.pass} />
                    <span className="text-sm text-tc-text">{check.label}</span>
                  </div>
                  <span className={`text-xs ${check.pass === false ? 'text-tc-red' : 'text-tc-muted'}`}>
                    {check.detail}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Optional trade notes — improve tracking, never required ── */}
          <section className="space-y-4">
            <SectionHeader
              title="Trade Notes"
              sub="Optional — helps TC track your discipline over time."
            />
            <Textarea
              label="Invalidation rule"
              value={invalidation}
              onChange={e => setInvalidation(e.target.value)}
              placeholder={
                direction === 'long'
                  ? 'e.g. M5 close below sweep low'
                  : 'e.g. M5 close above sweep high'
              }
            />
            <Input
              label="Intended risk ($)"
              type="number"
              min="0"
              step="0.01"
              value={intendedRiskInput}
              onChange={e => setIntendedRiskInput(e.target.value)}
              placeholder={riskLimit > 0 ? `Max $${riskLimit.toFixed(2)}` : 'Dollar amount'}
            />
          </section>

          {/* ── Daily budget exhausted — the one real hard block ── */}
          {dailyBudgetExhausted && (
            <Card tone="danger" padding="sm">
              <p className="text-sm font-semibold text-tc-red">Daily budget exhausted</p>
              <p className="mt-1 text-xs text-tc-muted">
                The daily loss budget of ${session!.dailyBudget.toFixed(2)} has been reached.
                New entries are blocked to protect the account.
              </p>
            </Card>
          )}

          {/* Submission error */}
          {submitError && (
            <Card tone="danger" padding="sm" className="text-sm text-tc-red">
              {submitError}
            </Card>
          )}
        </main>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="space-y-3 border-t border-tc-border p-6">
          {/* Advisory disclaimer */}
          <p className="text-center text-[11px] text-tc-faint">
            Execution is always your decision. TC is a companion, not a gatekeeper.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={closeGate} fullWidth>
              Cancel Trade
            </Button>
            <Button
              variant="primary"
              onClick={handleProceed}
              loading={submitting}
              disabled={!canProceed}
              fullWidth
            >
              {dailyBudgetExhausted ? 'Budget Exhausted' : 'Take Trade'}
            </Button>
          </div>
        </footer>

      </SidePanel>
    </div>
  )
}

// ── Internal components ────────────────────────────────────────────────────────

function CheckIcon({ pass }: { pass: boolean | null }) {
  if (pass === null) {
    return <span className="inline-block h-3.5 w-3.5 rounded-full border border-tc-border" />
  }
  if (pass) {
    return <span className="text-[11px] font-bold text-tc-green">✓</span>
  }
  // Failing checks show a warning icon — they are advisory, not blocking
  return <span className="text-[11px] font-bold text-tc-yellow">⚠</span>
}

/**
 * Renders the AI review text, converting **Label:** lines into styled sections.
 * Handles partial (streaming) text gracefully.
 */
function ReviewMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return null
        // Match **Label:** rest
        const match = line.match(/^\*\*([^*]+)\*\*(.*)$/)
        if (match) {
          return (
            <div key={i} className="text-sm leading-relaxed">
              <span className="font-semibold text-tc-text">{match[1]}</span>
              <span className="text-tc-muted">{match[2]}</span>
            </div>
          )
        }
        return (
          <div key={i} className="text-sm leading-relaxed text-tc-muted">
            {line}
          </div>
        )
      })}
    </div>
  )
}
