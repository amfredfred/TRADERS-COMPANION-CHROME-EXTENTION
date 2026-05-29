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
  'Sweep confirmed',
  'Displacement visible',
  'Retest complete',
]

const GRADES: { grade: SetupGrade; label: string }[] = [
  { grade: 'A', label: 'High Quality' },
  { grade: 'B', label: 'Valid Setup' },
  { grade: 'C', label: 'Marginal' },
  { grade: 'Impulse', label: 'Impulse' },
]

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

  const [setup, setSetup] = useState(activePlaybook?.name ?? (direction === 'long' ? 'Bullish Breaker + Retest' : 'Bearish Breaker + Retest'))
  const [stopLoss, setStopLoss] = useState('')
  const [invalidation, setInvalidation] = useState('')
  const [riskAmount, setRiskAmount] = useState<string>(session?.riskPerTrade?.toFixed(2) ?? '')
  const [rulesFollowed, setRulesFollowed] = useState<boolean | null>(true)
  const [grade, setGrade] = useState<SetupGrade>('A')
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checklist.map(item => [item, true]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const riskLimit = session?.riskPerTrade ?? Infinity
  const parsedRisk = parseFloat(riskAmount)
  const allChecklistPassed = checklist.every(item => checkedItems[item])
  const rulesMetCount = checklist.filter(item => checkedItems[item]).length
  const isBlocking = grade === 'Impulse' || rulesFollowed === false
  const riskOverLimit = !isNaN(parsedRisk) && parsedRisk > riskLimit
  const selectedGrade = GRADES.find(g => g.grade === grade)

  function validate(): string | null {
    if (setup.trim().length < 10) return 'Be specific about the setup.'
    if (!allChecklistPassed) return 'All rule checks must be complete.'
    if (!stopLoss.trim()) return 'Stop loss is required.'
    if (!invalidation.trim()) return 'Invalidation is required.'
    if (rulesFollowed === null) return 'Confirm whether rules are met.'
    if (isNaN(parsedRisk) || parsedRisk <= 0) return 'Enter valid intended risk.'
    if (riskOverLimit) return `Risk exceeds your $${riskLimit.toFixed(2)} limit.`
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
      setError('Failed to submit. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function buildAnswers(): PreTradeGateAnswers {
    return {
      setupDescription: setup.trim(),
      stopLoss: stopLoss.trim(),
      invalidation: invalidation.trim(),
      intendedRisk: parsedRisk,
      rulesFollowed: rulesFollowed ?? false,
      setupGrade: grade,
      checklistItems: checkedItems,
    }
  }

  function toggleCheck(label: string) {
    setCheckedItems(current => ({ ...current, [label]: !current[label] }))
  }

  const canSubmit = setup.trim().length >= 10 && allChecklistPassed && !!stopLoss && !!invalidation && rulesFollowed !== null && !isNaN(parsedRisk) && parsedRisk > 0 && !riskOverLimit

  return (
    <div className="fixed right-3 top-[102px] z-[2147483645] w-[580px] max-w-[calc(100vw-24px)] pointer-events-none" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <section className="pointer-events-auto overflow-hidden rounded-xl border border-[#263247] bg-[#0b111b]/94 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <header className="flex items-center justify-between border-b border-[#202a3d] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#20e3a2] text-xs font-black text-[#052e16] shadow-[0_0_22px_rgba(32,227,162,0.25)]">
              TC
            </div>
            <div className="text-2xl font-bold tracking-[-0.01em] text-[#f8fafc]">Pre-Trade Gate</div>
          </div>
          <div className="flex items-center gap-3">
            <HeaderIcon label="Help">?</HeaderIcon>
            <HeaderIcon label="Settings">⚙</HeaderIcon>
            <button onClick={closeGate} className="text-2xl leading-none text-[#94a3b8] transition hover:text-white" aria-label="Close">×</button>
          </div>
        </header>

        <div className="p-4">
          <div className="overflow-hidden rounded-lg border border-[#202a3d] bg-[#0f1622]/86">
            <EditableSummaryRow label="Setup" value={setup} onChange={setSetup} tone="green" />
            <EditableSummaryRow label="Stop Loss" value={stopLoss} onChange={setStopLoss} placeholder="Price level or pips" tone={riskOverLimit ? 'red' : 'red'} />
            <EditableSummaryRow label="Invalidation" value={invalidation} onChange={setInvalidation} placeholder="What invalidates this trade?" tone="red" />
            <EditableSummaryRow label="Intended Risk" value={riskAmount} onChange={setRiskAmount} placeholder="0.00" prefix="$" suffix={session ? ` (${((parsedRisk || 0) / Math.max(session.accountBalance || 1, 1) * 100).toFixed(2)}%)` : ''} tone={riskOverLimit ? 'red' : 'white'} />

            <div className="border-t border-[#202a3d] px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">Rules Met</span>
                <span className={`text-xl font-black ${allChecklistPassed ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>{rulesMetCount} / {checklist.length}</span>
              </div>
              <div className="space-y-1.5">
                {checklist.map(item => {
                  const active = !!checkedItems[item]
                  return (
                    <button key={item} onClick={() => toggleCheck(item)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-[#141c2a]">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-[#22c55e] text-[#052e16]' : 'border border-[#475569] text-[#64748b]'}`}>{active ? '✓' : ''}</span>
                      <span className="flex-1 text-sm text-[#e2e8f0]">{item}</span>
                      <span className={active ? 'text-sm font-semibold text-[#22c55e]' : 'text-sm text-[#64748b]'}>{active ? 'Yes' : 'No'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#202a3d] px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">Setup Grade</span>
              <div className="flex items-center gap-2">
                {GRADES.map(option => (
                  <button
                    key={option.grade}
                    onClick={() => setGrade(option.grade)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black transition ${grade === option.grade ? gradeClass(option.grade) : 'border-[#2a3448] text-[#64748b] hover:text-[#cbd5e1]'}`}
                  >
                    {option.grade === 'Impulse' ? 'IMP' : option.grade}
                  </button>
                ))}
                <span className="ml-2 text-sm text-[#94a3b8]">{selectedGrade?.label}</span>
                <button onClick={() => setRulesFollowed(rulesFollowed === false ? true : false)} className={`ml-1 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${rulesFollowed === false ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#475569] text-[#94a3b8]'}`} title="Toggle rules met">
                  i
                </button>
              </div>
            </div>
          </div>

          {(error || isBlocking) && (
            <div className="mt-3 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-sm text-[#fca5a5]">
              {error ?? 'This answer will block the order and activate a lock for new entries.'}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={closeGate} className="rounded-lg bg-[#1b2432] py-3 text-base font-semibold text-[#e2e8f0] transition hover:bg-[#243044]">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`rounded-lg py-3 text-base font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${isBlocking ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]' : 'bg-[#22c55e] text-white hover:bg-[#16a34a]'}`}
            >
              {submitting ? 'Submitting...' : isBlocking ? 'Block Trade' : 'Ready to Submit'}
            </button>
          </div>
        </div>
      </section>

      <div className="pointer-events-auto mt-2 grid grid-cols-2 gap-2">
        <StatusTile icon="II" title="No Trade Mode" status="Inactive" body="Toggle to block all entries" tone="green" />
        <StatusTile icon="TAG" title="Mistake Tags" status="3" body="Overtrading, No Plan, Early Entry" tone="amber" badge />
        <StatusTile icon="SH" title="Green Day Protection" status="Active" body="Lock in profits. Guard focus." tone="green" />
        <StatusTile icon="AI" title="AI Review Confidence" status="High Confidence" body="Based on similar setups" tone="blue" progress="78%" />
      </div>
    </div>
  )
}

function HeaderIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button className="flex h-7 w-7 items-center justify-center rounded-full border border-[#475569] text-sm text-[#cbd5e1] transition hover:border-[#94a3b8] hover:text-white" title={label} aria-label={label}>
      {children}
    </button>
  )
}

function EditableSummaryRow({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  tone,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  tone: 'green' | 'red' | 'white'
}) {
  const color = tone === 'green' ? 'text-[#20e3a2]' : tone === 'red' ? 'text-[#ef4444]' : 'text-[#f8fafc]'
  return (
    <div className="grid grid-cols-[150px_1fr] items-center border-b border-[#202a3d] px-4 py-3 last:border-b-0">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">{label}</label>
      <div className="flex items-center justify-end">
        {prefix && <span className={`text-lg ${color}`}>{prefix}</span>}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-transparent text-right text-lg font-medium outline-none placeholder:text-[#64748b] ${color}`}
        />
        {suffix && <span className={`whitespace-nowrap text-lg ${color}`}>{suffix}</span>}
      </div>
    </div>
  )
}

function StatusTile({
  icon,
  title,
  status,
  body,
  tone,
  badge,
  progress,
}: {
  icon: string
  title: string
  status: string
  body: string
  tone: 'green' | 'amber' | 'blue'
  badge?: boolean
  progress?: string
}) {
  const toneClasses = {
    green: 'bg-[#22c55e]/15 text-[#22c55e]',
    amber: 'bg-[#f59e0b]/15 text-[#f59e0b]',
    blue: 'bg-[#6366f1]/15 text-[#818cf8]',
  }[tone]

  return (
    <div className="flex min-h-[82px] items-center gap-3 rounded-lg border border-[#263247] bg-[#0b111b]/92 px-4 py-3 shadow-[0_12px_38px_rgba(0,0,0,0.35)] backdrop-blur-md">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${toneClasses}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-base font-bold text-[#f8fafc]">{title}</div>
          {badge && <span className="rounded-full bg-[#22c55e] px-1.5 py-0.5 text-[10px] font-black text-[#052e16]">{status}</span>}
        </div>
        {!badge && <div className={tone === 'green' ? 'text-sm font-semibold text-[#22c55e]' : tone === 'blue' ? 'text-sm font-semibold text-[#22c55e]' : 'text-sm text-[#f59e0b]'}>{status}</div>}
        <div className="truncate text-sm text-[#94a3b8]">{body}</div>
      </div>
      {progress && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-[5px] border-[#22c55e] text-xs font-black text-[#22c55e]">
          {progress}
        </div>
      )}
    </div>
  )
}

function gradeClass(grade: SetupGrade) {
  switch (grade) {
    case 'A':
      return 'border-[#22c55e] bg-[#22c55e]/25 text-[#22c55e]'
    case 'B':
      return 'border-[#3b82f6] bg-[#3b82f6]/20 text-[#60a5fa]'
    case 'C':
      return 'border-[#f59e0b] bg-[#f59e0b]/20 text-[#f59e0b]'
    case 'Impulse':
      return 'border-[#ef4444] bg-[#ef4444]/20 text-[#ef4444]'
  }
}
