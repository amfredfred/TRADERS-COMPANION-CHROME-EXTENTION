import { useMemo, useState } from 'react'
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
  'Displacement candle visible',
  'Retest completed',
  'Stop placed beyond invalidation',
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
  const [sessionName] = useState('London')
  const [tradeSymbol] = useState(symbol ?? 'XAUUSD')
  const [stopLoss] = useState('Beyond invalidation')
  const [invalidation, setInvalidation] = useState('')
  const [setupReason, setSetupReason] = useState('')
  const [riskAmount] = useState<string>(session?.riskPerTrade ? Math.max(session.riskPerTrade - 1.53, 0).toFixed(2) : '31.80')
  const [rulesFollowed, setRulesFollowed] = useState(true)
  const [grade, setGrade] = useState<SetupGrade>('A')
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checklist.map(item => [item, true]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const riskLimit = session?.riskPerTrade ?? 33.33
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : 68.20
  const parsedRisk = parseFloat(riskAmount)
  const allChecklistPassed = checklist.every(item => checkedItems[item])
  const riskProgress = Math.min(100, Math.max(0, Math.round((parsedRisk / riskLimit) * 100)))
  const isBlocking = grade === 'Impulse' || !rulesFollowed

  function validate(): string | null {
    if (!allChecklistPassed) return 'Complete all checklist items before submitting.'
    if (!invalidation.trim()) return 'Invalidation is required.'
    if (!setupReason.trim()) return 'Explain why this is an A setup.'
    if (parsedRisk > riskLimit) return `Intended risk exceeds the $${riskLimit.toFixed(2)} limit.`
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
      stopLoss,
      invalidation: invalidation.trim(),
      intendedRisk: parsedRisk,
      rulesFollowed,
      setupGrade: grade,
      checklistItems: checkedItems,
    }
  }

  function toggleCheck(label: string) {
    setCheckedItems(current => ({ ...current, [label]: !current[label] }))
  }

  return (
    <div className="fixed inset-0 z-[2147483645] pointer-events-auto" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div className="absolute inset-y-0 left-0 right-[420px] bg-[#05070a]/58 backdrop-blur-[3px]" onClick={closeGate} />
      <div className="absolute inset-y-0 right-0 w-[420px] border-l border-[#262c34] bg-[#0d1015] text-[#f4f7fb] shadow-[-22px_0_50px_rgba(0,0,0,0.34)]">
        <div className="flex h-full flex-col">
          <header className="border-b border-[#242a32] px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#24c78e] text-xs font-black text-[#06150f]">
                  TC
                </div>
                <div>
                  <div className="text-lg font-semibold tracking-[-0.01em]">Pre-Trade Gate</div>
                  <div className="text-xs text-[#8b95a1]">Order review before submission</div>
                </div>
              </div>
              <span className="rounded-full border border-[#2f5e4d] bg-[#123428] px-2.5 py-1 text-[11px] font-semibold text-[#37d39b]">
                Strict Mode
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-6 py-5 tc-scrollbar">
            <Section title="Setup">
              <div className="rounded-xl border border-[#242a32] bg-[#12161d]">
                <InfoRow label="Setup selected" value={setup} accent />
                <InfoRow label="Session" value={sessionName} />
                <InfoRow label="Symbol" value={tradeSymbol} />
                <InfoRow label="Direction" value={direction === 'long' ? 'Buy' : 'Sell'} accent={direction === 'long'} danger={direction === 'short'} />
              </div>
            </Section>

            <Section title="Checklist">
              <div className="space-y-2">
                {checklist.map(item => {
                  const checked = !!checkedItems[item]
                  return (
                    <button
                      key={item}
                      onClick={() => toggleCheck(item)}
                      className="flex w-full items-center justify-between rounded-lg border border-[#242a32] bg-[#12161d] px-3.5 py-3 text-left transition hover:border-[#333b46]"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${checked ? 'border-[#37d39b] bg-[#37d39b] text-[#06150f]' : 'border-[#596270] text-[#596270]'}`}>
                          {checked ? '✓' : ''}
                        </span>
                        <span className="text-sm text-[#e7ecf2]">{item}</span>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${checked ? 'bg-[#123428] text-[#37d39b]' : 'bg-[#26191b] text-[#d97979]'}`}>
                        {checked ? 'Yes' : 'No'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Risk Check">
              <div className="rounded-xl border border-[#242a32] bg-[#12161d] p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Allowed risk" value={`$${riskLimit.toFixed(2)}`} />
                  <Metric label="Intended risk" value={`$${parsedRisk.toFixed(2)}`} accent />
                  <Metric label="Daily budget left" value={`$${dailyBudgetLeft.toFixed(2)}`} />
                  <Metric label="Trades today" value={`${session?.tradesOpenedToday ?? 1} / 3`} />
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-[11px] text-[#8b95a1]">
                    <span>Risk usage</span>
                    <span>{riskProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#252b34]">
                    <div className="h-full rounded-full bg-[#37d39b]" style={{ width: `${riskProgress}%` }} />
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Trader Input">
              <div className="space-y-3">
                <TextField label="What invalidates this trade?" value={invalidation} onChange={setInvalidation} placeholder="Example: price closes back inside the swept range" />
                <TextField label="Why is this an A setup?" value={setupReason} onChange={setSetupReason} placeholder="Example: HTF bias aligns, sweep and retest are clean" />
              </div>
            </Section>

            <Section title="Setup Grade">
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(option => (
                  <button
                    key={option}
                    onClick={() => {
                      setGrade(option)
                      setRulesFollowed(option !== 'Impulse')
                    }}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${grade === option ? gradeClass(option) : 'border-[#2a313a] bg-[#12161d] text-[#8b95a1] hover:border-[#3a4350] hover:text-[#e7ecf2]'}`}
                  >
                    {option === 'Impulse' ? 'Impulse' : `${option} Setup`}
                  </button>
                ))}
              </div>
            </Section>

            {error && (
              <div className="rounded-lg border border-[#5c2d31] bg-[#221416] px-3 py-2 text-sm text-[#d97979]">
                {error}
              </div>
            )}
            {isBlocking && !error && (
              <div className="rounded-lg border border-[#5c2d31] bg-[#221416] px-3 py-2 text-sm text-[#d97979]">
                This grade blocks the trade and activates a new-entry lock.
              </div>
            )}
          </main>

          <footer className="border-t border-[#242a32] px-6 py-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={closeGate}
                className="rounded-lg border border-[#2a313a] bg-[#141920] px-4 py-3 text-sm font-semibold text-[#c7d0dc] transition hover:border-[#3a4350] hover:bg-[#181e26]"
              >
                Cancel Trade
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-[#2bbf89] px-4 py-3 text-sm font-semibold text-[#06150f] transition hover:bg-[#37d39b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Trade'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b95a1]">{title}</h2>
      {children}
    </section>
  )
}

function InfoRow({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[#242a32] px-4 py-3 last:border-b-0">
      <span className="text-sm text-[#8b95a1]">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-[#37d39b]' : danger ? 'text-[#d97979]' : 'text-[#e7ecf2]'}`}>{value}</span>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-[#8b95a1]">{label}</div>
      <div className={`text-sm font-semibold ${accent ? 'text-[#37d39b]' : 'text-[#f4f7fb]'}`}>{value}</div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[#c7d0dc]">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-[#242a32] bg-[#12161d] px-3 py-2.5 text-sm leading-relaxed text-[#f4f7fb] outline-none placeholder:text-[#596270] focus:border-[#37d39b]"
      />
    </label>
  )
}

function gradeClass(grade: SetupGrade) {
  switch (grade) {
    case 'A':
      return 'border-[#37d39b] bg-[#123428] text-[#37d39b]'
    case 'B':
      return 'border-[#52606f] bg-[#18202a] text-[#c7d0dc]'
    case 'C':
      return 'border-[#6b5840] bg-[#211b13] text-[#d6a35d]'
    case 'Impulse':
      return 'border-[#5c2d31] bg-[#221416] text-[#d97979]'
  }
}
