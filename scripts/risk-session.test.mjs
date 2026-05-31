import assert from 'node:assert/strict'
import { calculateRiskSession } from '../src/shared/lib/risk.ts'

const cases = [
  {
    name: '9686.52 balance with 1.5 percent daily limit and 3 loss streak',
    input: { balance: 9686.52, dailyLossLimitPercent: 1.5, maxLosingStreak: 3 },
    expected: { dailyBudget: 145.3, riskPerTrade: 48.43, budgetLeft: 145.3, maxTrades: 3 },
  },
  {
    name: '10000 balance with 3 percent daily limit and 3 loss streak',
    input: { balance: 10000, dailyLossLimitPercent: 3, maxLosingStreak: 3 },
    expected: { dailyBudget: 300, riskPerTrade: 100, budgetLeft: 300, maxTrades: 3 },
  },
  {
    name: '10000 balance with 1.5 percent daily limit and 5 loss streak',
    input: { balance: 10000, dailyLossLimitPercent: 1.5, maxLosingStreak: 5 },
    expected: { dailyBudget: 150, riskPerTrade: 30, budgetLeft: 150, maxTrades: 5 },
  },
  {
    name: 'budget left subtracts realized loss and open risk',
    input: { balance: 10000, dailyLossLimitPercent: 1.5, maxLosingStreak: 3, realizedLossToday: 50, openTradeRisk: 25 },
    expected: { dailyBudget: 150, riskPerTrade: 50, budgetLeft: 75, maxTrades: 3 },
  },
  {
    name: 'account A calculation',
    input: { balance: 9686.52, dailyLossLimitPercent: 1.5, maxLosingStreak: 3 },
    expected: { dailyBudget: 145.3, riskPerTrade: 48.43, budgetLeft: 145.3, maxTrades: 3 },
  },
  {
    name: 'account B calculation',
    input: { balance: 50000, dailyLossLimitPercent: 1.5, maxLosingStreak: 3 },
    expected: { dailyBudget: 750, riskPerTrade: 250, budgetLeft: 750, maxTrades: 3 },
  },
]

for (const testCase of cases) {
  const result = calculateRiskSession(testCase.input)
  assert.equal(result.dailyBudget, testCase.expected.dailyBudget, `${testCase.name}: dailyBudget`)
  assert.equal(result.riskPerTrade, testCase.expected.riskPerTrade, `${testCase.name}: riskPerTrade`)
  assert.equal(result.budgetLeft, testCase.expected.budgetLeft, `${testCase.name}: budgetLeft`)
  assert.equal(result.maxTrades, testCase.expected.maxTrades, `${testCase.name}: maxTrades`)
}

console.log('calculateRiskSession: all cases passed')
