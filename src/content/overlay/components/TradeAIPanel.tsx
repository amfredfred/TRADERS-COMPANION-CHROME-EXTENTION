import { useState } from 'react'
import TradeReviewTab from './TradeReviewTab'
import TradeChatTab from './TradeChatTab'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
  onClose: () => void
}

type PanelTab = 'review' | 'chat'

/**
 * Dockable AI Trade Panel — floating bottom-right, non-blocking.
 *
 * Two tabs:
 *  • Review — automatic advisory review streamed when the trade click fires.
 *  • Chat   — free-form conversation with the AI about the current trade.
 *
 * Both tabs are always mounted (never unmounted during collapse) so the
 * review stream is preserved when the user collapses and re-expands the panel.
 */
export default function TradeAIPanel({ intentId, direction, symbol, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('review')
  const [collapsed, setCollapsed] = useState(false)

  const dirLabel = direction === 'long' ? 'Buy' : 'Sell'
  const dirColor = direction === 'long' ? 'text-tc-green' : 'text-tc-red'

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
        style={{
          boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
          maxHeight: 'min(560px, calc(100vh - 120px))',
        }}
      >

        {/* ── Panel header — always visible ─────────────────────────────────── */}
        <header className="flex flex-shrink-0 items-center gap-2 border-b border-tc-border/60 px-4 py-3">

          {/* Direction label */}
          <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>

          {symbol && (
            <span className="text-sm text-tc-muted">· {symbol}</span>
          )}

          {/* Tab switcher */}
          <div className="ml-1 flex items-center gap-0.5 rounded-lg bg-tc-surface px-1 py-0.5">
            <TabButton
              active={activeTab === 'review'}
              onClick={() => setActiveTab('review')}
            >
              Review
            </TabButton>
            <TabButton
              active={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
            >
              Chat
            </TabButton>
          </div>

          <div className="flex-1" />

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
            onClick={onClose}
            title="Close"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm text-tc-muted transition-colors hover:bg-tc-surface hover:text-tc-text"
          >
            ✕
          </button>
        </header>

        {/* ── Tab bodies — always mounted, h-0 when collapsed ───────────────── */}
        {/*
          Using h-0 + overflow-hidden (not unmounting) so that:
          - The review port keeps streaming in the background when collapsed.
          - Chat conversation state is preserved across collapse/expand.
        */}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden transition-[height] ${
            collapsed ? 'h-0' : ''
          }`}
        >
          {/* Review tab */}
          <div
            className={`flex min-h-0 flex-1 flex-col ${
              activeTab === 'review' ? '' : 'hidden'
            }`}
          >
            <TradeReviewTab
              intentId={intentId}
              direction={direction}
              symbol={symbol}
            />
          </div>

          {/* Chat tab */}
          <div
            className={`flex min-h-0 flex-1 flex-col ${
              activeTab === 'chat' ? '' : 'hidden'
            }`}
          >
            <TradeChatTab direction={direction} symbol={symbol} />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-tc-panel text-tc-text shadow-sm'
          : 'text-tc-muted hover:text-tc-text'
      }`}
    >
      {children}
    </button>
  )
}
