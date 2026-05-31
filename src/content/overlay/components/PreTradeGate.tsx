import { useState } from 'react'
import { Badge, Button, Card, Input, ProgressBar, SectionHeader, SidePanel, StatRow } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { PreTradeGateAnswers } from '../../../shared/types/trade'
import type { GateAnsweredPayload } from '../../../shared/lib/messages'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
}

export default function PreTradeGate({ intentId, direction, symbol }: Props) {
  const closeGate = useStore(s => s.closeGate)
  const session = useStore(s => s.session)
  const [intendedRiskInput, setIntendedRiskInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const riskLimit = session?.riskPerTrade ?? 0
  const intendedRisk = Number(intendedRiskInput)
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 0
  const cooldownUntil = session?.lastTradeClosedAt ? session.lastTradeClosedAt + cooldownMs() : null
  const cooldownActive = !!cooldownUntil && Date.now() < cooldownUntil
  const hasValidRiskNumber = Number.isFinite(intendedRisk) && intendedRisk > 0
  const riskProgress = riskLimit > 0 && hasValidRiskNumber ? Math.min(100, Math.round((intendedRisk / riskLimit) * 100)) : 0
  const intendedRiskError = getIntendedRiskError()
  const canSubmit = !submitting && !validate()

  function cooldownMs(): number {
    return 15 * 60_000
  }

  function getIntendedRiskError(): string | undefined {
    if (!intendedRiskInput.trim()) return error ? 'Enter your intended dollar risk for this trade.' : undefined
    if (!Number.isFinite(intendedRisk)) return 'Intended risk must be a valid number.'
    if (intendedRisk <= 0) return 'Intended risk must be greater than 0.'
    if (riskLimit > 0 && intendedRisk > riskLimit) return `Intended risk exceeds the $${riskLimit.toFixed(2)} limit.`
    return undefined
  }

  function validate(): string | null {
    if (!session) return 'No active risk session.'
    if (!session.accountId) return 'No account detected.'
    if (!session.accountBalance || session.accountBalance <= 0) return 'No balance detected.'
    if (session.noTradeMode) return 'Manual No Trade Mode is active.'
    if (session.lockState) return 'Platform lock is active.'
    if (cooldownActive) return 'Cooldown is active.'
    if (dailyBudgetLeft <= 0) return 'Daily budget is exhausted.'
    if (!intendedRiskInput.trim()) return 'Enter your intended dollar risk for this trade.'
    if (!Number.isFinite(intendedRisk) || intendedRisk <= 0) return 'Intended risk must be a valid number greater than 0.'
    if (riskLimit > 0 && intendedRisk > riskLimit) return `Intended risk exceeds the $${riskLimit.toFixed(2)} limit.`
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
      setupDescription: `${direction === 'long' ? 'Long' : 'Short'} ${symbol ?? 'trade'}`.trim(),
      stopLoss: '',
      invalidation: '',
      intendedRisk,
      rulesFollowed: true,
      setupGrade: 'A',
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
                <p className="text-sm text-tc-muted">Execution safety check</p>
              </div>
            </div>
            <Badge tone={session?.enforcementMode === 'training' ? 'warning' : 'success'}>
              {session?.enforcementMode === 'training' ? 'Training' : session?.enforcementMode === 'prop_firm' ? 'Prop Firm' : 'Strict'}
            </Badge>
          </div>
        </header>

        <main className="flex-1 space-y-5 overflow-y-auto p-6 tc-scrollbar">
          <Card padding="none">
            <StatRow label="Symbol" value={symbol ?? 'Not detected'} />
            <StatRow label="Direction" value={direction === 'long' ? 'Buy' : 'Sell'} tone={direction === 'long' ? 'success' : 'danger'} />
            <StatRow label="Session" value={session ? 'Attached' : 'Start session required'} />
            <StatRow label="Account" value={session?.accountName ?? session?.accountKey ?? session?.accountId ?? 'Not detected'} />
          </Card>

          <Card>
            <SectionHeader title="Risk Check" />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <RiskMetric label="Allowed risk" value={session ? `$${riskLimit.toFixed(2)}` : 'Not detected'} />
              <RiskMetric label="Budget left" value={session ? `$${dailyBudgetLeft.toFixed(2)}` : 'Start session required'} />
              <RiskMetric label="Cooldown" value={cooldownActive ? 'Active' : 'Clear'} />
              <RiskMetric label="No Trade Mode" value={session?.noTradeMode ? 'On' : 'Off'} />
              <div className="col-span-2">
                <Input
                  label="Intended risk"
                  type="number"
                  min="0"
                  step="0.01"
                  value={intendedRiskInput}
                  onChange={e => setIntendedRiskInput(e.target.value)}
                  placeholder={session ? `Max ${riskLimit.toFixed(2)}` : 'Start session required'}
                  error={intendedRiskError}
                />
              </div>
            </div>
            <ProgressBar className="mt-5" label="Risk usage" value={riskProgress} showValue />
          </Card>

          {error && (
            <Card tone="danger" padding="sm" className="text-sm text-tc-red">
              {error}
            </Card>
          )}
        </main>

        <footer className="grid grid-cols-2 gap-3 border-t border-tc-border p-6">
          <Button variant="secondary" onClick={closeGate} fullWidth>Cancel Trade</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!canSubmit} fullWidth>
            Submit Trade
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
