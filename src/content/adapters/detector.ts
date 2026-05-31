import type { PlatformName } from './types'
import type { TabDetectionState } from '../../shared/types/platform'

export interface DetectionResult {
  platform: PlatformName
  confidence: 'high' | 'medium' | 'low'
  signals: string[]
  state: TabDetectionState
}

// ── Signal definitions per platform ──────────────────────────────────────────
// Each signal is a lightweight DOM check. We score how many fire, then decide.
// Signals should never throw — all wrapped defensively.

const MATCH_TRADER_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  // JS globals Match Trader exposes
  { name: 'global:MatchTrader',    check: () => typeof ((window as unknown) as Record<string, unknown>).MatchTrader !== 'undefined' },
  { name: 'global:MTV',            check: () => typeof ((window as unknown) as Record<string, unknown>).MTV !== 'undefined' },
  { name: 'global:matchTrader',    check: () => typeof ((window as unknown) as Record<string, unknown>).matchTrader !== 'undefined' },

  // data-testid attributes from the real Match-Trader Angular DOM
  { name: 'dom:testid-buy',        check: () => !!document.querySelector('[data-testid="order-panel-buy-button"]') },
  { name: 'dom:testid-sell',       check: () => !!document.querySelector('[data-testid="order-panel-sell-button"]') },
  { name: 'dom:testid-mw-item',    check: () => !!document.querySelector('[data-testid="all-symbols-mw-item"], [data-testid="fullscreen-chart-trade-item"]') },
  { name: 'dom:testid-mw-panel',   check: () => !!document.querySelector('[data-testid="mw-order-panel"]') },

  // CSS classes from the real Match-Trader component library
  { name: 'dom:class-ui-buy',      check: () => !!document.querySelector('.ui-order-button--buy') },
  { name: 'dom:class-ui-sell',     check: () => !!document.querySelector('.ui-order-button--sell') },
  { name: 'dom:class-order-panel', check: () => !!document.querySelector('trade-order-panel, .trade-order-panel') },
  { name: 'dom:class-mw-item',     check: () => !!document.querySelector('trade-market-watch-item') },
  { name: 'dom:class-tradingPanel',   check: () => !!document.querySelector('[class*="tradingPanel"], [class*="TradingPanel"]') },

  // Legacy data-e2e attributes (fallback for older MT builds)
  { name: 'dom:data-e2e-buy',      check: () => !!document.querySelector('[data-e2e="buy-button"]') },
  { name: 'dom:data-e2e-sell',     check: () => !!document.querySelector('[data-e2e="sell-button"]') },

  // Meta / title hints
  { name: 'meta:matchtrader-title', check: () => /match\s*trader/i.test(document.title) },
  { name: 'meta:matchtrader-meta',  check: () => !!document.querySelector('meta[content*="MatchTrader"]') },

  // Hostname fallback — known MatchTrader white-label domains
  { name: 'host:matchtraderweb',   check: () => /matchtraderweb\.com|matchtrader/i.test(window.location.hostname) },
  { name: 'host:maven-markets',    check: () => /maven\.markets/i.test(window.location.hostname) },
]

