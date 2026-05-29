import type { PlatformAdapter, PlatformName } from './types'
import type { DetectedPosition, DetectedClosedTrade } from '../../shared/types/trade'
import { findSemanticOrderButton } from './semanticButtons'
import {
  findSemanticBalance,
  findSemanticEquity,
  findSemanticOpenPositions,
  findSemanticPnL,
  findSemanticSymbol,
} from './semanticValues'

export class GenericAdapter implements PlatformAdapter {
  readonly name: PlatformName = 'generic'

  onPositionOpened: ((p: DetectedPosition) => void) | undefined
  onPositionClosed: ((t: DetectedClosedTrade) => void) | undefined

  private knownIds  = new Set<string>()
  private knownPnls = new Map<string, number>()
  private observer: MutationObserver | null = null

  detectBuyButton():  Element | null { return findSemanticOrderButton('buy')  }
  detectSellButton(): Element | null { return findSemanticOrderButton('sell') }

  detectOpenPositions(): DetectedPosition[] { return findSemanticOpenPositions() }
  detectClosedTrades():  DetectedClosedTrade[] { return [] }

  detectSymbol():         string | null { return findSemanticSymbol()  }
  detectAccountBalance(): number | null { return findSemanticBalance() }
  detectEquity():         number | null { return findSemanticEquity()  }
  detectPnL():            number | null { return findSemanticPnL()     }
  detectOrderSize():      number | null { return null }
  detectStopLoss():       number | null { return null }
  detectTakeProfit():     number | null { return null }

  blockNewOrders(): void {
    for (const btn of [this.detectBuyButton(), this.detectSellButton()]) {
      if (!btn) continue
      const el = btn as HTMLElement
      el.dataset.tcBlocked = 'true'
      el.style.pointerEvents = 'none'
      el.style.opacity = '0.4'
      el.setAttribute('aria-disabled', 'true')
    }
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
  }

  observe(): () => void {
    this.syncPositions()
    this.observer = new MutationObserver(() => this.syncPositions())
    this.observer.observe(document.body, { childList: true, subtree: true })
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
