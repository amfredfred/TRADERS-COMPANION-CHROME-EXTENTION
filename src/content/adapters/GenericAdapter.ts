import type { PlatformAdapter, PlatformName } from './types'
import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'
import { findSemanticOrderButton } from './semanticButtons'

// Fallback adapter for unrecognised platforms.
// Uses semantic DOM scanning to find Buy/Sell buttons by text + price
// co-location, so order interception works without hardcoded selectors.
export class GenericAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'generic'

  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  detectBuyButton(): Element | null { return findSemanticOrderButton('buy') }
  detectSellButton(): Element | null { return findSemanticOrderButton('sell') }
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
