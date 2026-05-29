import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'

export type PlatformName = 'match_trader' | 'mt5_web' | 'tradingview' | 'ctrader' | 'generic'

export interface PlatformAdapter {
  readonly name: PlatformName

  // DOM detection
  detectBuyButton(): Element | null
  detectSellButton(): Element | null
  detectOpenPositions(): DetectedPosition[]
  detectClosedTrades(): DetectedClosedTrade[]
  detectSymbol(): string | null
  detectAccountBalance(): number | null
  detectEquity(): number | null
  detectPnL(): number | null
  detectOrderSize(): number | null
  detectStopLoss(): number | null
  detectTakeProfit(): number | null

  // Order blocking (used by lock overlay)
  blockNewOrders(): void
  unblockNewOrders(): void
  allowPositionMgmtOnly(): void

  // Position monitoring — set callbacks before calling observe()
  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  // Start watching the DOM. Returns a cleanup function.
  observe(): () => void
}
