import type { PlatformAdapter, PlatformName } from './types'
import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'

// Fallback adapter for unsupported platforms.
// Switches TC into Manual Companion Mode — no automated blocking,
// but the gate, journal, and HUD still work when triggered manually.
export class GenericAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'generic'

  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  detectBuyButton(): Element | null { return null }
  detectSellButton(): Element | null { return null }
  detectOpenPositions(): DetectedPosition[] { return [] }
  detectClosedTrades(): DetectedClosedTrade[] { return [] }
  detectSymbol(): string | null { return null }
  detectAccountBalance(): number | null { return null }
  detectEquity(): number | null { return null }
  detectPnL(): number | null { return null }
  detectOrderSize(): number | null { return null }
  detectStopLoss(): number | null { return null }
  detectTakeProfit(): number | null { return null }
  blockNewOrders(): void { /* no-op in manual mode */ }
  unblockNewOrders(): void { /* no-op in manual mode */ }
  allowPositionMgmtOnly(): void { /* no-op in manual mode */ }

  observe(): () => void {
    console.info('[TC] Manual Companion Mode — platform not fully supported. Use the TC button to log trades manually.')
    return () => { /* nothing to clean up */ }
  }
}
