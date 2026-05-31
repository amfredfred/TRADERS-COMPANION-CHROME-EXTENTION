import type { PlatformAdapter, PlatformName } from './types'
import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'
import type { DetectedAccount } from '../../shared/types/platform'
import { findSemanticOrderButton } from './semanticButtons'
import { findBestBalanceCandidate, findSemanticAccount } from './semanticValues'

// Match Trader Web selectors.
// These are derived from the public Match Trader WebApp DOM structure.
// Refinable via browser inspection of app.matchtraderweb.com.
const SEL = {
  buyButton:        '[data-testid="order-panel-buy-button"], [side="buy"], .ui-order-button--buy, [data-e2e="buy-button"], [class*="order-buy"]',
  sellButton:       '[data-testid="order-panel-sell-button"], [side="sell"], .ui-order-button--sell, [data-e2e="sell-button"], [class*="order-sell"]',
  positionsTable:   '[data-e2e="positions-table"], .positions-table, [class*="positionsTable"]',
  positionRow:      '[data-e2e="position-row"], [class*="positionRow"], [data-position-id]',
  positionId:       'data-position-id',
  positionSymbol:   '[class*="symbol"], [data-e2e="position-symbol"]',
  positionSide:     '[class*="side"], [data-e2e="position-side"]',
  positionPnl:      '[class*="pnl"], [class*="profit"], [data-e2e="position-pnl"]',
  positionSize:     '[class*="volume"], [class*="size"], [data-e2e="position-size"]',
  // Fund bar — real data-testid attributes from the header DOM
  profit:           '[data-testid="profitItem"] [data-testid="ui-suffix"]',
  equity:           '[data-testid="equity"] [data-testid="ui-suffix"]',
  freeFunds:        '[data-testid="freeFunds"] [data-testid="ui-suffix"]',
  margin:           '[data-testid="margin"] [data-testid="ui-suffix"]',
  // Presence checks (the fund-item elements themselves, not the value)
  equityItem:       '[data-testid="equity"]',
  // Order form
  orderVolume:      'input[data-e2e="volume-input"], input[name="volume"], input[class*="volumeInput"]',
  orderSl:          'input[data-e2e="sl-input"], input[name="sl"], input[class*="slInput"]',
  orderTp:          'input[data-e2e="tp-input"], input[name="tp"], input[class*="tpInput"]',
  activeSymbol:     '[data-testid="header-symbol"], [data-e2e="active-instrument"], [class*="instrumentName"]',
  closeButtons:     '[data-e2e="close-position"], [class*="closePosition"], button[class*="close"]',
} as const

