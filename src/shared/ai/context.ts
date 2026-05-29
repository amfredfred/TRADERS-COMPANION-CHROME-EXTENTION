import type { AIContextPayload } from './types'

export function hasUsableSessionContext(payload: AIContextPayload): boolean {
  return payload.session.accountBalance > 0 || payload.session.riskPerTrade > 0 || payload.session.tradesOpenedToday > 0
}
