import { useMemo, useState } from 'react'
import { Badge, Button, Card, ChecklistItem, Pill, ProgressBar, SectionHeader, SidePanel, StatRow, Textarea } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { SetupGrade, PreTradeGateAnswers } from '../../../shared/types/trade'
import type { GateAnsweredPayload } from '../../../shared/lib/messages'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
}

const DEFAULT_CHECKLIST = [
  'HTF bias confirmed',
  'Liquidity sweep confirmed',
  'Displacement visible',
  'Retest complete',
  'Stop beyond invalidation',
]

const GRADES: SetupGrade[] = ['A', 'B', 'C', 'Impulse']

export default function PreTradeGate({ intentId, direction, symbol }: Props) {
  const closeGate = useStore(s => s.closeGate)
  const session = useStore(s => s.session)
  const playbooks = useStore(s => s.playbooks)

  const activePlaybook = useMemo(() => {
    return playbooks.find(p => p.active && (!symbol || p.allowedSymbols.length === 0 || p.allowedSymbols.includes(symbol))) ?? playbooks.find(p => p.active)
  }, [playbooks, symbol])

  const checklist = activePlaybook?.checklistItems?.length
    ? activePlaybook.checklistItems.map(item => item.label)
    : DEFAULT_CHECKLIST

  const [setup] = useState(activePlaybook?.name ?? 'CRT Reversal')
  const [invalidation, setInvalidation] = useState('')
  const [setupReason, setSetupReason] = useState('')
  const [grade, setGrade] = useState<SetupGrade>('A')
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checklist.map(item => [item, true]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const riskLimit = session?.riskPerTrade ?? 33.33
  const intendedRisk = Math.max(riskLimit - 1.53, 0)
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 68.20
  const allChecklistPassed = checklist.every(item => checkedItems[item])
  const riskProgress = Math.min(100, Math.round((intendedRisk / riskLimit) * 100))
  const isBlocking = grade === 'Impulse'

  function validate(): string | null {
    if (!allChecklistPassed) return 'Complete all checklist items before submitting.'
    if (!invalidation.trim()) return 'Invalidation is required.'
    if (!setupReason.trim()) return 'Explain why this is an A setup.'
    if (intendedRisk > riskLimit) return `Intended risk exceeds the $${riskLimit.toFixed(2)} limit.`
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }

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
      setError('Unable to submit this gate. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function buildAnswers(): PreTradeGateAnswers {
    return {
      setupDescription: `${setup}: ${setupReason}`.trim(),
      stopLoss: 'Beyond invalidation',
      invalidation: invalidation.trim(),
      intendedRisk,
      rulesFollowed: !isBlocking,
      setupGrade: grade,
      checklistItems: checkedItems,
    }
  }

  return (
    <div className="fixed inset-0 z-[2147483645] pointer-events-auto" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="absolute inset-y-0 left-0 right-[420px] bg-black/60 backdrop-blur-[3px]" onClick={closeGate} />

      <SidePanel className="absolute inset-y-0 right-0 flex flex-col" width="420px">
        <header className="border-b border-tc-border p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tc-green text-xs font-black text-[#06150f]">TC</div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-tc-text">Pre-Trade Gate</h1>
                <p className="text-sm text-tc-muted">Review before broker submission</p>
              </div>
            </div>
            <Badge tone="success">Strict Mode</Badge>
          </div>
        </header>

        <main className="flex-1 space-y-5 overflow-y-auto p-6 tc-scrollbar">
          <Card padding="none">
            <StatRow label="Setup" value={setup} tone="success" />
            <StatRow label="Symbol" value={symbol ?? 'XAUUSD'} />
            <StatRow label="Direction" value={direction === 'long' ? 'Buy' : 'Sell'} tone={direction === 'long' ? 'success' : 'danger'} />
            <StatRow label="Session" value="London" />
          </Card>

          <section className="space-y-3">
            <SectionHeader title="Checklist" sub="Every rule must be true before the trade can proceed." />
            <div className="space-y-2">
              {checklist.map(item => (
                <ChecklistItem
                  key={item}
                  label={item}
                  checked={!!checkedItems[item]}
                  onChange={checked => setCheckedItems(current => ({ ...current, [item]: checked }))}
                />
              ))}
            </div>
          </section>

          <Card>
            <SectionHeader title="Risk Check" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <RiskMetric label="Allowed risk" value={`$${riskLimit.toFixed(2)}`} />
              <RiskMetric label="Intended risk" value={`$${intendedRisk.toFixed(2)}`} tone="success" />
              <RiskMetric label="Daily budget left" value={`$${dailyBudgetLeft.toFixed(2)}`} />
              <RiskMetric label="Trades today" value={`${session?.tradesOpenedToday ?? 1} / 3`} />
            </div>
            <ProgressBar className="mt-5" label="Risk usage" value={riskProgress} showValue />
          </Card>

          <Card className="space-y-4">
            <SectionHeader title="Trader Input" />
            <Textarea
              label="What invalidates this trade?"
              value={invalidation}
              onChange={e => setInvalidation(e.target.value)}
              placeholder="Price closes back inside the swept range"
            />
            <Textarea
              label="Why is this an A setup?"
              value={setupReason}
              onChange={e => setSetupReason(e.target.value)}
              placeholder="HTF bias aligns, sweep and retest are clean"
            />
          </Card>

          <section className="space-y-3">
            <SectionHeader title="Setup Grade" />
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map(option => (
                <button key={option} type="button" onClick={() => setGrade(option)} className="text-left">
                  <Pill tone={gradeTone(option, grade)} className="w-full justify-center">
                    {option === 'Impulse' ? 'Impulse' : `${option} Setup`}
                  </Pill>
                </button>
              ))}
            </div>
          </section>

          {(error || isBlocking) && (
            <Card tone="danger" padding="sm" className="text-sm text-tc-red">
              {error ?? 'Impulse grade will block the trade and activate a new-entry lock.'}
            </Card>
          )}
        </main>

        <footer className="grid grid-cols-2 gap-3 border-t border-tc-border p-6">
          <Button variant="secondary" onClick={closeGate} fullWidth>Cancel Trade</Button>
          <Button variant={isBlocking ? 'danger' : 'primary'} onClick={handleSubmit} loading={submitting} fullWidth>
            {isBlocking ? 'Block Trade' : 'Submit Trade'}
          </Button>
        </footer>
      </SidePanel>
    </div>
  )
}

function RiskMetric({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div>
      <div className="mb-1 text-xs text-tc-muted">{label}</div>
      <div className={`text-sm font-semibold ${tone === 'success' ? 'text-tc-green' : 'text-tc-text'}`}>{value}</div>
    </div>
  )
}

function gradeTone(option: SetupGrade, selected: SetupGrade) {
  if (option !== selected) return 'neutral'
  if (option === 'Impulse') return 'danger'
  if (option === 'C') return 'warning'
  return 'success'
}
