import type { SessionSettings, AccountProfile, Playbook } from '../types/playbook'
import type { TradeRecord } from '../types/trade'

// ── Session state (cleared on browser restart) ──────────────────────────────

export interface LiveSessionState {
  accountId: string
  startedAt: number
  accountBalance: number
  dailyBudget: number
  riskPerTrade: number
  tradesOpenedToday: number
  dailyPnl: number
  peakDailyPnl: number
  noTradeMode: boolean
  noTradeModeReason?: string
  lockState: LockState | null
  disciplineScore: number
  enforcementMode: 'training' | 'strict' | 'prop_firm'
  lastTradeClosedAt?: number
}

export interface LockState {
  id: string
  reason: string
  reasonDetail: string
  lockedAt: number
  lockedUntil: number
}

export async function getLiveSession(): Promise<LiveSessionState | null> {
  const r = await chrome.storage.session.get('liveSession')
  return (r.liveSession as LiveSessionState) ?? null
}

export async function setLiveSession(state: LiveSessionState): Promise<void> {
  await chrome.storage.session.set({ liveSession: state })
}

export async function patchLiveSession(patch: Partial<LiveSessionState>): Promise<void> {
  const current = await getLiveSession()
  if (!current) return
  await setLiveSession({ ...current, ...patch })
}

// ── Persistent settings ──────────────────────────────────────────────────────

export async function getSettings(): Promise<SessionSettings | null> {
  const r = await chrome.storage.local.get('settings')
  return (r.settings as SessionSettings) ?? null
}

export async function saveSettings(settings: SessionSettings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

export async function getActiveAccount(): Promise<AccountProfile | null> {
  const r = await chrome.storage.local.get('activeAccount')
  return (r.activeAccount as AccountProfile) ?? null
}

export async function saveActiveAccount(account: AccountProfile): Promise<void> {
  await chrome.storage.local.set({ activeAccount: account })
}

// ── Playbooks ────────────────────────────────────────────────────────────────

export async function getPlaybooks(accountId: string): Promise<Playbook[]> {
  const r = await chrome.storage.local.get(`playbooks_${accountId}`)
  return (r[`playbooks_${accountId}`] as Playbook[]) ?? []
}

export async function savePlaybooks(accountId: string, playbooks: Playbook[]): Promise<void> {
  await chrome.storage.local.set({ [`playbooks_${accountId}`]: playbooks })
}

// ── Trade log ────────────────────────────────────────────────────────────────

export async function getTrades(accountId: string): Promise<TradeRecord[]> {
  const r = await chrome.storage.local.get(`trades_${accountId}`)
  return (r[`trades_${accountId}`] as TradeRecord[]) ?? []
}

export async function upsertTrade(accountId: string, trade: TradeRecord): Promise<void> {
  const trades = await getTrades(accountId)
  const idx = trades.findIndex(t => t.id === trade.id)
  if (idx >= 0) {
    trades[idx] = trade
  } else {
    trades.unshift(trade)
  }
  await chrome.storage.local.set({ [`trades_${accountId}`]: trades })
}

// ── Override counter ─────────────────────────────────────────────────────────

export async function getOverrideCount(): Promise<number> {
  const r = await chrome.storage.local.get('overrideCount')
  return (r.overrideCount as number) ?? 0
}

export async function incrementOverrideCount(): Promise<number> {
  const current = await getOverrideCount()
  const next = current + 1
  await chrome.storage.local.set({ overrideCount: next })
  return next
}
