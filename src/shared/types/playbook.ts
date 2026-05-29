export type TradingSession = 'London' | 'NY' | 'Asian' | 'Pacific'

export type EnforcementMode = 'training' | 'strict' | 'prop_firm'

export type AiProvider = 'off' | 'gpt4o' | 'claude'

export interface ChecklistItem {
  id: string
  label: string
  required: boolean
}

export interface Playbook {
  id: string
  accountId: string
  name: string
  allowedSessions: TradingSession[]
  htfBiasRequired: boolean
  allowedSymbols: string[]
  entryConfirmation: string
  checklistItems: ChecklistItem[]
  stopRule: string
  maxTradesPerDay: number
  cooldownAfterLossMinutes: number
  active: boolean
  createdAt: number
}

export interface SessionSettings {
  userId: string
  accountId: string
  riskPercent: number
  maxTrades: number
  enforcementMode: EnforcementMode
  cooldownMinutes: number
  dailyProfitTarget?: number
  givebackLimitPercent: number
  hardLockPercent: number
  autoNoTradeModeOnTarget: boolean
  aiProvider: AiProvider
  claudeApiKey?: string
  openaiApiKey?: string
}

export interface AccountProfile {
  id: string
  userId: string
  name: string
  accountType: 'live' | 'prop_firm' | 'demo' | 'backtest'
  platform: string
  startingBalance: number
  createdAt: number
}

export interface PropFirmRules {
  dailyDrawdownLimit?: number
  dailyDrawdownPercent?: number
  overallDrawdownLimit?: number
  overallDrawdownPercent?: number
  trailingDrawdown: boolean
  maxLotSize?: number
  newsTrading: boolean
  maxRiskPerTradePercent?: number
  minTradingDays?: number
  consistencyRule: boolean
  profitTarget?: number
}
