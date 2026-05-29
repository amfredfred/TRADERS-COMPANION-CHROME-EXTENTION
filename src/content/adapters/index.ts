import { MatchTraderAdapter } from './MatchTraderAdapter'
import { GenericAdapter } from './GenericAdapter'
import type { PlatformAdapter } from './types'

export function detectAdapter(): PlatformAdapter {
  if (MatchTraderAdapter.canActivate()) {
    console.info('[TC] Match Trader detected — full adapter active')
    return new MatchTraderAdapter()
  }

  console.info('[TC] Platform not recognised — Manual Companion Mode')
  return new GenericAdapter()
}

export type { PlatformAdapter, PlatformName } from './types'
