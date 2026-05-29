import type { DetectedPosition, DetectedClosedTrade, PreTradeGateAnswers } from '../types/trade'
import type { PlatformName } from '../../content/adapters/types'

// All message types exchanged between content ↔ background ↔ popup
export type MessageType =
  | 'TC_TRADE_INTENT_OPEN'
  | 'TC_GATE_ANSWERED'
  | 'TC_GATE_CANCELLED'
  | 'TC_POSITION_OPENED'
  | 'TC_POSITION_CLOSED'
  | 'TC_EXIT_REFLECTION_DONE'
  | 'TC_LOCK_CHECK'
  | 'TC_LOCK_ACTIVATE'
  | 'TC_LOCK_RELEASE'
  | 'TC_NO_TRADE_MODE_ON'
  | 'TC_NO_TRADE_MODE_OFF'
  | 'TC_SESSION_INIT'
  | 'TC_GET_SESSION_STATE'
  | 'TC_SESSION_STATE_RESPONSE'
  | 'TC_SCREENSHOT_CAPTURE'

export interface TCMessage<T = unknown> {
  type: MessageType
  payload?: T
  timestamp: number
}

// Payload shapes
export interface TradeIntentPayload {
  direction: 'long' | 'short'
  symbol: string | null
  adapterName: PlatformName
}

export interface GateAnsweredPayload {
  tradeIntentId: string
  answers: PreTradeGateAnswers
}

export interface PositionOpenedPayload {
  position: DetectedPosition
  adapterName: PlatformName
}

export interface PositionClosedPayload {
  trade: DetectedClosedTrade
  adapterName: PlatformName
}

export interface LockActivatePayload {
  reason: string
  reasonDetail: string
  lockedUntil: number
}

export interface SessionStateResponse {
  locked: boolean
  lockedUntil?: number
  lockReason?: string
  noTradeMode: boolean
  tradesOpenedToday: number
  dailyPnl: number
  riskPerTrade: number
  dailyBudget: number
  maxTrades: number
  disciplineScore: number
}

export function sendToBackground<T>(
  msg: Omit<TCMessage<T>, 'timestamp'>,
): Promise<unknown> {
  return chrome.runtime.sendMessage({ ...msg, timestamp: Date.now() })
}

export function sendToTab<T>(
  tabId: number,
  msg: Omit<TCMessage<T>, 'timestamp'>,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, { ...msg, timestamp: Date.now() })
}
