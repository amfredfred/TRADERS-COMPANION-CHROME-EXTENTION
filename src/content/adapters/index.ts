import { MatchTraderAdapter } from './MatchTraderAdapter'
import { GenericAdapter } from './GenericAdapter'
import { detectPlatform } from './detector'
import type { PlatformAdapter } from './types'

export { detectPlatform } from './detector'
export type { DetectionResult } from './detector'

export function detectAdapter(): PlatformAdapter {
  const result = detectPlatform()

  console.info(`[TC] Platform detection: ${result.platform} (${result.confidence}) — signals: ${result.signals.join(', ') || 'none'}`)

  switch (result.platform) {
    case 'match_trader':
      return new MatchTraderAdapter()
    // mt5_web, tradingview, ctrader adapters added in V1
    default:
      if (result.confidence === 'low') {
        console.info('[TC] No platform recognised — Manual Companion Mode')
      }
      return new GenericAdapter()
  }
}

export type { PlatformAdapter, PlatformName } from './types'
