import { MatchTraderAdapter } from './MatchTraderAdapter'
import { MT5WebAdapter } from './MT5WebAdapter'
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
    case 'mt5_web':
      return new MT5WebAdapter()
    default:
      return new GenericAdapter()
  }
}

export type { PlatformAdapter, PlatformName } from './types'
