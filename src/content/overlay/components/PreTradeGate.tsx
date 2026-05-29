import { useState } from 'react'
import { useStore } from '../../../shared/state/store'
import { sendToBackground } from '../../../shared/lib/messages'
import type { SetupGrade, PreTradeGateAnswers } from '../../../shared/types/trade'
import type { GateAnsweredPayload } from '../../../shared/lib/messages'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
}

const GRADE_OPTIONS: { grade: SetupGrade; label: string; sub: string; color: string }[] = [
  { grade: 'A',       label: 'A',       sub: 'High quality', color: 'border-[#22c55e] text-[#22c55e]'  },
  { grade: 'B',       label: 'B',       sub: 'Valid',        color: 'border-[#3b82f6] text-[#3b82f6]'  },
  { grade: 'C',       label: 'C',       sub: 'Marginal',     color: 'border-[#f59e0b] text-[#f59e0b]'  },
  { grade: 'Impulse', label: 'IMPULSE', sub: 'Block me',     color: 'border-[#ef4444] text-[#ef4444]'  },
]

export default function PreTradeGate({ intentId, direction, symbol }: Props) {
  const closeGate = useStore(s => s.closeGate)
  const session   = useStore(s => s.session)

  const [setup,       setSetup]       = useState('')
  const [stopLoss,    setStopLoss]    = useState('')
  const [invalidation,setInvalidation] = useState('')
  const [riskAmount,  setRiskAmount]  = useState<string>(session?.riskPerTrade?.toFixed(2) ?? '')
  const [rulesFollowed, setRulesFollowed] = useState<boolean | null>(null)
  const [grade,       setGrade]       = useState<SetupGrade | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const riskLimit = session?.riskPerTrade ?? Infinity

  function validate(): string | null {
    if (setup.trim().length < 10) return 'Describe your setup in at least 10 characters.'
    if (!stopLoss.trim())         return 'Stop loss is required.'
    if (!invalidation.trim())     return 'What invalidates this trade? Required.'
    if (!grade)                   return 'Select a setup grade.'
    if (rulesFollowed === null)   return 'Answer: does this match your rules?'
    const risk = parseFloat(riskAmount)
    if (isNaN(risk) || risk <= 0) return 'Enter a valid risk amount.'
    if (risk > riskLimit)         return `Risk ($${risk.toFixed(2)}) exceeds your limit ($${riskLimit.toFixed(2)}).`
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    if (grade === 'Impulse' || rulesFollowed === false) {
      // Hard block — send to background to trigger lock
      await sendToBackground({
        type: 'TC_GATE_ANSWERED',
        payload: {
          tradeIntentId: intentId,
          answers: buildAnswers(),
        } satisfies GateAnsweredPayload,
      })
      closeGate()
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
    } catch (e) {
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
      intendedRisk: parseFloat(riskAmount),
      rulesFollowed: rulesFollowed ?? false,
      setupGrade: grade!,
      checklistItems: {},
    }
  }

  const isBlocking = grade === 'Impulse' || rulesFollowed === false
  const submitLabel = isBlocking ? '🚫 Submit and block' : 'Ready to submit'
  const canSubmit = setup.length >= 10 && stopLoss && invalidation && grade && rulesFollowed !== null

  return (
    <div className="fixed inset-0 z-[2147483645] flex items-stretch justify-end pointer-events-auto">
      {/* Dim backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={closeGate} />

      {/* Right-side panel */}
      <div className="relative w-[360px] bg-[#0f1320] border-l border-[#1e2538] flex flex-col shadow-[0_0_48px_rgba(0,0,0,0.8)] overflow-y-auto tc-scrollbar">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2538]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#22c55e]/20 flex items-center justify-center">
              <span className="text-[#22c55e] text-xs font-bold">TC</span>
            </div>
            <span className="text-[#e2e8f0] text-sm font-semibold">Pre-Trade Gate</span>
          </div>
          <button onClick={closeGate} className="text-[#64748b] hover:text-[#e2e8f0] transition-colors text-lg leading-none">×</button>
        </div>

        {/* Trade context bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#141928] border-b border-[#1e2538]">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${direction === 'long' ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#ef4444]/15 text-[#ef4444]'}`}>
            {direction === 'long' ? '▲ LONG' : '▼ SHORT'}
          </span>
          {symbol && <span className="text-[#e2e8f0] text-sm font-medium">{symbol}</span>}
          {session && (
            <span className="ml-auto text-[10px] text-[#64748b]">
              Max risk <span className="text-[#f59e0b] font-medium">${session.riskPerTrade.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Form */}
        <div className="flex-1 px-4 py-3 space-y-4">

          {/* 1. Setup */}
          <Field label="1. What is the setup?">
            <textarea
              value={setup}
              onChange={e => setSetup(e.target.value)}
              placeholder="Describe the setup specifically…"
              rows={2}
              className="w-full bg-[#141928] border border-[#1e2538] rounded text-[#e2e8f0] text-sm px-3 py-2 resize-none placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]"
            />
            {setup.length > 0 && setup.length < 10 && (
              <p className="text-[10px] text-[#f59e0b] mt-1">Be specific — at least 10 characters</p>
            )}
          </Field>

          {/* 2. Stop loss */}
          <Field label="2. Where is your stop loss?">
            <input
              type="text"
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              placeholder="Price level or pips…"
              className="w-full bg-[#141928] border border-[#1e2538] rounded text-[#e2e8f0] text-sm px-3 py-2 placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]"
            />
          </Field>

          {/* 3. Invalidation */}
          <Field label="3. What invalidates this trade?">
            <input
              type="text"
              value={invalidation}
              onChange={e => setInvalidation(e.target.value)}
              placeholder="What would tell you this idea is wrong?"
              className="w-full bg-[#141928] border border-[#1e2538] rounded text-[#e2e8f0] text-sm px-3 py-2 placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]"
            />
          </Field>

          {/* 4. Risk */}
          <Field label="4. Intended risk on this trade">
            <div className="flex items-center gap-2">
              <span className="text-[#64748b] text-sm">$</span>
              <input
                type="number"
                value={riskAmount}
                onChange={e => setRiskAmount(e.target.value)}
                placeholder="0.00"
                min={0}
                step={0.01}
                className="w-full bg-[#141928] border border-[#1e2538] rounded text-[#e2e8f0] text-sm px-3 py-2 placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            {session && parseFloat(riskAmount) > riskLimit && (
              <p className="text-[10px] text-[#ef4444] mt-1">Exceeds your limit of ${riskLimit.toFixed(2)}</p>
            )}
          </Field>

          {/* 5. Rules match */}
          <Field label="5. Does this match your rules today?">
            <div className="flex gap-2">
              <ToggleBtn
                active={rulesFollowed === true}
                onClick={() => setRulesFollowed(true)}
                color="green"
                label="✅ Yes — all rules met"
              />
              <ToggleBtn
                active={rulesFollowed === false}
                onClick={() => setRulesFollowed(false)}
                color="red"
                label="❌ No — rule broken"
              />
            </div>
          </Field>

          {/* 6. Setup grade */}
          <Field label="6. Setup grade">
            <div className="grid grid-cols-4 gap-1.5">
              {GRADE_OPTIONS.map(opt => (
                <button
                  key={opt.grade}
                  onClick={() => setGrade(opt.grade)}
                  className={`
                    flex flex-col items-center py-2 px-1 rounded border text-center transition-all
                    ${grade === opt.grade
                      ? `${opt.color} bg-current/5`
                      : 'border-[#1e2538] text-[#64748b] hover:border-[#2e3548]'
                    }
                  `}
                >
                  <span className="text-xs font-bold leading-none">{opt.label}</span>
                  <span className="text-[9px] leading-none mt-1 opacity-80">{opt.sub}</span>
                </button>
              ))}
            </div>
          </Field>

          {/* Blocking warning */}
          {isBlocking && (
            <div className="rounded border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2.5">
              <p className="text-[#ef4444] text-xs font-semibold">
                {grade === 'Impulse' ? 'Impulse trade — platform will be locked.' : 'Rule violation — platform will be locked.'}
              </p>
              <p className="text-[#ef4444]/70 text-[11px] mt-1">
                You know your rules better than anyone.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[#ef4444] text-xs px-1">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-[#1e2538] flex gap-2">
          <button
            onClick={closeGate}
            className="flex-1 py-2.5 rounded border border-[#1e2538] text-[#64748b] text-sm font-medium hover:border-[#2e3548] hover:text-[#94a3b8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`
              flex-2 flex-grow-[2] py-2.5 rounded text-sm font-semibold transition-all
              ${isBlocking
                ? 'bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-40'
                : canSubmit
                  ? 'bg-[#22c55e] text-white hover:bg-[#16a34a] disabled:opacity-40'
                  : 'bg-[#141928] text-[#64748b] border border-[#1e2538] cursor-not-allowed'
              }
            `}
          >
            {submitting ? 'Submitting…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[#64748b] font-medium mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function ToggleBtn({
  active, onClick, color, label,
}: {
  active: boolean; onClick: () => void; color: 'green' | 'red'; label: string
}) {
  const activeClass = color === 'green'
    ? 'border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]'
    : 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]'

  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-1.5 px-2 rounded border text-xs font-medium transition-all
        ${active ? activeClass : 'border-[#1e2538] text-[#64748b] hover:border-[#2e3548]'}
      `}
    >
      {label}
    </button>
  )
}
