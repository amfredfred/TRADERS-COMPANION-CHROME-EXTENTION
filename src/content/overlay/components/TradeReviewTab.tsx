import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../../shared/state/store'
import { TC_TRADE_REVIEW_PORT, sendToBackground } from '../../../shared/lib/messages'
import type { AIStreamChunk } from '../../../shared/ai/types'

export type ReviewState = 'neutral' | 'clean' | 'caution' | 'risky' | 'blocked'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
  onClose: () => void
  onReviewState: (state: ReviewState) => void
}

type Phase = 'loading' | 'streaming' | 'ready' | 'error'
type ChartState = 'capturing' | 'ready' | 'unavailable' | 'failed'

interface ReviewSection {
  title: string
  content: string
}

const SECTION_NAMES = [
  'Verdict', 'Risk', 'Chart Context', 'Execution Quality',
  'What Must Be True', 'Warnings', 'Final Guidance',
]

function parseReviewSections(text: string): ReviewSection[] {
  const sections: ReviewSection[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(/^\*\*([^*]+?)\*\*:?\s*(.*)$/)
    if (match) {
      const title = match[1].trim()
      const rest = match[2].trim()
      if (SECTION_NAMES.some(s => s.toLowerCase() === title.toLowerCase())) {
        if (currentTitle || currentLines.length) {
          sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
        }
        currentTitle = title
        currentLines = rest ? [rest] : []
        continue
      }
    }

    if (currentTitle) currentLines.push(line)
  }

  if (currentTitle || currentLines.length) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  return sections.filter(s => s.content)
}

function deriveReviewState(
  session: ReturnType<typeof useStore.getState>['session'],
  text: string,
  phase: Phase,
): ReviewState {
  if (session?.noTradeMode) return 'blocked'
  if (session?.lockState) return 'blocked'
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : Infinity
  if (session !== null && session.dailyBudget > 0 && dailyBudgetLeft <= 0) return 'blocked'
  if (session && session.maxTrades > 0 && session.tradesOpenedToday >= session.maxTrades) return 'blocked'

  if (phase === 'loading' || phase === 'error' || !text) return 'neutral'

  const lower = text.toLowerCase()
  const verdictMatch = lower.match(/\*\*verdict\*\*:?\s*([^\n]+)/)
  const verdictText = verdictMatch?.[1] ?? ''

  if (verdictText.includes('block') || verdictText.includes('must not') || lower.includes('do not take this trade')) return 'blocked'
  if (verdictText.includes('risk') || verdictText.includes('danger') || lower.includes('risky setup') || lower.includes('high risk')) return 'risky'
  if (verdictText.includes('caution') || verdictText.includes('warning') || lower.includes('use caution')) return 'caution'
  if (verdictText.includes('clean') || verdictText.includes('good') || verdictText.includes('solid')) return 'clean'

  if (lower.includes('risky') || lower.includes('dangerous')) return 'risky'
  if (lower.includes('caution') || lower.includes('warning')) return 'caution'
  if (lower.includes('clean setup') || lower.includes('good setup')) return 'clean'

  return 'neutral'
}

