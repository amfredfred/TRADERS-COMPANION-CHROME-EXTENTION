import type { SessionSettings, AccountProfile, Playbook } from '../types/playbook'
import type { TradeRecord } from '../types/trade'
import { isContextInvalidatedError, isExtensionContextValid } from './extensionApi'

function canUseStorage(): boolean {
  return isExtensionContextValid() && !!chrome.storage
}

function warnStorage(error: unknown) {
  if (isContextInvalidatedError(error)) {
    console.warn('[TC] Extension was reloaded. Storage call skipped.')
    return
  }
  console.warn('[TC] Storage call failed:', error)
}

// ── Session state (cleared on browser restart) ──────────────────────────────

export interface LiveSessionState {
  accountId: string
  accountKey?: string
  platform?: string
  accountName?: string | null
  accountType?: string | null
  currency?: string | null
  detectedBalance?: number | null
  detectedEquity?: number | null
  lockedBalance?: number
  lockedEquity?: number | null
  lastSyncedAt?: number
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
  maxTrades: number
  disciplineScore: number
  enforcementMode: 'training' | 'strict' | 'prop_firm'
  lastTradeClosedAt?: number
  sessionSource?: string
}

export interface AccountSessionState {
  accountKey: string
  platform: string
  accountId: string | null
  accountName: string | null
  accountType: string | null
  currency: string | null
  detectedBalance: number | null
  detectedEquity: number | null
  lockedSessionBalance: number
  lockedSessionEquity: number | null
  tradesToday: number
  realizedPnlToday: number
  peakDailyPnl: number
  noTradeMode: boolean
  noTradeModeReason?: string
  lockState: LockState | null
  maxTrades: number
  disciplineScore: number
  enforcementMode: 'training' | 'strict' | 'prop_firm'
  cooldownUntil?: number | null
  lastTradeClosedAt?: number
  sessionStartedAt: number
  lastSyncedAt: number
  source: 'created_from_detected_account' | 'restored_from_storage' | 'manual_resync' | 'pending_detected_balance'
}

export interface SessionStore {
  activeTradingDay: string
  activeAccountKey: string | null
  sessionsByDay: Record<string, Record<string, AccountSessionState>>
}

export interface LockState {
  id: string
  reason: string
  reasonDetail: string
  lockedAt: number
  lockedUntil: number
}

export const SESSION_STORE_KEY = 'tc.sessionStore'

export async function getLiveSession(): Promise<LiveSessionState | null> {
  if (!canUseStorage()) return null
  try {
    const r = await chrome.storage.session.get('liveSession')
    return (r.liveSession as LiveSessionState) ?? null
  } catch (error) {
    warnStorage(error)
    return null
  }
}

export async function setLiveSession(state: LiveSessionState): Promise<void> {
  if (!canUseStorage()) return
  try {
    await chrome.storage.session.set({ liveSession: state })
  } catch (error) {
    warnStorage(error)
  }
}

export async function patchLiveSession(patch: Partial<LiveSessionState>): Promise<void> {
  const current = await getLiveSession()
  if (!current) return
  await setLiveSession({ ...current, ...patch })
}

export async function getSessionStore(): Promise<SessionStore> {
  const tradingDay = new Date().toISOString().slice(0, 10)
  const empty: SessionStore = {
    activeTradingDay: tradingDay,
    activeAccountKey: null,
    sessionsByDay: { [tradingDay]: {} },
  }
  if (!canUseStorage()) return empty
  try {
    const r = await chrome.storage.session.get(SESSION_STORE_KEY)
    const stored = r[SESSION_STORE_KEY] as SessionStore | undefined
    if (!stored) return empty
    return {
      activeTradingDay: stored.activeTradingDay || tradingDay,
      activeAccountKey: stored.activeAccountKey ?? null,
      sessionsByDay: {
        ...stored.sessionsByDay,
        [tradingDay]: stored.sessionsByDay?.[tradingDay] ?? {},
      },
    }
  } catch (error) {
    warnStorage(error)
    return empty
  }
}

export async function setSessionStore(store: SessionStore): Promise<void> {
  if (!canUseStorage()) return
  try {
    await chrome.storage.session.set({ [SESSION_STORE_KEY]: store })
  } catch (error) {
    warnStorage(error)
  }
}

export function getActiveAccountSession(store: SessionStore): AccountSessionState | null {
  const day = store.activeTradingDay
  const key = store.activeAccountKey
  if (!day || !key) return null
  return store.sessionsByDay[day]?.[key] ?? null
}

export function accountSessionToLiveSession(session: AccountSessionState): LiveSessionState {
  return {
    accountId: session.accountId ?? session.accountKey,
    accountKey: session.accountKey,
    platform: session.platform,
    accountName: session.accountName,
    accountType: session.accountType,
    currency: session.currency,
    detectedBalance: session.detectedBalance,
    detectedEquity: session.detectedEquity,
    lockedBalance: session.lockedSessionBalance,
    lockedEquity: session.lockedSessionEquity,
    lastSyncedAt: session.lastSyncedAt,
    startedAt: session.sessionStartedAt,
    accountBalance: session.lockedSessionBalance,
    dailyBudget: 0,
    riskPerTrade: 0,
    tradesOpenedToday: session.tradesToday,
    dailyPnl: session.realizedPnlToday,
    peakDailyPnl: session.peakDailyPnl,
    noTradeMode: session.noTradeMode,
    noTradeModeReason: session.noTradeModeReason,
    lockState: session.lockState,
    maxTrades: session.maxTrades,
    disciplineScore: session.disciplineScore,
    enforcementMode: session.enforcementMode,
    lastTradeClosedAt: session.lastTradeClosedAt,
    sessionSource: session.source,
  }
}

