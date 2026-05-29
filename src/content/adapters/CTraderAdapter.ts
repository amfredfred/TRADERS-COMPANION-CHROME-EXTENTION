import { GenericAdapter } from './GenericAdapter'
import type { PlatformName } from './types'

export class CTraderAdapter extends GenericAdapter {
  readonly name: PlatformName = 'ctrader'

  detectSymbol(): string | null {
    return document.querySelector('[class*="symbol"], [class*="instrument"]')?.textContent?.trim() ?? null
  }
}
