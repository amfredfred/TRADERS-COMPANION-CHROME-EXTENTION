import type { PlatformName } from './types'

export interface DetectionResult {
  platform: PlatformName
  confidence: 'high' | 'medium' | 'low'
  signals: string[]
}

// ── Signal definitions per platform ──────────────────────────────────────────
// Each signal is a lightweight DOM check. We score how many fire, then decide.
// Signals should never throw — all wrapped defensively.

const MATCH_TRADER_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  // JS globals Match Trader exposes
  { name: 'global:MatchTrader',    check: () => typeof ((window as unknown) as Record<string, unknown>).MatchTrader !== 'undefined' },
  { name: 'global:MTV',            check: () => typeof ((window as unknown) as Record<string, unknown>).MTV !== 'undefined' },
  { name: 'global:matchTrader',    check: () => typeof ((window as unknown) as Record<string, unknown>).matchTrader !== 'undefined' },

  // data-e2e attributes Match Trader uses for QA — very specific
  { name: 'dom:data-e2e-buy',      check: () => !!document.querySelector('[data-e2e="buy-button"]') },
  { name: 'dom:data-e2e-sell',     check: () => !!document.querySelector('[data-e2e="sell-button"]') },
  { name: 'dom:data-e2e-pos',      check: () => !!document.querySelector('[data-e2e="positions-table"]') },
  { name: 'dom:data-e2e-balance',  check: () => !!document.querySelector('[data-e2e="balance"]') },

  // CSS class fragments from Match Trader's component library
  { name: 'dom:class-buyButton',   check: () => !!document.querySelector('[class*="buyButton"]') },
  { name: 'dom:class-sellButton',  check: () => !!document.querySelector('[class*="sellButton"]') },
  { name: 'dom:class-orderPanel',  check: () => !!document.querySelector('[class*="orderPanel"], [class*="OrderPanel"]') },
  { name: 'dom:class-positionsTable', check: () => !!document.querySelector('[class*="positionsTable"], [class*="PositionsTable"]') },
  { name: 'dom:class-instrumentList', check: () => !!document.querySelector('[class*="instrumentList"], [class*="InstrumentList"]') },
  { name: 'dom:class-accountBalance', check: () => !!document.querySelector('[class*="accountBalance"], [class*="AccountBalance"]') },
  { name: 'dom:class-tradingPanel',   check: () => !!document.querySelector('[class*="tradingPanel"], [class*="TradingPanel"]') },

  // Meta / title hints
  { name: 'meta:matchtrader-title', check: () => /match\s*trader/i.test(document.title) },
  { name: 'meta:matchtrader-meta',  check: () => !!document.querySelector('meta[content*="MatchTrader"]') },

  // Hostname fallback (weakest signal — white-labels won't fire this)
  { name: 'host:matchtraderweb',   check: () => /matchtraderweb\.com|matchtrader/i.test(window.location.hostname) },
]

const MT5_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  // JS globals the MT5 WebTerminal or its wrapper exposes
  { name: 'global:MetaTrader',       check: () => typeof ((window as unknown) as Record<string, unknown>).MetaTrader !== 'undefined' },
  { name: 'global:MetaTrader5',      check: () => typeof ((window as unknown) as Record<string, unknown>).MetaTrader5 !== 'undefined' },
  { name: 'global:MT5',              check: () => typeof ((window as unknown) as Record<string, unknown>).MT5 !== 'undefined' },
  { name: 'global:terminal',         check: () => typeof ((window as unknown) as Record<string, unknown>).terminal !== 'undefined' && !!(((window as unknown) as Record<string, unknown>).terminal as Record<string, unknown>)?.Build },

  // web.metatrader.app Svelte DOM — title attributes are the stable hook
  { name: 'dom:mt5-quickbuy',        check: () => !!document.querySelector('button[title="Quick BUY"]') },
  { name: 'dom:mt5-quicksell',       check: () => !!document.querySelector('button[title="Quick SELL"]') },
  { name: 'dom:mt5-buybtn',          check: () => !!document.querySelector('button.button.buy') },
  { name: 'dom:mt5-sellbtn',         check: () => !!document.querySelector('button.button.sell') },
  { name: 'dom:mt5-volume-input',    check: () => !!document.querySelector('div.volume input[inputmode="decimal"]') },

  // MT5 WebTerminal DOM landmarks (trade.mql5.com and white-labels)
  { name: 'dom:mt5-id',              check: () => !!document.querySelector('#mt5-terminal, #metatrader5, #mt5') },
  { name: 'dom:mt5-class',           check: () => !!document.querySelector('[class*="mt5"], [class*="metatrader"]') },
  { name: 'dom:terminal-trade',      check: () => !!document.querySelector('.terminal-trade, [class*="terminalTrade"]') },
  { name: 'dom:terminal-buy',        check: () => !!document.querySelector('.terminal-button-buy, [class*="terminalBuy"]') },
  { name: 'dom:terminal-sell',       check: () => !!document.querySelector('.terminal-button-sell, [class*="terminalSell"]') },
  { name: 'dom:market-watch',        check: () => !!document.querySelector('[class*="marketWatch"], [class*="MarketWatch"], #marketwatch') },
  { name: 'dom:chart-container',     check: () => !!document.querySelector('[class*="chartContainer"], [class*="ChartContainer"], .chart-area') },
  { name: 'dom:trade-tab',           check: () => !!document.querySelector('[data-tab="trade"], [class*="tradeTab"], [id*="tradeTab"]') },
  { name: 'dom:account-bar',         check: () => !!document.querySelector('[class*="accountBar"], [class*="AccountBar"], .account-info') },

  // Hostname signals — trade.mql5.com is canonical, white-labels won't fire these
  { name: 'host:mql5',               check: () => /mql5\.com/i.test(window.location.hostname) },
  { name: 'host:metatrader',         check: () => /metatrader/i.test(window.location.hostname) },
]

