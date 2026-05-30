import { useEffect, useRef, useState } from 'react'
import { Card, Input, SectionHeader, Textarea } from '../../../shared/ui'
import { useStore } from '../../../shared/state/store'
import { TC_TRADE_REVIEW_PORT } from '../../../shared/lib/messages'
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
  const [activity, setActivity] = useState('Reviewing…')
  const [reviewText, setReviewText] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [invalidation, setInvalidation] = useState('')
  const [intendedRiskInput, setIntendedRiskInput] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  // ── Session advisory data ────────────────────────────────────────────────────
  const riskLimit = session?.riskPerTrade ?? 0
  const dailyLoss = Math.abs(Math.min(0, session?.dailyPnl ?? 0))
  const dailyBudgetLeft = session ? Math.max(0, session.dailyBudget - dailyLoss) : Infinity
  const dailyBudgetExhausted = session !== null && session.dailyBudget > 0 && dailyBudgetLeft <= 0

  // Advisory session status — warnings only, never block execution
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

  // Extract **Quality:** label for collapsed-state summary
  const qualityMatch = reviewText.match(/\*\*Quality:\*\*\s*\[?([^\]\n.—,]+)/)
  const qualityLabel = qualityMatch?.[1]?.trim() ?? null

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

  const dirLabel = direction === 'long' ? 'Buy' : 'Sell'
  const dirColor = direction === 'long' ? 'text-tc-green' : 'text-tc-red'

  // ── Render ───────────────────────────────────────────────────────────────────
  // Floating panel — docked to bottom-right corner.
  // No backdrop, no screen dimming, no pointer-event blocking.
  // The host element already has pointer-events:none; this panel opts back in.
  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: 'min(420px, calc(100vw - 32px))',
        zIndex: 2147483645,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl border border-tc-border bg-tc-panel"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)' }}
      >

        {/* ── Panel header — always visible ────────────────────────────────── */}
        <header className="flex flex-shrink-0 items-center gap-2 px-4 py-3">

          {/* Direction */}
          <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>

          {symbol && (
            <span className="text-sm text-tc-muted">· {symbol}</span>
          )}

          {/* Divider */}
          <span className="text-tc-border">·</span>

          {/* Expanded: title / Collapsed: quality summary */}
          {collapsed ? (
            <span className="min-w-0 flex-1 truncate text-xs text-tc-muted">
              {qualityLabel
                ? qualityLabel
                : phase === 'loading'
                  ? 'Reviewing…'
                  : phase === 'error'
                    ? 'Review unavailable'
                    : 'Trade Review'}
            </span>
          ) : (
            <span className="flex-1 text-sm font-semibold text-tc-text">Trade Review</span>
          )}

          {/* Advisory pill */}
          <span className="flex-shrink-0 rounded-full border border-tc-border px-2 py-0.5 text-[10px] text-tc-faint">
            Advisory
          </span>

          {/* Collapse / Expand toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
          >
            {collapsed ? '↑' : '↓'}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={closeGate}
            title="Close"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
          >
            ✕
          </button>
        </header>

        {/* ── Expanded body ────────────────────────────────────────────────── */}
        {!collapsed && (
          <>
            <div
              className="flex-1 overflow-y-auto p-4 tc-scrollbar"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            >
              <div className="space-y-4">

                {/* Chart screenshot thumbnail */}
                {screenshotDataUrl && (
                  <div className="overflow-hidden rounded-xl border border-tc-border">
                    <img
                      src={screenshotDataUrl}
                      alt="Captured chart"
                      className="w-full object-contain"
                    />
                  </div>
                )}

                {/* ── AI Review ── */}
                <Card>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-tc-muted">
                      AI Review
                    </span>
                    <span className="text-[10px] text-tc-faint">
                      Advisory only · execution is yours
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

                {/* ── Advisory session status ── */}
                <section>
                  <SectionHeader
                    title="Session Status"
                    sub="Advisory — does not block execution."
                  />
                  <div className="mt-3 space-y-2">
                    {checks.map(check => (
                      <div
                        key={check.label}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <CheckIcon pass={check.pass} />
                          <span className="text-sm text-tc-text">{check.label}</span>
                        </div>
                        <span
                          className={`text-xs ${
                            check.pass === false ? 'text-tc-amber' : 'text-tc-muted'
                          }`}
                        >
                          {check.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ── Optional trade notes ── */}
                <section className="space-y-3">
                  <SectionHeader
                    title="Trade Notes"
                    sub="Optional — improves discipline tracking."
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

                {/* Budget exhausted notice — shown only to give context */}
                {dailyBudgetExhausted && (
                  <Card tone="danger" padding="sm">
                    <p className="text-sm font-semibold text-tc-red">Daily budget exhausted</p>
                    <p className="mt-1 text-xs text-tc-muted">
                      Loss of ${session!.dailyBudget.toFixed(2)} reached.
                      Execution was blocked before this trade reached the broker.
                    </p>
                  </Card>
                )}

              </div>
            </div>

            {/* Minimal footer — advisory label only, no execution buttons */}
            <div className="flex-shrink-0 border-t border-tc-border px-4 py-2">
              <p className="text-center text-[11px] text-tc-faint">
                Advisory review · execution is yours
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Internal components ────────────────────────────────────────────────────────

function CheckIcon({ pass }: { pass: boolean | null }) {
  if (pass === null) {
    return <span className="inline-block h-3 w-3 rounded-full border border-tc-border" />
  }
  if (pass) {
    return <span className="text-[11px] font-bold leading-none text-tc-green">✓</span>
  }
  // Warning — advisory, not a hard block
  return <span className="text-[11px] font-bold leading-none text-tc-amber">⚠</span>
}

/**
 * Renders the AI review text, converting **Label:** lines into styled rows.
 * Handles partial streaming text gracefully — incomplete lines render as plain text.
 */
function ReviewMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return null
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