export default function TradeReviewTab({ intentId, direction, symbol, onClose, onReviewState }: Props) {
  const session = useStore(s => s.session)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [activity, setActivity] = useState('Analyzing trade setup…')
  const [reviewText, setReviewText] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)

  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : null
  const dailyBudgetExhausted = session !== null && session.dailyBudget > 0 && (dailyBudgetLeft ?? 0) <= 0
  const dailyBudgetPct = session && session.dailyBudget > 0
    ? Math.min(100, Math.round((dailyLoss / session.dailyBudget) * 100))
    : null

  const chartState: ChartState = (() => {
    if (screenshotDataUrl) return 'ready'
    if (phase === 'error') return 'failed'
    if (phase === 'loading') return 'capturing'
    return 'unavailable'
  })()

  const sections = parseReviewSections(reviewText)

  const isBlocked =
    session?.noTradeMode ||
    !!session?.lockState ||
    dailyBudgetExhausted ||
    (session !== null && session.maxTrades > 0 && session.tradesOpenedToday >= session.maxTrades)

  // Report review state upward whenever the relevant inputs change
  useEffect(() => {
    onReviewState(deriveReviewState(session, reviewText, phase))
  }, [session, reviewText, phase, onReviewState])

  // Port lifecycle
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
        setPhase('error')
      }
    })

    port.onDisconnect.addListener(() => { portRef.current = null })
    port.postMessage({ type: 'TC_TRADE_REVIEW_START', payload: { intentId, direction, symbol } })

    return () => {
      try { port.postMessage({ type: 'TC_TRADE_REVIEW_CANCEL' }) } catch { /* ok */ }
      try { port.disconnect() } catch { /* ok */ }
      portRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto p-3 tc-scrollbar">
        <div className="space-y-3">

          {/* Blocked banner — only when a hard block is active */}
          {isBlocked && (
            <div className="rounded-xl border border-red-500/50 bg-red-950/60 px-3 py-2.5">
              <p className="text-xs font-semibold text-red-200">Execution blocked</p>
              <p className="mt-0.5 text-xs leading-relaxed text-red-300/70">
                {session?.noTradeMode
                  ? (session.noTradeModeReason || 'No Trade Mode is active.')
                  : session?.lockState
                  ? 'Platform account is locked.'
                  : dailyBudgetExhausted
                  ? 'Daily budget is exhausted.'
                  : 'Trade limit reached for today.'}
              </p>
            </div>
          )}

          {/* ── Status pills ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {symbol && <StatusPill>{symbol}</StatusPill>}
            <StatusPill tone={direction === 'long' ? 'buy' : 'sell'}>
              {direction === 'long' ? 'BUY' : 'SELL'}
            </StatusPill>
            {session?.platform && <StatusPill>{session.platform}</StatusPill>}
            {dailyBudgetPct !== null && (
              <StatusPill tone={dailyBudgetPct >= 80 ? 'danger' : dailyBudgetPct >= 50 ? 'warn' : 'neutral'}>
                Budget {dailyBudgetPct}% used
              </StatusPill>
            )}
            {session && session.maxTrades > 0 && (
              <StatusPill tone={session.tradesOpenedToday >= session.maxTrades ? 'danger' : 'neutral'}>
                {session.tradesOpenedToday}/{session.maxTrades} trades
              </StatusPill>
            )}
          </div>

          {/* ── Chart context card ── */}
          <ChartCard chartState={chartState} screenshotDataUrl={screenshotDataUrl} activity={activity} />

          {/* ── AI review card ── */}
          <div className="overflow-hidden rounded-xl border border-tc-border/60" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between border-b border-tc-border/40 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tc-muted">AI Review</span>
              <span className="text-[10px] text-tc-faint">Advisory only</span>
            </div>
            <div className="p-3">
              {phase === 'loading' && (
                <div className="flex items-center gap-2 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tc-green" />
                  <span className="text-xs text-tc-muted">{activity}</span>
                </div>
              )}

              {(phase === 'streaming' || phase === 'ready') && (
                sections.length > 0
                  ? (
                    <div className="space-y-3">
                      {sections.map((section, i) => (
                        <SectionBlock
                          key={i}
                          title={section.title}
                          content={section.content}
                          showCursor={phase === 'streaming' && i === sections.length - 1}
                        />
                      ))}
                    </div>
                  )
                  : (
                    <div className="space-y-1.5">
                      <RawMarkdown text={reviewText} />
                      {phase === 'streaming' && (
                        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-tc-green align-middle" />
                      )}
                    </div>
                  )
              )}

              {phase === 'error' && (
                <p className="text-xs text-tc-muted">Review unavailable. Proceed with your own judgment.</p>
              )}
            </div>
          </div>

          {/* ── Risk check card ── */}
          {session && (
            <div className="overflow-hidden rounded-xl border border-tc-border/60" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="border-b border-tc-border/40 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tc-muted">Risk Check</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-3">
                <RiskRow
                  label="Allowed risk"
                  value={session.riskPerTrade > 0 ? `$${session.riskPerTrade.toFixed(2)}` : 'Not set'}
                />
                <RiskRow
                  label="Budget left"
                  value={dailyBudgetLeft !== null && session.dailyBudget > 0
                    ? `$${dailyBudgetLeft.toFixed(2)}`
                    : '—'}
                  warn={dailyBudgetExhausted}
                />
                <RiskRow
                  label="Trade slots"
                  value={`${session.tradesOpenedToday} / ${session.maxTrades}`}
                  warn={session.maxTrades > 0 && session.tradesOpenedToday >= session.maxTrades}
                />
                <RiskRow
                  label="Balance"
                  value={session.detectedBalance != null
                    ? `$${session.detectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-tc-border/40 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
        >
          Cancel Review
        </button>
        <button
          type="button"
          onClick={() => { void sendToBackground({ type: 'TC_OPEN_SIDE_PANEL' }) }}
          className="rounded-lg px-3 py-1.5 text-xs text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
        >
          Open Side Panel
        </button>
      </div>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChartCard({
  chartState,
  screenshotDataUrl,
  activity,
}: {
  chartState: ChartState
  screenshotDataUrl: string | null
  activity: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-tc-border/60" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tc-muted">Chart Context</span>
        <ChartStateLabel chartState={chartState} />
      </div>

      {chartState === 'ready' && screenshotDataUrl && (
        <img
          src={screenshotDataUrl}
          alt="Captured chart"
          className="w-full object-contain"
          style={{ maxHeight: '200px' }}
        />
      )}

      {chartState === 'capturing' && (
        <div className="flex h-16 items-center justify-center px-3 pb-3">
          <span className="text-[11px] text-tc-faint">{activity}</span>
        </div>
      )}

      {(chartState === 'unavailable' || chartState === 'failed') && (
        <div className="flex h-12 items-center justify-center px-3 pb-3">
          <span className="text-[11px] text-tc-faint">
            {chartState === 'failed' ? 'Chart capture failed' : 'Full page context used'}
          </span>
        </div>
      )}
    </div>
  )
}

function ChartStateLabel({ chartState }: { chartState: ChartState }) {
  if (chartState === 'ready')     return <span className="text-[10px] text-tc-green">● Captured</span>
  if (chartState === 'capturing') return <span className="animate-pulse text-[10px] text-tc-muted">● Capturing…</span>
  if (chartState === 'failed')    return <span className="text-[10px] text-tc-amber">⚠ Failed</span>
  return <span className="text-[10px] text-tc-faint">No capture</span>
}

type PillTone = 'neutral' | 'buy' | 'sell' | 'danger' | 'warn'

function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: PillTone }) {
  const styles: Record<PillTone, string> = {
    neutral: 'bg-white/5 text-tc-muted border-white/10',
    buy:     'bg-tc-green/10 text-tc-green border-tc-green/25',
    sell:    'bg-tc-red/10 text-tc-red border-tc-red/25',
    danger:  'bg-tc-red/10 text-tc-red border-tc-red/25',
    warn:    'bg-tc-amber/10 text-tc-amber border-tc-amber/25',
  }
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${styles[tone]}`}
      style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  )
}

function SectionBlock({ title, content, showCursor }: { title: string; content: string; showCursor: boolean }) {
  const lines = content.split('\n').filter(l => l.trim())
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tc-muted">{title}</p>
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p key={i} className="text-xs leading-relaxed text-tc-text">
            {line}
          </p>
        ))}
        {showCursor && (
          <span className="inline-block h-3 w-0.5 animate-pulse bg-tc-green align-middle" />
        )}
      </div>
    </div>
  )
}

function RawMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return null
        const match = line.match(/^\*\*([^*]+)\*\*(.*)$/)
        if (match) {
          return (
            <p key={i} className="text-xs leading-relaxed">
              <span className="font-semibold text-tc-text">{match[1]}</span>
              <span className="text-tc-muted">{match[2]}</span>
            </p>
          )
        }
        return <p key={i} className="text-xs leading-relaxed text-tc-muted">{line}</p>
      })}
    </div>
  )
}

function RiskRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-tc-faint">{label}</p>
      <p className={`text-xs font-semibold ${warn ? 'text-tc-red' : 'text-tc-text'}`}>{value}</p>
    </div>
  )
}
