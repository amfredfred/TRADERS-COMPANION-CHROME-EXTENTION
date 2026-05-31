export interface RiskSessionInput {
  balance: number
  dailyLossLimitPercent: number
  maxLosingStreak: number
  realizedLossToday?: number
  openTradeRisk?: number
  riskPerTradeCapPercent?: number | null
}

export interface RiskSessionResult {
  balance: number
  dailyBudget: number
  riskPerTrade: number
  budgetLeft: number
  maxTrades: number
}

function finiteOrZero(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateRiskSession(input: RiskSessionInput): RiskSessionResult {
  const balance = Math.max(0, finiteOrZero(input.balance))
  const dailyLossLimitPercent = Math.max(0, finiteOrZero(input.dailyLossLimitPercent))
  const maxLosingStreak = Math.max(1, Math.floor(finiteOrZero(input.maxLosingStreak)))
  const realizedLossToday = Math.max(0, finiteOrZero(input.realizedLossToday))
  const openTradeRisk = Math.max(0, finiteOrZero(input.openTradeRisk))
  const capPercent = Math.max(0, finiteOrZero(input.riskPerTradeCapPercent))

  const dailyBudgetRaw = balance * (dailyLossLimitPercent / 100)
  const streakRiskRaw = dailyBudgetRaw / maxLosingStreak
  const capRiskRaw = capPercent > 0 ? balance * (capPercent / 100) : Number.POSITIVE_INFINITY
  const riskPerTradeRaw = Math.min(streakRiskRaw, capRiskRaw)
  const budgetLeftRaw = dailyBudgetRaw - realizedLossToday - openTradeRisk

  return {
    balance: roundMoney(balance),
    dailyBudget: roundMoney(dailyBudgetRaw),
    riskPerTrade: roundMoney(riskPerTradeRaw),
    budgetLeft: roundMoney(Math.max(0, budgetLeftRaw)),
    maxTrades: maxLosingStreak,
  }
}
