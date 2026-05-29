import type { DetectedPosition, DetectedClosedTrade, PreTradeGateAnswers } from '../types/trade'
import type { PlatformName } from '../../content/adapters/types'
import type { PlatformSnapshot, TabPinState } from '../types/platform'

// All message types exchanged between content ↔ background ↔ popup
export type MessageType =
  | 'TC_TRADE_INTENT_OPEN'
  | 'TC_GATE_ANSWERED'
  | 'TC_GATE_OPEN'
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
  | 'TC_GET_CURRENT_TAB_STATUS'
  | 'TC_GET_PIN_STATE'
  | 'TC_PIN_TAB'
  | 'TC_UNPIN_TAB'
  | 'TC_COMPANION_PINNED'
  | 'TC_COMPANION_UNPINNED'
  | 'TC_COMPANION_COLLAPSE'
  | 'TC_GET_PLATFORM_SNAPSHOT'
  | 'TC_AGENT_TOOL_REQUEST'

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

export interface CurrentTabStatusResponse {
  tabId: number | null
  domain: string
  url: string
  title: string
  pinned: boolean
  pinState?: TabPinState
  snapshot?: PlatformSnapshot
  status: PlatformSnapshot['status']
  confidence: number
}

export interface AgentToolRequest {
  tool:
    | 'captureVisibleChart'
    | 'getVisiblePageText'
    | 'getPlatformSnapshot'
    | 'getUserRules'
    | 'getSessionState'
    | 'captureAndReview'
  prompt?: string
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