const TRADINGVIEW_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  { name: 'global:TradingView',    check: () => typeof ((window as unknown) as Record<string, unknown>).TradingView !== 'undefined' },
  { name: 'dom:tv-chart',          check: () => !!document.querySelector('.tv-lightweight-charts, [class*="chart-container"]') },
  { name: 'host:tradingview',      check: () => /tradingview\.com/i.test(window.location.hostname) },
]

const CTRADER_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  { name: 'global:ctrader',        check: () => typeof ((window as unknown) as Record<string, unknown>).ctrader !== 'undefined' },
  { name: 'dom:ctrader-class',     check: () => !!document.querySelector('[class*="ctrader"], [id*="ctrader"]') },
  { name: 'host:ctrader',          check: () => /ctrader\.com/i.test(window.location.hostname) },
]

// ── Scoring ───────────────────────────────────────────────────────────────────

function score(signals: Array<{ name: string; check: () => boolean }>): { count: number; fired: string[] } {
  const fired: string[] = []
  for (const s of signals) {
    try {
      if (s.check()) fired.push(s.name)
    } catch {
      // swallow — never crash on a detection probe
    }
  }
  return { count: fired.length, fired }
}

function toConfidence(count: number, total: number): 'high' | 'medium' | 'low' {
  const ratio = count / total
  if (ratio >= 0.4 || count >= 4) return 'high'
  if (ratio >= 0.2 || count >= 2) return 'medium'
  return 'low'
}

// ── Public API ────────────────────────────────────────────────────────────────

export function detectPlatform(): DetectionResult {
  const mt   = score(MATCH_TRADER_SIGNALS)
  const mt5  = score(MT5_SIGNALS)
  const tv   = score(TRADINGVIEW_SIGNALS)
  const ct   = score(CTRADER_SIGNALS)

  const candidates = [
    { platform: 'match_trader' as PlatformName, count: mt.count,  fired: mt.fired,  total: MATCH_TRADER_SIGNALS.length },
    { platform: 'mt5_web'      as PlatformName, count: mt5.count, fired: mt5.fired, total: MT5_SIGNALS.length },
    { platform: 'tradingview'  as PlatformName, count: tv.count,  fired: tv.fired,  total: TRADINGVIEW_SIGNALS.length },
    { platform: 'ctrader'      as PlatformName, count: ct.count,  fired: ct.fired,  total: CTRADER_SIGNALS.length },
  ].sort((a, b) => b.count - a.count)

  const best = candidates[0]

  if (best.count === 0) {
    return { platform: 'generic', confidence: 'low', signals: [] }
  }

  return {
    platform:   best.platform,
    confidence: toConfidence(best.count, best.total),
    signals:    best.fired,
  }
}

// Run detection after the SPA has had a moment to hydrate
export function detectPlatformDeferred(onResult: (r: DetectionResult) => void, attempts = 5): void {
  let tries = 0
  function attempt() {
    tries++
    const result = detectPlatform()
    if (result.confidence !== 'low' || tries >= attempts) {
      onResult(result)
    } else {
      setTimeout(attempt, 800)
    }
  }
  // First attempt immediately, then deferred if needed
  attempt()
}