export function liveSessionToAccountSession(session: LiveSessionState): AccountSessionState | null {
  if (!session.accountKey || !session.platform) return null
  return {
    accountKey: session.accountKey,
    platform: session.platform,
    accountId: session.accountId ?? null,
    accountName: session.accountName ?? null,
    accountType: session.accountType ?? null,
    currency: session.currency ?? null,
    detectedBalance: session.detectedBalance ?? null,
    detectedEquity: session.detectedEquity ?? null,
    lockedSessionBalance: session.lockedBalance ?? session.accountBalance,
    lockedSessionEquity: session.lockedEquity ?? null,
    tradesToday: session.tradesOpenedToday,
    realizedPnlToday: session.dailyPnl,
    peakDailyPnl: session.peakDailyPnl,
    noTradeMode: session.noTradeMode,
    noTradeModeReason: session.noTradeModeReason,
    lockState: session.lockState,
    maxTrades: session.maxTrades,
    disciplineScore: session.disciplineScore,
    enforcementMode: session.enforcementMode,
    lastTradeClosedAt: session.lastTradeClosedAt,
    sessionStartedAt: session.startedAt,
    lastSyncedAt: session.lastSyncedAt ?? Date.now(),
    source: session.sessionSource === 'manual_resync' ? 'manual_resync' : 'restored_from_storage',
  }
}

// ── Platform enabled/disabled state ──────────────────────────────────────────

type PlatformEnabledMap = Record<string, boolean>

export async function getPlatformEnabled(platformId: string): Promise<boolean> {
  if (!canUseStorage()) return true
  try {
    const r = await chrome.storage.local.get('tc_platform_enabled')
    const map = (r.tc_platform_enabled ?? {}) as PlatformEnabledMap
    return map[platformId] !== false
  } catch {
    return true
  }
}

export async function setPlatformEnabled(platformId: string, enabled: boolean): Promise<void> {
  if (!canUseStorage()) return
  try {
    const r = await chrome.storage.local.get('tc_platform_enabled')
    const map = (r.tc_platform_enabled ?? {}) as PlatformEnabledMap
    await chrome.storage.local.set({ tc_platform_enabled: { ...map, [platformId]: enabled } })
  } catch (error) {
    warnStorage(error)
  }
}

// ── Persistent settings ──────────────────────────────────────────────────────

export async function getSettings(): Promise<SessionSettings | null> {
  if (!canUseStorage()) return null
  try {
    const r = await chrome.storage.local.get('settings')
    return (r.settings as SessionSettings) ?? null
  } catch (error) {
    warnStorage(error)
    return null
  }
}

export async function saveSettings(settings: SessionSettings): Promise<void> {
  if (!canUseStorage()) return
  try {
    await chrome.storage.local.set({ settings })
  } catch (error) {
    warnStorage(error)
  }
}

export async function getActiveAccount(): Promise<AccountProfile | null> {
  if (!canUseStorage()) return null
  try {
    const r = await chrome.storage.local.get('activeAccount')
    return (r.activeAccount as AccountProfile) ?? null
  } catch (error) {
    warnStorage(error)
    return null
  }
}

export async function saveActiveAccount(account: AccountProfile): Promise<void> {
  if (!canUseStorage()) return
  try {
    await chrome.storage.local.set({ activeAccount: account })
  } catch (error) {
    warnStorage(error)
  }
}

// ── Playbooks ────────────────────────────────────────────────────────────────

export async function getPlaybooks(accountId: string): Promise<Playbook[]> {
  if (!canUseStorage()) return []
  try {
    const r = await chrome.storage.local.get(`playbooks_${accountId}`)
    return (r[`playbooks_${accountId}`] as Playbook[]) ?? []
  } catch (error) {
    warnStorage(error)
    return []
  }
}

export async function savePlaybooks(accountId: string, playbooks: Playbook[]): Promise<void> {
  if (!canUseStorage()) return
  try {
    await chrome.storage.local.set({ [`playbooks_${accountId}`]: playbooks })
  } catch (error) {
    warnStorage(error)
  }
}

// ── Trade log ────────────────────────────────────────────────────────────────

export async function getTrades(accountId: string): Promise<TradeRecord[]> {
  if (!canUseStorage()) return []
  try {
    const r = await chrome.storage.local.get(`trades_${accountId}`)
    return (r[`trades_${accountId}`] as TradeRecord[]) ?? []
  } catch (error) {
    warnStorage(error)
    return []
  }
}

export async function upsertTrade(accountId: string, trade: TradeRecord): Promise<void> {
  if (!canUseStorage()) return
  const trades = await getTrades(accountId)
  const idx = trades.findIndex(t => t.id === trade.id)
  if (idx >= 0) {
    trades[idx] = trade
  } else {
    trades.unshift(trade)
  }
  try {
    await chrome.storage.local.set({ [`trades_${accountId}`]: trades })
  } catch (error) {
    warnStorage(error)
  }
}

// ── Override counter ─────────────────────────────────────────────────────────

export async function getOverrideCount(): Promise<number> {
  if (!canUseStorage()) return 0
  try {
    const r = await chrome.storage.local.get('overrideCount')
    return (r.overrideCount as number) ?? 0
  } catch (error) {
    warnStorage(error)
    return 0
  }
}

export async function incrementOverrideCount(): Promise<number> {
  const current = await getOverrideCount()
  const next = current + 1
  if (!canUseStorage()) return next
  try {
    await chrome.storage.local.set({ overrideCount: next })
  } catch (error) {
    warnStorage(error)
  }
  return next
}
