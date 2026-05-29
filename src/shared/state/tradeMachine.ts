import type { TradeState, TradeRecord, PreTradeGateAnswers, MistakeTag, WinTag } from '../types/trade'

function uid(): string {
  return crypto.randomUUID()
}

interface Transition {
  from: TradeState[]
  to: TradeState
}

const VALID_TRANSITIONS: Transition[] = [
  { from: ['PRE_TRADE_INTENT'],                                                    to: 'ORDER_SUBMITTED'   },
  { from: ['ORDER_SUBMITTED'],                                                     to: 'PENDING_ORDER'     },
  { from: ['ORDER_SUBMITTED', 'PENDING_ORDER'],                                    to: 'POSITION_OPEN'     },
  { from: ['POSITION_OPEN', 'POSITION_MODIFIED', 'PARTIAL_CLOSE', 'BREAKEVEN_SET'], to: 'POSITION_MODIFIED' },
  { from: ['POSITION_OPEN', 'POSITION_MODIFIED', 'BREAKEVEN_SET'],                 to: 'PARTIAL_CLOSE'     },
  { from: ['POSITION_OPEN', 'POSITION_MODIFIED', 'PARTIAL_CLOSE'],                 to: 'BREAKEVEN_SET'     },
  { from: ['POSITION_OPEN', 'POSITION_MODIFIED', 'PARTIAL_CLOSE', 'BREAKEVEN_SET'], to: 'POSITION_CLOSED'   },
  { from: ['POSITION_CLOSED'],                                                     to: 'EXIT_REFLECTION'   },
  { from: ['EXIT_REFLECTION'],                                                     to: 'COMPLETE'           },
]

export class TradeMachine {
  private record: TradeRecord

  constructor(accountId: string, tradeIntentId?: string) {
    this.record = {
      id: uid(),
      tradeIntentId: tradeIntentId ?? uid(),
      accountId,
      state: 'PRE_TRADE_INTENT',
      flaggedUnplanned: false,
      createdAt: Date.now(),
    }
  }

  // Factory for positions that bypass the gate (detected without a prior intent)
  static fromUnplannedPosition(accountId: string): TradeMachine {
    const m = new TradeMachine(accountId)
    m.record.flaggedUnplanned = true
    m.record.state = 'POSITION_OPEN'
    m.record.openedAt = Date.now()
    return m
  }

  canTransitionTo(next: TradeState): boolean {
    return VALID_TRANSITIONS.some(
      t => t.to === next && t.from.includes(this.record.state),
    )
  }

  transition(next: TradeState): this {
    if (!this.canTransitionTo(next)) {
      throw new Error(`[TradeMachine] Invalid transition ${this.record.state} → ${next}`)
    }
    this.record.state = next
    if (next === 'POSITION_OPEN')   this.record.openedAt = Date.now()
    if (next === 'POSITION_CLOSED') this.record.closedAt = Date.now()
    return this
  }

  applyGateAnswers(answers: PreTradeGateAnswers): this {
    this.record.entryReason   = answers.setupDescription
    this.record.stopLossLevel = answers.stopLoss
    this.record.invalidation  = answers.invalidation
    this.record.intendedRisk  = answers.intendedRisk
    this.record.rulesFollowed = answers.rulesFollowed
    this.record.setupGrade    = answers.setupGrade
    return this
  }

  applyExitReflection(reflection: string, tags: MistakeTag[] | WinTag[]): this {
    this.record.exitReflection = reflection
    if ((this.record.pnl ?? 0) >= 0) {
      this.record.winTags = tags as WinTag[]
    } else {
      this.record.mistakeTags = tags as MistakeTag[]
    }
    return this
  }

  setPnl(pnl: number): this {
    this.record.pnl = pnl
    return this
  }

  setPosition(symbol: string, direction: 'long' | 'short'): this {
    this.record.symbol    = symbol
    this.record.direction = direction
    return this
  }

  setAiEntry(assessment: string): this {
    this.record.aiEntryAssessment = assessment
    return this
  }

  setAiExit(assessment: string): this {
    this.record.aiExitAssessment = assessment
    return this
  }

  getState(): TradeState {
    return this.record.state
  }

  snapshot(): Readonly<TradeRecord> {
    return Object.freeze({ ...this.record })
  }
}
