import {
  getLiveSession,
  setLiveSession,
  patchLiveSession,
  getSettings,
  getActiveAccount,
  upsertTrade,
  incrementOverrideCount,
} from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import { TradeMachine } from '../shared/state/tradeMachine'
import { fetchActiveLock, insertLock, overrideLock } from '../shared/lib/supabase'
import { sendToTab } from '../shared/lib/messages'
import type {
  TCMessage,
  TradeIntentPayload,
  GateAnsweredPayload,
  PositionOpenedPayload,
  PositionClosedPayload,
  LockActivatePayload,
  SessionStateResponse,
} from '../shared/lib/messages'

// In-memory map of active trade machines (keyed by intentId)
const activeTrades = new Map<string, TradeMachine>()

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: TCMessage, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[TC SW] Message handler error', err)
      sendResponse({ error: String(err) })
    })
  return true // keep port open for async response
})

async function handleMessage(
  msg: TCMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (msg.type) {
    case 'TC_GET_SESSION_STATE':
      return buildSessionStateResponse()

    case 'TC_TRADE_INTENT_OPEN':
      return handleTradeIntent(msg.payload as TradeIntentPayload, sender)

    case 'TC_GATE_ANSWERED':
      return handleGateAnswered(msg.payload as GateAnsweredPayload, sender)

    case 'TC_POSITION_OPENED':
      return handlePositionOpened(msg.payload as PositionOpenedPayload, sender)

    case 'TC_POSITION_CLOSED':
      return handlePositionClosed(msg.payload as PositionClosedPayload, sender)

    case 'TC_LOCK_CHECK':
      return handleLockCheck()

    case 'TC_LOCK_RELEASE':
      return handleLockRelease(msg.payload as { lockId?: string; reason?: string }, sender)

    case 'TC_NO_TRADE_MODE_ON':
      return handleNoTradeModeOn(msg.payload as { reason?: string })

    default:
      return { ok: true }
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleTradeIntent(
  payload: TradeIntentPayload,
  sender: chrome.runtime.MessageSender,
): Promise<{ blocked: boolean; reason?: string; gateConfig?: object }> {
  const session  = await getLiveSession()
  const settings = await getSettings()
  const account  = await getActiveAccount()

  // --- Enforcement: check if already locked ---
  if (session?.lockState) {
    const remaining = session.lockState.lockedUntil - Date.now()
    if (remaining > 0) {
      return { blocked: true, reason: session.lockState.reason }
    }
    // Lock expired — clear it
    await patchLiveSession({ lockState: null })
  }

  // --- Enforcement: no trade mode ---
  if (session?.noTradeMode) {
    return { blocked: true, reason: 'no_trade_mode' }
  }

  // --- Enforcement: revenge trade check ---
  const enforcementMode = settings?.enforcementMode ?? 'training'
  if (enforcementMode !== 'training' && session) {
    const lastClosedAt = getLastClosedAt(session)
    const cooldownMs = (settings?.cooldownMinutes ?? 15) * 60_000
    if (lastClosedAt && (Date.now() - lastClosedAt) < cooldownMs) {
      // Don't block yet — let it go through with a warning in the gate
      // Hard blocks fire after gate answers
    }
  }

  // Create a new trade machine for this intent
  const machine = new TradeMachine(account?.id ?? 'default')
  activeTrades.set(machine.snapshot().tradeIntentId, machine)

  return {
    blocked: false,
    gateConfig: {
      intentId: machine.snapshot().tradeIntentId,
      riskPerTrade: session?.riskPerTrade ?? 0,
      symbol: payload.symbol,
      direction: payload.direction,
    },
  }
}

async function handleGateAnswered(
  payload: GateAnsweredPayload,
  sender: chrome.runtime.MessageSender,
): Promise<{ blocked: boolean; reason?: string }> {
  const { tradeIntentId, answers } = payload
  const machine = activeTrades.get(tradeIntentId)
  const settings = await getSettings()
  const account  = await getActiveAccount()
  const session  = await getLiveSession()
  const enforcementMode = settings?.enforcementMode ?? 'training'

  // Apply gate answers to the trade record
  machine?.applyGateAnswers(answers)

  // --- Hard block conditions ---
  const shouldBlock =
    answers.setupGrade === 'Impulse' ||
    answers.rulesFollowed === false

  if (shouldBlock && enforcementMode !== 'training') {
    const reason = answers.setupGrade === 'Impulse' ? 'impulse' : 'rule_broken'
    const lockDuration = await getLockDuration(reason)

    const lockId = await insertLock({
      userId: account?.userId ?? 'anon',
      accountId: account?.id ?? 'default',
      reason,
      reasonDetail: answers.setupGrade === 'Impulse'
        ? 'Impulse trade — you flagged this yourself.'
        : 'You reported breaking a rule in the pre-trade gate.',
      durationMinutes: lockDuration,
    })

    const lockedUntil = Date.now() + lockDuration * 60_000
    await patchLiveSession({
      lockState: {
        id: lockId ?? crypto.randomUUID(),
        reason,
        reasonDetail: answers.setupGrade === 'Impulse'
          ? 'Impulse trade — you flagged this yourself.'
          : 'Rule broken at gate.',
        lockedAt: Date.now(),
        lockedUntil,
      },
    })

    // Notify the content script
    if (sender.tab?.id) {
      await sendToTab<LockActivatePayload>(sender.tab.id, {
        type: 'TC_LOCK_ACTIVATE',
        payload: {
          reason,
          reasonDetail: 'Platform locked.',
          lockedUntil,
        },
      })
    }

    // Log the blocked trade attempt
    if (machine) {
      const record = { ...machine.snapshot(), flaggedUnplanned: false }
      await upsertTrade(account?.id ?? 'default', record)
    }

    return { blocked: true, reason }
  }

  // --- Risk check ---
  const riskLimit = session?.riskPerTrade ?? Infinity
  if (answers.intendedRisk > riskLimit && enforcementMode !== 'training') {
    return { blocked: true, reason: 'risk_exceeded' }
  }

  // Gate passed — advance state machine
  machine?.transition('ORDER_SUBMITTED')

  return { blocked: false }
}

async function handlePositionOpened(
  payload: PositionOpenedPayload,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const { position } = payload
  const account = await getActiveAccount()
  const session = await getLiveSession()
  const settings = await getSettings()

  // Increment trade count
  if (session) {
    const newCount = session.tradesOpenedToday + 1
    await patchLiveSession({ tradesOpenedToday: newCount })

    // Max trades check
    const maxTrades = settings?.maxTrades ?? Infinity
    if (newCount > maxTrades && settings?.enforcementMode !== 'training') {
      await triggerLock('max_trades', 'You have exceeded your daily trade limit.', sender)
      return
    }
  }

  // Try to find matching trade machine
  let machine = findMachineByPosition(position.symbol)
  if (!machine) {
    machine = TradeMachine.fromUnplannedPosition(account?.id ?? 'default')
    activeTrades.set(machine.snapshot().tradeIntentId, machine)
  }

  machine.setPosition(position.symbol, position.direction)
  machine.transition('POSITION_OPEN')

  await upsertTrade(account?.id ?? 'default', machine.snapshot())
}

async function handlePositionClosed(
  payload: PositionClosedPayload,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const { trade } = payload
  const account = await getActiveAccount()
  const session = await getLiveSession()
  const settings = await getSettings()

  // Update daily P&L
  const newPnl = (session?.dailyPnl ?? 0) + trade.pnl
  await patchLiveSession({ dailyPnl: newPnl })

  // Daily budget check
  const dailyBudget = session?.dailyBudget ?? Infinity
  if (newPnl < -dailyBudget && settings?.enforcementMode !== 'training') {
    await triggerLock('daily_budget', `Daily loss limit of $${dailyBudget.toFixed(2)} reached.`, sender)
    return
  }

  // Revenge trade check — record close time for next intent check
  await patchLiveSession({ lastTradeClosedAt: Date.now() })

  // Find trade machine and advance to POSITION_CLOSED
  const machine = findMachineByPosition(trade.symbol)
  if (machine && machine.canTransitionTo('POSITION_CLOSED')) {
    machine.setPnl(trade.pnl)
    machine.transition('POSITION_CLOSED')
    await upsertTrade(account?.id ?? 'default', machine.snapshot())
  }

  // Trigger exit reflection prompt in content script
  if (sender.tab?.id && machine) {
    const record = machine.snapshot()
    await sendToTab(sender.tab.id, {
      type: 'TC_GATE_OPEN',
      payload: { type: 'exit', tradeId: record.id, pnl: trade.pnl },
    })
  }
}

async function handleLockCheck(): Promise<{ locked: boolean; lockedUntil?: number; reason?: string }> {
  const session = await getLiveSession()
  const account = await getActiveAccount()

  // Check local storage first (fast path)
  if (session?.lockState) {
    const remaining = session.lockState.lockedUntil - Date.now()
    if (remaining > 0) {
      return { locked: true, lockedUntil: session.lockState.lockedUntil, reason: session.lockState.reason }
    }
    await patchLiveSession({ lockState: null })
  }

  // Check Supabase (persists across reinstalls)
  const { locked, lock } = await fetchActiveLock(account?.userId ?? 'anon')
  if (locked && lock) {
    const lockedUntil = new Date(lock.locked_until).getTime()
    return { locked: true, lockedUntil, reason: lock.reason }
  }

  return { locked: false }
}

async function handleLockRelease(
  payload: { lockId?: string; reason?: string; positionMgmtOnly?: boolean },
  _sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (payload.positionMgmtOnly) {
    // Allow position management only — don't clear the lock
    return
  }

  if (payload.lockId) {
    await overrideLock(payload.lockId, payload.reason ?? 'Manual override')
    await incrementOverrideCount()
  }
  await patchLiveSession({ lockState: null })
}

async function handleNoTradeModeOn(payload: { reason?: string }): Promise<void> {
  await patchLiveSession({ noTradeMode: true, noTradeModeReason: payload.reason })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildSessionStateResponse(): Promise<SessionStateResponse> {
  const session  = await getLiveSession()
  const settings = await getSettings()

  return {
    locked:          !!session?.lockState,
    lockedUntil:     session?.lockState?.lockedUntil,
    lockReason:      session?.lockState?.reason,
    noTradeMode:     session?.noTradeMode ?? false,
    tradesOpenedToday: session?.tradesOpenedToday ?? 0,
    dailyPnl:        session?.dailyPnl ?? 0,
    riskPerTrade:    session?.riskPerTrade ?? 0,
    dailyBudget:     session?.dailyBudget ?? 0,
    maxTrades:       settings?.maxTrades ?? 3,
    disciplineScore: session?.disciplineScore ?? 100,
  }
}

async function triggerLock(
  reason: string,
  detail: string,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const account = await getActiveAccount()
  const lockDuration = await getLockDuration(reason)
  const lockedUntil = Date.now() + lockDuration * 60_000

  await insertLock({
    userId: account?.userId ?? 'anon',
    accountId: account?.id ?? 'default',
    reason,
    reasonDetail: detail,
    durationMinutes: lockDuration,
  })

  await patchLiveSession({
    lockState: {
      id: crypto.randomUUID(),
      reason,
      reasonDetail: detail,
      lockedAt: Date.now(),
      lockedUntil,
    },
  })

  if (sender.tab?.id) {
    await sendToTab<LockActivatePayload>(sender.tab.id, {
      type: 'TC_LOCK_ACTIVATE',
      payload: { reason, reasonDetail: detail, lockedUntil },
    })
  }
}

async function getLockDuration(reason: string): Promise<number> {
  const overrides = await chrome.storage.local.get('overrideCount')
  const count: number = (overrides.overrideCount as number) ?? 0
  const multiplier = count >= 3 ? 3 : count >= 2 ? 2 : 1
  const base = reason === 'daily_budget' ? 24 * 60 : 30
  return base * multiplier
}

function findMachineByPosition(symbol: string): TradeMachine | undefined {
  for (const [, machine] of activeTrades) {
    const state = machine.getState()
    const record = machine.snapshot()
    if (
      (state === 'ORDER_SUBMITTED' || state === 'POSITION_OPEN' || state === 'POSITION_MODIFIED') &&
      (record.symbol === symbol || !record.symbol)
    ) {
      return machine
    }
  }
  return undefined
}

function getLastClosedAt(session: LiveSessionState): number | undefined {
  return session.lastTradeClosedAt
}

// ── Alarm handling (lock countdown persistence) ───────────────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'tc-lock-expired') {
    await patchLiveSession({ lockState: null })
    // Notify open trading tabs
    const tabs = await chrome.tabs.query({ active: true })
    for (const tab of tabs) {
      if (tab.id) {
        sendToTab(tab.id, { type: 'TC_LOCK_RELEASE' }).catch(() => { /* tab may not have content script */ })
      }
    }
  }
})

// On install / startup — restore lock state from Supabase
chrome.runtime.onStartup.addListener(async () => {
  const account = await getActiveAccount()
  if (!account) return
  const { locked, lock } = await fetchActiveLock(account.userId)
  if (locked && lock) {
    const lockedUntil = new Date(lock.locked_until).getTime()
    const session = await getLiveSession()
    if (session) {
      await setLiveSession({
        ...session,
        lockState: {
          id: lock.id,
          reason: lock.reason,
          reasonDetail: lock.reason_detail,
          lockedAt: new Date(lock.locked_at).getTime(),
          lockedUntil,
        },
      })
    }
  }
})
