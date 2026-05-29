import { GenericAdapter } from './GenericAdapter'
import type { PlatformName } from './types'

export class TradingViewAdapter extends GenericAdapter {
  readonly name: PlatformName = 'tradingview'

  detectSymbol(): string | null {
    return document.querySelector('[data-name="legend-source-title"], [class*="legend"]')?.textContent?.trim() ?? null
  }
}
