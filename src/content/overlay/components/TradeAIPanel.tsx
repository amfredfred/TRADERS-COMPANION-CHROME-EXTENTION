import { useEffect, useRef, useState } from 'react'
import TradeReviewTab from './TradeReviewTab'
import TradeChatTab from './TradeChatTab'

interface Props {
  intentId: string
  direction: 'long' | 'short'
  symbol: string | null
  onClose: () => void
}

type PanelTab = 'review' | 'chat'

interface PanelPosition {
  x: number
  y: number
}

const STORAGE_KEY = 'tc-trade-panel-pos'
const PANEL_WIDTH = 420
const VIEWPORT_MARGIN = 8

/** True when the viewport is narrow enough to treat as mobile (≤ 768 px). */
function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 768
}

/** Load a persisted position from localStorage, validating it is on-screen. */
function loadSavedPosition(): PanelPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw) as PanelPosition
    if (
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number' ||
      pos.x < 0 || pos.x > window.innerWidth ||
      pos.y < 0 || pos.y > window.innerHeight
    ) return null
    return pos
  } catch {
    return null
  }
}

/**
 * Dockable + draggable AI Trade Panel.
 *
 * • Desktop: starts bottom-right, freely draggable by the header.
 * • Mobile:  stays bottom-docked; dragging disabled.
 * • Both tabs always mounted so the review stream survives collapse/expand.
 */
export default function TradeAIPanel({ intentId, direction, symbol, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('review')
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)

  // null → use default right/bottom CSS; otherwise explicit left/top.
  const [position, setPosition] = useState<PanelPosition | null>(() =>
    isMobileViewport() ? null : loadSavedPosition()
  )

  const panelRef = useRef<HTMLDivElement>(null)
  // Keeps the latest position accessible inside mousemove/mouseup closures.
  const positionRef = useRef(position)
  useEffect(() => { positionRef.current = position }, [position])

  // ── Drag logic ────────────────────────────────────────────────────────────

  function handleHeaderMouseDown(e: React.MouseEvent<HTMLElement>) {
    // No drag on mobile.
    if (isMobileViewport()) return
    // Only drag on the header itself — skip buttons, tabs, inputs, links.
    if ((e.target as Element).closest('button, input, textarea, select, a')) return
    // Only primary mouse button.
    if (e.button !== 0) return

    e.preventDefault()

    const rect = panelRef.current?.getBoundingClientRect()
    const startPanelX = rect?.left ?? (window.innerWidth - PANEL_WIDTH - 16)
    const startPanelY = rect?.top  ?? (window.innerHeight - 560 - 16)
    const startMouseX = e.clientX
    const startMouseY = e.clientY

    setDragging(true)
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      const rawX = startPanelX + (ev.clientX - startMouseX)
      const rawY = startPanelY + (ev.clientY - startMouseY)
      const panelW = panelRef.current?.offsetWidth  ?? PANEL_WIDTH
      const panelH = panelRef.current?.offsetHeight ?? 60
      const clampedX = Math.max(VIEWPORT_MARGIN, Math.min(rawX, window.innerWidth  - panelW - VIEWPORT_MARGIN))
      const clampedY = Math.max(VIEWPORT_MARGIN, Math.min(rawY, window.innerHeight - panelH - VIEWPORT_MARGIN))
      setPosition({ x: clampedX, y: clampedY })
    }

    function onMouseUp() {
      setDragging(false)
      document.body.style.userSelect = ''
      // Persist final position.
      const pos = positionRef.current
      if (pos) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* ok */ }
      }
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
  }

  // ── Position style ────────────────────────────────────────────────────────

  const mobile = isMobileViewport()

  // On mobile or before any drag: default right/bottom dock.
  // After dragging: switch to explicit left/top so CSS right/bottom don't fight.
  const positionStyle: React.CSSProperties =
    mobile || !position
      ? { right: '16px', bottom: '16px' }
      : { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }

  const maxHeightStyle = mobile
    ? { maxHeight: '70vh' }
    : { maxHeight: 'min(560px, calc(100vh - 120px))' }

  const dirLabel = direction === 'long' ? 'Buy' : 'Sell'
  const dirColor = direction === 'long' ? 'text-tc-green' : 'text-tc-red'

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        width: mobile ? '100%' : 'min(420px, calc(100vw - 32px))',
        zIndex: 2147483645,
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        ...positionStyle,
      }}
    >
      <div
        ref={panelRef}
        className="flex flex-col overflow-hidden rounded-2xl border border-tc-border bg-tc-panel"
        style={{
          boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.2)',
          ...maxHeightStyle,
        }}
      >

        {/* ── Header — drag handle ───────────────────────────────────────────── */}
        <header
          onMouseDown={handleHeaderMouseDown}
          className={`flex flex-shrink-0 items-center gap-2 border-b border-tc-border/60 px-4 py-3 select-none ${
            mobile ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Direction label */}
          <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>

          {symbol && (
            <span className="text-sm text-tc-muted">· {symbol}</span>
          )}

          {/* Tab switcher — pointer-events unaffected by the drag handle */}
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

          {/* Collapse / Expand */}
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

        {/* ── Tab bodies — always mounted, display:none when collapsed ────────── */}
        {/*
          `hidden` (display:none) removes the div from flex layout so the panel
          collapses to header height, while React keeps both tab components
          mounted — the review port keeps streaming and chat state is preserved.
        */}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${collapsed ? 'hidden' : ''}`}
        >
          {/* Review tab */}
          <div className={`flex min-h-0 flex-1 flex-col ${activeTab === 'review' ? '' : 'hidden'}`}>
            <TradeReviewTab
              intentId={intentId}
              direction={direction}
              symbol={symbol}
            />
          </div>

          {/* Chat tab */}
          <div className={`flex min-h-0 flex-1 flex-col ${activeTab === 'chat' ? '' : 'hidden'}`}>
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
