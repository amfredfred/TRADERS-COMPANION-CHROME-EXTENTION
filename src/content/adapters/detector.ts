import type { PlatformName } from './types'
import type { TabDetectionState } from '../../shared/types/platform'
import { semanticOrderButtonsPresent } from './semanticButtons'

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

// ── Hard host patterns for known trading platforms ────────────────────────────
// Only exact known hosts count as a hard platform signal.

const KNOWN_HOSTS = [
  /matchtraderweb\.com/i,
  /mql5\.com/i,
  /metatrader\.app/i,
  /tradingview\.com/i,
  /ctrader\.com/i,
  /maven\.markets/i,
]

function isKnownHost(): boolean {
  return KNOWN_HOSTS.some(pattern => pattern.test(window.location.hostname))
}

// "Hard" signals: globals or specific buy/sell DOM elements that are unambiguous
function hasStrongSignals(signals: string[]): boolean {
  return signals.some(s =>
    s.startsWith('global:') ||
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
    s === 'dom:data-e2e-buy' ||
    s === 'dom:data-e2e-sell' ||
    s === 'dom:mt5-quickbuy' ||
    s === 'dom:mt5-quicksell' ||
    s === 'dom:mt5-buybtn' ||
    s === 'dom:mt5-sellbtn' ||
    s === 'dom:class-buyButton' ||
    s === 'dom:class-sellButton',
  )
}

// Weak candidate: title or meta contains trading hints but nothing structural
const CANDIDATE_TITLE_RE = /\b(trading|broker|mt4|mt5|forex|futures|options|metatrader|tradingview|ctrader)\b/i

function isCandidateByTitle(): boolean {
  return CANDIDATE_TITLE_RE.test(document.title) || CANDIDATE_TITLE_RE.test(window.location.href)
}

// ── Public API ────────────────────────────────────────────────────────────────

function classifyState(best: { platform: PlatformName; count: number; fired: string[] }): TabDetectionState {
  const knownHost = isKnownHost()
  const strongSignals = hasStrongSignals(best.fired)
  const buySell = hasBuySellButtons(best.fired)

  if (best.count === 0 && !knownHost) {
    // Last resort: semantic scan finds actual Buy+Sell trading buttons on page
    if (semanticOrderButtonsPresent()) return 'adapter_active'
    return isCandidateByTitle() ? 'candidate' : 'not_eligible'
  }

  // Known host alone → candidate minimum
  if (knownHost && !strongSignals) return 'candidate'

  // Strong global or structural signals confirmed → verified platform
  if (strongSignals || best.count >= 3) {
    if (buySell) return 'adapter_active'
    return 'verified_platform'
  }

  // Some signals but weak — check semantic scan before settling on candidate
  if (semanticOrderButtonsPresent()) return 'adapter_active'
  if (best.count >= 1) return 'candidate'

  return 'not_eligible'
}

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

  const state = classifyState(best)

  return {
    platform:   best.count > 0 ? best.platform : 'generic',
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
