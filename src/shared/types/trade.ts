export type TradeState =
  | 'PRE_TRADE_INTENT'
  | 'ORDER_SUBMITTED'
  | 'PENDING_ORDER'
  | 'POSITION_OPEN'
  | 'POSITION_MODIFIED'
  | 'PARTIAL_CLOSE'
  | 'BREAKEVEN_SET'
  | 'POSITION_CLOSED'
  | 'EXIT_REFLECTION'
  | 'COMPLETE'

export type SetupGrade = 'A' | 'B' | 'C' | 'Impulse'

export type Direction = 'long' | 'short'

export type MistakeTag =
  | 'early_entry'
  | 'late_entry'
  | 'oversized'
  | 'moved_stop'
  | 'no_stop_placed'
  | 'ignored_bias'
  | 'revenge_trade'
  | 'overtraded'
  | 'exited_early'
  | 'held_too_long'
  | 'random_setup'
  | 'wrong_session'
  | 'chased_price'
  | 'ignored_news'
  | 'valid_loss'

export type WinTag =
  | 'followed_plan'
  | 'patient_entry'
  | 'correct_sizing'
  | 'respected_stop'
  | 'took_full_target'
  | 'trusted_setup'

export interface TradeRecord {
  id: string
  tradeIntentId: string
  accountId: string
  state: TradeState

  symbol?: string
  direction?: Direction
  pnl?: number

  setupGrade?: SetupGrade
  rulesFollowed?: boolean
  entryReason?: string
  exitReflection?: string
  stopLossLevel?: string
  invalidation?: string
  intendedRisk?: number

  aiEntryAssessment?: string
  aiExitAssessment?: string
  entryScreenshotUrl?: string
  exitScreenshotUrl?: string

  mistakeTags?: MistakeTag[]
  winTags?: WinTag[]
  flaggedUnplanned: boolean

  openedAt?: number
  closedAt?: number
  createdAt: number
}

export interface PreTradeGateAnswers {
  setupDescription: string
  stopLoss: string
  invalidation: string
  intendedRisk: number
  rulesFollowed: boolean
  setupGrade: SetupGrade
  checklistItems: Record<string, boolean>
}

export interface DetectedPosition {
  id: string
  symbol: string
  direction: Direction
  size: number
  pnl?: number
}

export interface DetectedClosedTrade {
  id: string
  symbol: string
  direction: Direction
  pnl: number
}
