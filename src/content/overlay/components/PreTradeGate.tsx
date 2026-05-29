import { useMemo, useState } from 'react'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { SetupGrade, PreTradeGateAnswers } from '../../../shared/types/trade'
import type { GateAnsweredPayload } from '../../../shared/lib/messages'
import { Button, Card, Badge, Textarea, ProgressBar } from '../../../shared/ui'

interface Props {
  intentId:  string
  direction: 'long' | 'short'
  symbol:    string | null
}

const DEFAULT_CHECKLIST = [
  'HTF bias confirmed',
  'Liquidity sweep confirmed',
  'Displacement candle visible',
  'Retest completed',
  'Stop placed beyond invalidation',
]

const GRADES: SetupGrade[] = ['A', 'B', 'C', 'Impulse']

export default function PreTradeGate({ intentId, direction, symbol }: Props) {
  const closeGate = useStore(s => s.closeGate)
  const session   = useStore(s => s.session)
  const playbooks = useStore(s => s.playbooks)

  const activePlaybook = useMemo(
    () => playbooks.find(p => p.active && (!symbol || p.allowedSymbols.length === 0 || p.allowedSymbols.includes(symbol)))
      ?? playbooks.find(p => p.active),
    [playbooks, symbol],
  )

  const checklist    = activePlaybook?.checklistItems?.length
    ? activePlaybook.checklistItems.map(i => i.label)
    : DEFAULT_CHECKLIST

  const [setup]        = useState(activePlaybook?.name ?? 'CRT Reversal')
  const [sessionName]  = useState('London')
  const [tradeSymbol]  = useState(symbol ?? 'XAUUSD')
  const [stopLoss]     = useState('Beyond invalidation')
  const [invalidation, setInvalidation] = useState('')
  const [setupReason,  setSetupReason]  = useState('')
  const [rulesFollowed, setRulesFollowed] = useState(true)
  const [grade,        setGrade]        = useState<SetupGrade>('A')
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(
    () => Object.fromEntries(checklist.map(item => [item, true])),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const riskLimit       = session?.riskPerTrade ?? 33.33
  const dailyLoss       = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 68.20
  const intendedRisk    = riskLimit  // displayed as static for now
  const riskProgress    = Math.min(100, Math.round((intendedRisk / riskLimit) * 100))
  const allChecked      = checklist.every(item => checkedItems[item])
  const isBlocking      = grade === 'Impulse' || !rulesFollowed

  function validate(): string | null {
    if (!allChecked)            return 'Complete all checklist items before submitting.'
    if (!invalidation.trim())   return 'State what would invalidate this trade.'
    if (!setupReason.trim())    return 'Explain why this qualifies as an A setup.'
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    setSubmitting(true)
    try {
      await sendToBackground({
        type: 'TC_GATE_ANSWERED',
        payload: {
          tradeIntentId: intentId,
          answers: buildAnswers(),
        } satisfies GateAnsweredPayload,
      })
      closeGate()
    } catch {
      setError('Unable to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function buildAnswers(): PreTradeGateAnswers {
    return {
      setupDescription: `${setup}: ${setupReason}`.trim(),
      stopLoss,
      invalidation: invalidation.trim(),
      intendedRisk: intendedRisk,
      rulesFollowed,
      setupGrade: grade,
      checklistItems: checkedItems,
    }
  }

  function toggleCheck(label: string) {
    setCheckedItems(cur => ({ ...cur, [label]: !cur[label] }))
  }

  return (
    <div
      className="fixed inset-0 z-[2147483645] pointer-events-auto"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-y-0 left-0 right-[440px]"
        style={{ background: 'rgba(4,6,14,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={closeGate}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 w-[440px] flex flex-col border-l border-tc-border bg-tc-bg shadow-tc-side text-tc-text">

        {/* Header */}
        <header className="shrink-0 border-b border-tc-border bg-tc-panel px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-tc-green/25 bg-tc-green/10">
                <span className="text-[11px] font-black text-tc-green">TC</span>
              </div>
              <div>
                <div className="text-[15px] font-semibold tracking-tight text-tc-text">Pre-Trade Gate</div>
                <div className="text-[11px] text-tc-muted">Review before submission</div>
              </div>
            </div>
            <Badge tone={isBlocking ? 'danger' : 'success'}>
              {isBlocking ? 'Will Block' : 'Strict Mode'}
            </Badge>
          </div>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto px-5 py-5 space-y-5 tc-scroll">

          {/* Trade summary */}
          <GateSection title="Trade Summary">
            <Card padding="none" className="divide-y divide-tc-border">
              <InfoRow label="Setup"     value={setup}                                      accent />
              <InfoRow label="Session"   value={sessionName} />
              <InfoRow label="Symbol"    value={tradeSymbol} />
              <InfoRow
                label="Direction"
                value={direction === 'long' ? 'Buy / Long' : 'Sell / Short'}
                accent={direction === 'long'}
                danger={direction === 'short'}
              />
            </Card>
          </GateSection>

          {/* Checklist */}
          <GateSection title="Entry Checklist">
            <div className="space-y-1.5">
              {checklist.map(item => {
                const checked = !!checkedItems[item]
                return (
                  <button
                    key={item}
                    onClick={() => toggleCheck(item)}
                    className={[
                      'flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-all',
                      checked
                        ? 'border-tc-green/20 bg-tc-green/8 hover:bg-tc-green/12'
                        : 'border-tc-border bg-tc-panel hover:border-[#334155]',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={[
                        'flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold',
                        checked ? 'border-tc-green bg-tc-green text-[#052e16]' : 'border-tc-border text-tc-faint',
                      ].join(' ')}>
                        {checked && '✓'}
                      </div>
                      <span className={`text-[13px] ${checked ? 'text-tc-sub' : 'text-tc-muted'}`}>{item}</span>
                    </div>
                    <span className={`text-[11px] font-semibold ${checked ? 'text-tc-green' : 'text-tc-red'}`}>
                      {checked ? 'Yes' : 'No'}
                    </span>
                  </button>
                )
              })}
            </div>
          </GateSection>

          {/* Risk */}
          <GateSection title="Risk Check">
            <Card padding="md" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <RiskMetric label="Allowed risk"    value={`$${riskLimit.toFixed(2)}`} />
                <RiskMetric label="Intended risk"   value={`$${intendedRisk.toFixed(2)}`} accent />
                <RiskMetric label="Daily budget"    value={`$${dailyBudgetLeft.toFixed(2)}`} />
                <RiskMetric label="Trades today"    value={`${session?.tradesOpenedToday ?? 1} / ${session?.maxTrades ?? 3}`} />
              </div>
              <ProgressBar
                value={riskProgress}
                label="Risk usage"
                showValue
                tone={riskProgress >= 90 ? 'danger' : riskProgress >= 70 ? 'warning' : 'success'}
              />
            </Card>
          </GateSection>

          {/* Trader input */}
          <GateSection title="Trader Input">
            <div className="space-y-3">
              <Textarea
                label="What invalidates this trade?"
                value={invalidation}
                onChange={e => setInvalidation(e.target.value)}
                placeholder="e.g. Price closes back inside the swept range"
                rows={3}
              />
              <Textarea
                label="Why is this an A setup?"
                value={setupReason}
                onChange={e => setSetupReason(e.target.value)}
                placeholder="e.g. HTF bias aligns, sweep and retest are clean"
                rows={3}
              />
            </div>
          </GateSection>

          {/* Setup grade */}
          <GateSection title="Setup Grade">
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    setGrade(opt)
                    setRulesFollowed(opt !== 'Impulse')
                  }}
                  className={[
                    'rounded-xl border py-2.5 text-[12px] font-semibold transition-all',
                    grade === opt ? gradeActive(opt) : 'border-tc-border bg-tc-panel text-tc-muted hover:border-[#334155] hover:text-tc-sub',
                  ].join(' ')}
                >
                  {opt === 'Impulse' ? 'Impulse' : `${opt} Setup`}
                </button>
              ))}
            </div>
          </GateSection>

          {/* Error / block warning */}
          {(error || isBlocking) && (
            <div className={`rounded-xl border px-4 py-3 text-[13px] ${error ? 'border-tc-red/30 bg-tc-red/10 text-[#fca5a5]' : 'border-tc-amber/30 bg-tc-amber/10 text-tc-amber'}`}>
              {error ?? 'This grade will block the trade and activate a new-entry lock.'}
            </div>
          )}
        </main>

        {/* Footer actions */}
        <footer className="shrink-0 border-t border-tc-border bg-tc-panel px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" fullWidth onClick={closeGate}>
              Cancel Trade
            </Button>
            <Button
              variant={isBlocking ? 'danger' : 'primary'}
              size="lg"
              fullWidth
              loading={submitting}
              onClick={handleSubmit}
            >
              {isBlocking ? 'Submit & Lock' : 'Submit Trade'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ── Local sub-components ─────────────────────────────────────────────────────

function GateSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tc-muted">{title}</div>
      {children}
    </section>
  )
}

function InfoRow({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[12px] text-tc-muted">{label}</span>
      <span className={`text-[13px] font-medium ${accent ? 'text-tc-green' : danger ? 'text-tc-red' : 'text-tc-text'}`}>
        {value}
      </span>
    </div>
  )
}

function RiskMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] text-tc-muted">{label}</div>
      <div className={`text-[14px] font-semibold ${accent ? 'text-tc-green' : 'text-tc-text'}`}>{value}</div>
    </div>
  )
}

function gradeActive(grade: SetupGrade): string {
  switch (grade) {
    case 'A':       return 'border-tc-green/40  bg-tc-green/15  text-tc-green'
    case 'B':       return 'border-tc-border     bg-tc-elevated  text-tc-sub'
    case 'C':       return 'border-tc-amber/35  bg-tc-amber/12  text-tc-amber'
    case 'Impulse': return 'border-tc-red/35    bg-tc-red/12    text-[#fca5a5]'
  }
}
