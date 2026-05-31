import type { PlatformAdapter, PlatformName } from './types'
import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'
import { findSemanticOrderButton } from './semanticButtons'
import { findBestBalanceCandidate } from './semanticValues'

// MT5 WebTerminal selectors.
// Covers web.metatrader.app (Svelte build) and trade.mql5.com white-labels.
// Title attributes are the most stable hook on the Svelte DOM; class fallbacks
// catch white-label builds that may not have Svelte hashes.
const SEL = {
  // Order panel buy/sell
  buyButton: [
    'button.trade-button:not(.red)',  // web.metatrader.app Svelte order panel
    'button[title="Quick BUY"]',
    'button.button.buy',
    'button.buy',
    '.buy-button',
    '[class*="buyButton"]',
    '[data-action="buy"]',
    '.terminal-button-buy',
  ].join(', '),

  sellButton: [
    'button.trade-button.red',        // web.metatrader.app Svelte order panel
    'button[title="Quick SELL"]',
    'button.button.sell',
    'button.sell',
    '.sell-button',
    '[class*="sellButton"]',
    '[data-action="sell"]',
    '.terminal-button-sell',
  ].join(', '),

  // Positions / open trades section (Terminal → Trade tab)
  positionsContainer: [
    '.terminal-trade',
    '[class*="terminalTrade"]',
    '[class*="tradeTab"]',
    '[id*="trade"]',
    '.positions-list',
  ].join(', '),

  positionRow: [
    '[class*="position-row"]',
    '[class*="positionRow"]',
    '[class*="tradeRow"]',
    'tr[data-id]',
    '.terminal-trade-row',
  ].join(', '),

  positionId:     'data-id',

  positionSymbol: [
    '[class*="symbol"]',
    '[class*="instrument"]',
    'td.symbol',
    '.trade-symbol',
  ].join(', '),

  positionSide: [
    '[class*="type"]',
    '[class*="direction"]',
    '[class*="side"]',
    'td.type',
  ].join(', '),

  positionPnl: [
    '[class*="profit"]',
    '[class*="pnl"]',
    '[class*="Profit"]',
    'td.profit',
  ].join(', '),

  positionSize: [
    '[class*="volume"]',
    '[class*="lots"]',
    'td.volume',
  ].join(', '),

  // Account info bar
  accountBalance: [
    '[class*="balance"]',
    '.account-balance',
    '[id*="balance"]',
  ].join(', '),

  accountEquity: [
    '[class*="equity"]',
    '.account-equity',
    '[id*="equity"]',
  ].join(', '),

  floatingPnl: [
    '[class*="floating"]',
    '[class*="unrealized"]',
  ].join(', '),

  // Order form inputs
  orderVolume: 'div.volume input[type="text"], div.volume input[inputmode="decimal"], .number-input input, input[name="volume"], input[class*="volume"], input[id*="volume"], input[class*="lot"]',
  orderSl:     'input[name="sl"], input[class*="stop-loss"], input[id*="sl"]',
  orderTp:     'input[name="tp"], input[class*="take-profit"], input[id*="tp"]',

  // Active chart symbol
  activeSymbol: [
    '[class*="symbol-name"]',
    '[class*="active-symbol"]',
    '[class*="currentSymbol"]',
    '.chart-symbol',
    '#symbol',
  ].join(', '),

  // Close position controls
  closeButtons: [
    '[class*="close-position"]',
    '[class*="closePosition"]',
    'button[data-action="close"]',
    '.close-trade',
  ].join(', '),
} as const

export class MT5WebAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'mt5_web'

  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  private knownIds   = new Set<string>()
  private knownPnls  = new Map<string, number>()
  private observer:  MutationObserver | null = null

  detectBuyButton():  Element | null { return document.querySelector(SEL.buyButton)  ?? findSemanticOrderButton('buy')  }
  detectSellButton(): Element | null { return document.querySelector(SEL.sellButton) ?? findSemanticOrderButton('sell') }

  detectOpenPositions(): DetectedPosition[] {
    const rows = document.querySelectorAll(SEL.positionRow)
    const positions: DetectedPosition[] = []

    rows.forEach(row => {
      const id = row.getAttribute(SEL.positionId)
        ?? row.getAttribute('data-ticket')
        ?? row.getAttribute('id')
        ?? `pos-${positions.length}`

      const symbol = row.querySelector(SEL.positionSymbol)?.textContent?.trim()
      if (!symbol) return

      const sideRaw = row.querySelector(SEL.positionSide)?.textContent?.trim()?.toLowerCase() ?? ''
      const direction = sideRaw.includes('sell') || sideRaw.includes('short') ? 'short' : 'long'

      const pnlRaw = row.querySelector(SEL.positionPnl)?.textContent?.trim() ?? ''
      const pnl    = parseFloat(pnlRaw.replace(/[^-\d.]/g, '')) || undefined

      const sizeRaw = row.querySelector(SEL.positionSize)?.textContent?.trim() ?? ''
      const size    = parseFloat(sizeRaw.replace(/[^-\d.]/g, '')) || 0

      positions.push({ id, symbol, direction, size, pnl })
    })

    return positions
  }

  detectClosedTrades(): DetectedClosedTrade[] { return [] }

  detectSymbol(): string | null {
    return document.querySelector(SEL.activeSymbol)?.textContent?.trim() ?? null
  }

  detectAccountBalance(): number | null { return findBestBalanceCandidate([SEL.accountBalance, SEL.accountEquity])?.parsed ?? null }
  detectEquity():         number | null { return findBestBalanceCandidate([SEL.accountEquity, SEL.accountBalance])?.parsed ?? null }
  detectPnL():            number | null {
    const raw = document.querySelector(SEL.floatingPnl)?.textContent?.replace(/,/g, '').replace(/[^\d.-]/g, '') ?? ''
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : null
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
    document.querySelectorAll<HTMLElement>(SEL.closeButtons).forEach(el => {
      el.style.pointerEvents = 'auto'
      el.style.opacity = '1'
    })
  }

  observe(): () => void {
    this.syncPositions()

    const target = document.querySelector(SEL.positionsContainer) ?? document.body
    this.observer = new MutationObserver(() => this.syncPositions())
    this.observer.observe(target, { childList: true, subtree: true, characterData: true })

    return () => {
      this.observer?.disconnect()
      this.observer = null
    }
  }

  private syncPositions(): void {
    const current    = this.detectOpenPositions()
    const currentIds = new Set(current.map(p => p.id))

    current.forEach(pos => {
      if (!this.knownIds.has(pos.id)) {
        this.knownIds.add(pos.id)
        if (pos.pnl !== undefined) this.knownPnls.set(pos.id, pos.pnl)
        this.onPositionOpened?.(pos)
      }
    })

    this.knownIds.forEach(id => {
      if (!currentIds.has(id)) {
        this.knownIds.delete(id)
        const lastPnl = this.knownPnls.get(id) ?? 0
        this.knownPnls.delete(id)
        this.onPositionClosed?.({ id, symbol: '', direction: 'long', pnl: lastPnl })
      }
    })

    current.forEach(pos => {
      if (pos.pnl !== undefined) this.knownPnls.set(pos.id, pos.pnl)
    })
  }

}