const MT5_SIGNALS: Array<{ name: string; check: () => boolean }> = [
  // JS globals the MT5 WebTerminal or its wrapper exposes
  { name: 'global:MetaTrader',       check: () => typeof ((window as unknown) as Record<string, unknown>).MetaTrader !== 'undefined' },
  { name: 'global:MetaTrader5',      check: () => typeof ((window as unknown) as Record<string, unknown>).MetaTrader5 !== 'undefined' },
  { name: 'global:MT5',              check: () => typeof ((window as unknown) as Record<string, unknown>).MT5 !== 'undefined' },
  { name: 'global:terminal',         check: () => typeof ((window as unknown) as Record<string, unknown>).terminal !== 'undefined' && !!(((window as unknown) as Record<string, unknown>).terminal as Record<string, unknown>)?.Build },

  // web.metatrader.app Svelte order panel (real DOM)
  { name: 'dom:mt5-buybtn',          check: () => !!document.querySelector('button.trade-button:not(.red)') },
  { name: 'dom:mt5-sellbtn',         check: () => !!document.querySelector('button.trade-button.red') },
  { name: 'dom:mt5-footer-row',      check: () => !!document.querySelector('div.footer-row') },
  { name: 'dom:mt5-volume-input',    check: () => !!document.querySelector('div.volume input[type="text"], div.volume input[inputmode="decimal"]') },

  // Legacy title-attr selectors (older web.metatrader.app builds)
  { name: 'dom:mt5-quickbuy',        check: () => !!document.querySelector('button[title="Quick BUY"]') },
  { name: 'dom:mt5-quicksell',       check: () => !!document.querySelector('button[title="Quick SELL"]') },

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
  // FBS web trader is MT5 embedded at fbs.com/trading/web and /trading/web-trader
  { name: 'host:fbs',     check: () => /fbs\.com/i.test(window.location.hostname) && /\/trading\/web/i.test(window.location.pathname) },
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

// ── Hard host patterns for known trading platforms ────────────────────────────
// Only exact known hosts count as a hard platform signal.

const PERMITTED_PLATFORMS: Array<{ id: PlatformName; name: string; matchers: RegExp[]; matchPath?: boolean }> = [
  {
    id: 'mt5_web',
    name: 'MT5 Web',
    matchers: [/metatrader/i, /mql5\.com/i, /mt5/i, /webterminal/i],
  },
  {
    id: 'match_trader',
    name: 'Match-Trader',
    matchers: [/match-trader/i, /matchtrader/i, /matchtraderweb/i, /maven\.markets/i],
  },
  {
    id: 'mt5_web',
    name: 'FBS Web Trader',
    // fbs.com hosts MT5 at /trading/web and /trading/web-trader
    matchers: [/fbs\.com/i],
    matchPath: true,
  },
]

function isPermittedHost(): boolean {
  const hostname = window.location.hostname
  const pathname = window.location.pathname
  return PERMITTED_PLATFORMS.some(p =>
    p.matchers.some(m => p.matchPath ? m.test(hostname) && /\/trading\/web/i.test(pathname) : m.test(hostname)),
  )
}

// "Hard" signals: globals or specific buy/sell DOM elements that are unambiguous
function hasStrongSignals(signals: string[]): boolean {
  return signals.some(s =>
    s.startsWith('global:') ||
    s === 'dom:testid-buy' ||
    s === 'dom:testid-sell' ||
    s === 'dom:data-e2e-buy' ||
    s === 'dom:data-e2e-sell' ||
    s === 'dom:mt5-quickbuy' ||
    s === 'dom:mt5-quicksell' ||
    s === 'dom:mt5-buybtn' ||
    s === 'dom:mt5-sellbtn',
  )
}

function hasBuySellButtons(signals: string[]): boolean {
  return signals.some(s =>
    s === 'dom:testid-buy' ||
    s === 'dom:testid-sell' ||
    s === 'dom:data-e2e-buy' ||
    s === 'dom:data-e2e-sell' ||
    s === 'dom:mt5-quickbuy' ||
    s === 'dom:mt5-quicksell' ||
    s === 'dom:mt5-buybtn' ||
    s === 'dom:mt5-sellbtn' ||
    s === 'dom:class-ui-buy' ||
    s === 'dom:class-ui-sell',
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

function classifyState(best: { platform: PlatformName; count: number; fired: string[] }): TabDetectionState {
  if (!isPermittedHost()) return 'not_eligible'

  const strongSignals = hasStrongSignals(best.fired)
  const buySell = hasBuySellButtons(best.fired)

  // Permitted host alone → candidate minimum
  if (best.count === 0) return 'candidate'

  // Strong global or structural signals confirmed → verified platform
  if (strongSignals || best.count >= 3) {
    if (buySell) return 'adapter_active'
    return 'verified_platform'
  }

  if (best.count >= 1) return 'candidate'

  return 'candidate'
}

// When no DOM signals have fired yet (SPA pre-hydration), derive platform from
// hostname so the correct adapter is wired up before the DOM is ready.
function platformFromHost(): PlatformName {
  const hostname = window.location.hostname
  const pathname = window.location.pathname
  const match = PERMITTED_PLATFORMS.find(p =>
    p.matchers.some(m => p.matchPath ? m.test(hostname) && /\/trading\/web/i.test(pathname) : m.test(hostname)),
  )
  return match?.id ?? 'generic'
}

export function detectPlatform(): DetectionResult {
  const mt   = score(MATCH_TRADER_SIGNALS)
  const mt5  = score(MT5_SIGNALS)

  const candidates = [
    { platform: 'match_trader' as PlatformName, count: mt.count,  fired: mt.fired,  total: MATCH_TRADER_SIGNALS.length },
    { platform: 'mt5_web'      as PlatformName, count: mt5.count, fired: mt5.fired, total: MT5_SIGNALS.length },
  ].sort((a, b) => b.count - a.count)

  const best = candidates[0]

  const state = classifyState(best)

  return {
    platform:   best.count > 0 ? best.platform : platformFromHost(),
    confidence: toConfidence(best.count, best.total),
    signals:    best.fired,
    state,
  }
}

// Run detection after the SPA has had a moment to hydrate
export function detectPlatformDeferred(onResult: (r: DetectionResult) => void, attempts = 5): void {
  let tries = 0
  function attempt() {
    tries++
    const result = detectPlatform()
    if (result.state === 'verified_platform' || result.state === 'adapter_active' || tries >= attempts) {
      onResult(result)
    } else {
      setTimeout(attempt, 800)
    }
  }
  attempt()
}