// Parse values like "4.99k", "1.23m", "0.00" — ignores currency/% suffix in <sup>
export class MatchTraderAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'match_trader'

  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  private knownIds = new Set<string>()
  private knownPnls = new Map<string, number>()
  private observer: MutationObserver | null = null

  detectBuyButton(): Element | null {
    return document.querySelector(SEL.buyButton) ?? findSemanticOrderButton('buy')
  }

  detectSellButton(): Element | null {
    return document.querySelector(SEL.sellButton) ?? findSemanticOrderButton('sell')
  }

  detectOpenPositions(): DetectedPosition[] {
    const rows = document.querySelectorAll(SEL.positionRow)
    const positions: DetectedPosition[] = []
    rows.forEach(row => {
      const id = row.getAttribute(SEL.positionId)
        ?? row.getAttribute('data-id')
        ?? row.getAttribute('id')
        ?? `pos-${positions.length}`

      const symbol = row.querySelector(SEL.positionSymbol)?.textContent?.trim()
      if (!symbol) return

      const sideRaw = row.querySelector(SEL.positionSide)?.textContent?.trim()?.toLowerCase() ?? ''
      const direction = sideRaw.includes('sell') || sideRaw.includes('short') ? 'short' : 'long'

      const pnlRaw = row.querySelector(SEL.positionPnl)?.textContent?.trim() ?? ''
      const pnl = parseFloat(pnlRaw.replace(/[^-\d.]/g, '')) || undefined

      const sizeRaw = row.querySelector(SEL.positionSize)?.textContent?.trim() ?? ''
      const size = parseFloat(sizeRaw.replace(/[^-\d.]/g, '')) || 0

      positions.push({ id, symbol, direction, size, pnl })
    })
    return positions
  }

  detectClosedTrades(): DetectedClosedTrade[] {
    // Closed trades are surfaced via the onPositionClosed callback during observation
    return []
  }

  detectSymbol(): string | null {
    return document.querySelector(SEL.activeSymbol)?.textContent?.trim() ?? null
  }

  detectAccountBalance(): number | null {
    // No separate balance field — equity is the closest proxy.
    return findBestBalanceCandidate([SEL.equity, SEL.equityItem, SEL.freeFunds])?.parsed ?? null
  }

  detectEquity(): number | null {
    return findBestBalanceCandidate([SEL.equity, SEL.equityItem])?.parsed ?? null
  }

  detectPnL(): number | null {
    const raw = document.querySelector(SEL.profit)?.textContent?.replace(/,/g, '').replace(/[^\d.-]/g, '') ?? ''
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : null
  }

  // Used by registry to warn when equity is not present in the DOM at all
  isFundsBarVisible(): boolean {
    return !!document.querySelector(SEL.equityItem)
  }

  detectOrderSize(): number | null {
    const el = document.querySelector<HTMLInputElement>(SEL.orderVolume)
    return el ? parseFloat(el.value) || null : null
  }

  detectStopLoss(): number | null {
    const el = document.querySelector<HTMLInputElement>(SEL.orderSl)
    return el ? parseFloat(el.value) || null : null
  }

  detectTakeProfit(): number | null {
    const el = document.querySelector<HTMLInputElement>(SEL.orderTp)
    return el ? parseFloat(el.value) || null : null
  }

  detectAccount(): DetectedAccount | null {
    return findSemanticAccount(this.name, this.detectAccountBalance(), this.detectEquity())
  }

  blockNewOrders(): void {
    [this.detectBuyButton(), this.detectSellButton()].forEach(btn => {
      if (!btn) return
      const el = btn as HTMLElement
      el.dataset.tcBlocked = 'true'
      el.style.pointerEvents = 'none'
      el.style.opacity = '0.3'
      el.setAttribute('aria-disabled', 'true')
    })
  }

  unblockNewOrders(): void {
    document.querySelectorAll<HTMLElement>('[data-tc-blocked]').forEach(el => {
      delete el.dataset.tcBlocked
      el.style.pointerEvents = ''
      el.style.opacity = ''
      el.removeAttribute('aria-disabled')
    })
  }

  allowPositionMgmtOnly(): void {
    this.blockNewOrders()
    // Re-enable close/modify controls so the trader can manage risk
    document.querySelectorAll<HTMLElement>(SEL.closeButtons).forEach(el => {
      el.style.pointerEvents = 'auto'
      el.style.opacity = '1'
    })
  }

  observe(): () => void {
    // Initial snapshot
    this.syncPositions()

    const target = document.querySelector(SEL.positionsTable) ?? document.body
    this.observer = new MutationObserver(() => this.syncPositions())
    this.observer.observe(target, { childList: true, subtree: true, characterData: true })

    return () => {
      this.observer?.disconnect()
      this.observer = null
    }
  }

  private syncPositions(): void {
    const current = this.detectOpenPositions()
    const currentIds = new Set(current.map(p => p.id))

    // Detect new openings
    current.forEach(pos => {
      if (!this.knownIds.has(pos.id)) {
        this.knownIds.add(pos.id)
        if (pos.pnl !== undefined) this.knownPnls.set(pos.id, pos.pnl)
        this.onPositionOpened?.(pos)
      }
    })

    // Detect closures
    this.knownIds.forEach(id => {
      if (!currentIds.has(id)) {
        this.knownIds.delete(id)
        const lastPnl = this.knownPnls.get(id) ?? 0
        this.knownPnls.delete(id)
        // Symbol and direction are lost at close — caller should reconcile with trade record
        this.onPositionClosed?.({ id, symbol: '', direction: 'long', pnl: lastPnl })
      }
    })

    // Update PnL tracking
    current.forEach(pos => {
      if (pos.pnl !== undefined) this.knownPnls.set(pos.id, pos.pnl)
    })
  }

}
