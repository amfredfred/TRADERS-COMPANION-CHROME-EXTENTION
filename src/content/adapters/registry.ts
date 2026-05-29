import type { PlatformAdapter, PlatformName } from './types'
import type { PlatformCapabilities, PlatformSnapshot, PlatformStatus } from '../../shared/types/platform'
import { detectPlatform } from './detector'

const PLATFORM_LABELS: Record<PlatformName, string> = {
  match_trader: 'Match Trader',
  mt5_web: 'MetaTrader Web',
  tradingview: 'TradingView',
  ctrader: 'cTrader',
  generic: 'Unknown Trading Page',
}

export function getPlatformSnapshot(adapter: PlatformAdapter, mode: 'auto_platform' | 'manual_attach' = 'auto_platform'): PlatformSnapshot {
  const detection = detectPlatform()
  const confidence = toPercent(detection.confidence, detection.signals.length, detection.platform)
  const symbol = adapter.detectSymbol()
  const adapterId = adapter.name
  const capabilities = getCapabilities(adapterId, confidence, adapter)

  return {
    adapterId,
    platformName: PLATFORM_LABELS[adapterId],
    status: getStatus(adapterId, confidence, capabilities, mode),
    confidence,
    capabilities,
    url: window.location.href,
    origin: window.location.origin,
    title: document.title || PLATFORM_LABELS[adapterId],
    symbol,
    timeframe: detectTimeframe(),
    accountBalance: adapter.detectAccountBalance(),
    mode,
  }
}

function toPercent(confidence: 'high' | 'medium' | 'low', signalCount: number, platform: PlatformName): number {
  if (platform === 'generic') return Math.min(38, signalCount * 10)
  if (confidence === 'high') return Math.min(96, 72 + signalCount * 4)
  if (confidence === 'medium') return Math.min(71, 48 + signalCount * 6)
  return Math.min(42, 20 + signalCount * 5)
}

function getStatus(
  adapterId: PlatformName,
  confidence: number,
  capabilities: PlatformCapabilities,
  mode: 'auto_platform' | 'manual_attach',
): PlatformStatus {
  if (mode === 'manual_attach') return 'manual_attach_available'
  if (adapterId === 'generic') return confidence > 20 ? 'manual_attach_available' : 'unsupported_page'
  if (capabilities.orderInterception === 'available' && confidence >= 70) return 'adapter_active'
  return 'partial_detection'
}

function getCapabilities(adapterId: PlatformName, confidence: number, adapter: PlatformAdapter): PlatformCapabilities {
  const canReadSymbol = !!adapter.detectSymbol()
  const hasBuySell = !!adapter.detectBuyButton() || !!adapter.detectSellButton()
  const hasPositions = adapter.detectOpenPositions().length > 0

  if (adapterId === 'generic') {
    return {
      screenshot: true,
      pinnedCompanion: true,
      symbolDetection: canReadSymbol ? 'partial' : 'unavailable',
      timeframeDetection: 'partial',
      positionDetection: 'unavailable',
      orderInterception: 'unavailable',
      riskInputs: 'unavailable',
      manualTradeLog: true,
    }
  }

  return {
    screenshot: true,
    pinnedCompanion: true,
    symbolDetection: canReadSymbol ? 'available' : 'partial',
    timeframeDetection: detectTimeframe() ? 'partial' : 'unavailable',
    positionDetection: hasPositions ? 'available' : confidence >= 60 ? 'partial' : 'unavailable',
    orderInterception: hasBuySell ? 'available' : 'unavailable',
    riskInputs: adapter.detectOrderSize() || adapter.detectStopLoss() ? 'partial' : 'unavailable',
    manualTradeLog: true,
  }
}

function detectTimeframe(): string | null {
  const bodyText = document.body?.innerText ?? ''
  const match = bodyText.match(/\b(1m|3m|5m|15m|30m|1h|4h|1d|M1|M5|M15|M30|H1|H4|D1)\b/)
  return match?.[0] ?? null
}
