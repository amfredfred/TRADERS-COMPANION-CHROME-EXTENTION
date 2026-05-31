import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { sendToBackground } from '../../../shared/lib/messages'
import TradeReviewTab, { type ReviewState } from './TradeReviewTab'
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

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 768
}

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

// State-based panel background / border / shadow
function getPanelStateStyle(state: ReviewState): React.CSSProperties {
  switch (state) {
    case 'clean':
      return {
        background: 'rgba(2,44,28,0.42)',
        borderColor: 'rgba(52,211,153,0.30)',
        boxShadow: '0 4px 32px rgba(2,44,28,0.22), 0 1px 6px rgba(0,0,0,0.22)',
      }
    case 'caution':
      return {
        background: 'rgba(69,26,3,0.42)',
        borderColor: 'rgba(245,158,11,0.30)',
        boxShadow: '0 4px 32px rgba(69,26,3,0.22), 0 1px 6px rgba(0,0,0,0.22)',
      }
    case 'risky':
      return {
        background: 'rgba(80,7,7,0.58)',
        borderColor: 'rgba(239,68,68,0.42)',
        boxShadow: '0 4px 32px rgba(80,7,7,0.32), 0 1px 6px rgba(0,0,0,0.22)',
      }
    case 'blocked':
      return {
        background: 'rgba(80,7,7,0.78)',
        borderColor: 'rgba(239,68,68,0.62)',
        boxShadow: '0 4px 32px rgba(80,7,7,0.42), 0 1px 6px rgba(0,0,0,0.22)',
      }
    default:
      return {
        background: 'rgba(10,10,15,0.88)',
        borderColor: 'rgba(255,255,255,0.10)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.22)',
      }
  }
}

const reviewStateLabel: Record<ReviewState, string> = {
  neutral: 'Reviewing',
  clean:   'Clean Setup',
  caution: 'Caution',
  risky:   'Risky Setup',
  blocked: 'Blocked',
}

const reviewStateLabelColor: Record<ReviewState, string> = {
  neutral: 'text-tc-muted',
  clean:   'text-emerald-400',
  caution: 'text-amber-400',
  risky:   'text-red-400',
  blocked: 'text-red-300',
}

/**
 * Dockable + draggable AI Trade Panel.
 *
 * Desktop: starts bottom-right, freely draggable by the header.
 * Mobile:  stays bottom-docked; dragging disabled.
 * Both tabs always mounted so the review stream survives collapse/expand.
 */
export default function TradeAIPanel({ intentId, direction, symbol, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('review')
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [reviewState, setReviewState] = useState<ReviewState>('neutral')

  const [position, setPosition] = useState<PanelPosition | null>(() =>
    isMobileViewport() ? null : loadSavedPosition()
  )

  const panelRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(position)
  useEffect(() => { positionRef.current = position }, [position])

  const handleReviewState = useCallback((state: ReviewState) => {
    setReviewState(state)
  }, [])

  // ── Drag logic ────────────────────────────────────────────────────────────

  function handleHeaderMouseDown(e: React.MouseEvent<HTMLElement>) {
    if (isMobileViewport()) return
    if ((e.target as Element).closest('button, input, textarea, select, a')) return
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

  const positionStyle: React.CSSProperties =
    mobile || !position
      ? { right: '16px', bottom: '16px' }
      : { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }

  const maxHeightStyle = mobile
    ? { maxHeight: '70vh' }
    : { maxHeight: 'min(600px, calc(100vh - 32px))' }

  const dirLabel = direction === 'long' ? 'Buy' : 'Sell'
  const dirColor = direction === 'long' ? 'text-tc-green' : 'text-tc-red'

  const panelStateStyle = getPanelStateStyle(reviewState)

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
        className="flex flex-col overflow-hidden rounded-2xl border"
        style={{
          ...panelStateStyle,
          ...maxHeightStyle,
          transition: 'background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease',
        }}
      >

        {/* ── Header — drag handle ───────────────────────────────────────────── */}
        <header
          onMouseDown={handleHeaderMouseDown}
          className={`flex flex-shrink-0 items-center gap-2 border-b px-4 py-3 select-none ${
            mobile ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ borderBottomColor: 'rgba(255,255,255,0.08)' }}
        >
          {/* Direction label */}
          <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>

          {symbol && (
            <span className="text-sm text-tc-muted">· {symbol}</span>
          )}

          {/* Review state — visible when collapsed, showing a quick summary */}
          {collapsed && reviewState !== 'neutral' && (
            <span className={`text-xs font-medium ${reviewStateLabelColor[reviewState]}`}>
              · {reviewStateLabel[reviewState]}
            </span>
          )}

          {/* Tab switcher — hidden when collapsed */}
          {!collapsed && (
            <div className="ml-1 flex items-center gap-0.5 rounded-lg bg-tc-surface px-1 py-0.5">
              <TabButton active={activeTab === 'review'} onClick={() => setActiveTab('review')}>
                Review
              </TabButton>
              <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')}>
                Chat
              </TabButton>
            </div>
          )}

          <div className="flex-1" />

          {/* Open side panel */}
          <button
            type="button"
            onClick={() => { void sendToBackground({ type: 'TC_OPEN_SIDE_PANEL' }) }}
            title="Open Side Panel"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-tc-muted transition-colors hover:bg-white/10 hover:text-tc-text"
          >
            <LayoutDashboard size={14} />
          </button>

          {/* Review state badge — visible when not collapsed */}
          {!collapsed && (
            <span
              className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${reviewStateLabelColor[reviewState]}`}
              style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)' }}
            >
              {reviewStateLabel[reviewState]}
            </span>
          )}

          {/* Collapse / Expand */}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm text-tc-muted transition-colors hover:bg-white/10 hover:text-tc-text"
          >
            {collapsed ? '↑' : '↓'}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm text-tc-muted transition-colors hover:bg-white/10 hover:text-tc-text"
          >
            ✕
          </button>
        </header>

        {/* ── Tab bodies — always mounted, display:none when collapsed ────────── */}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${collapsed ? 'hidden' : ''}`}
        >
          {/* Review tab */}
          <div className={`flex min-h-0 flex-1 flex-col ${activeTab === 'review' ? '' : 'hidden'}`}>
            <TradeReviewTab
              intentId={intentId}
              direction={direction}
              symbol={symbol}
              onClose={onClose}
              onReviewState={handleReviewState}
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
          ? 'bg-white/10 text-tc-text shadow-sm'
          : 'text-tc-muted hover:text-tc-text'
      }`}
    >
      {children}
    </button>
  )
}
