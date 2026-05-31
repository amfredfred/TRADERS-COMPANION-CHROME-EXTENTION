import {
  getLiveSession,
  setLiveSession,
  patchLiveSession,
  getSettings,
  getActiveAccount,
  upsertTrade,
  incrementOverrideCount,
  getPlatformEnabled,
  setPlatformEnabled,
} from '../shared/lib/storage'
import type { LiveSessionState } from '../shared/lib/storage'
import { TradeMachine } from '../shared/state/tradeMachine'
import { fetchActiveLock, insertLock, overrideLock } from '../shared/lib/supabase'
import { sendToTab, TC_AI_STREAM_PORT, TC_TRADE_REVIEW_PORT } from '../shared/lib/messages'
import { createAIModel } from '../shared/ai/createAIModel'
import { getProviderCapability, getProviderApiKey, getProviderModel, promptLikelyRequiresVision } from '../shared/ai/providerConfig'
import { CHART_CAPTURE_INTENTS } from '../shared/ai/chatIntent'
import type { ChatIntent } from '../shared/ai/chatIntent'
import type {
  AIStreamStartPayload,
  TCMessage,
  TradeIntentPayload,
  GateAnsweredPayload,
  PositionOpenedPayload,
  PositionClosedPayload,
  LockActivatePayload,
  SessionStateResponse,
  CurrentTabStatusResponse,
  ContentStatusPayload,
  AppStateResponse,
  AgentToolRequest,
} from '../shared/lib/messages'
import type { Playbook, SessionSettings } from '../shared/types/playbook'
import type { AccountChangeEvent, DetectedAccount, PlatformLifecycleState, PlatformSnapshot, TabPinState } from '../shared/types/platform'
import type { PlatformName } from '../content/adapters/types'
import {
  CONNECTED_TAB_STORAGE_KEY,
  clearConnectedTabState,
  getConnectedTabState,
  setConnectedTabStateFromTab,
  patchConnectedTabState,
} from './connectedTabStore'
import { captureConnectedTab } from './captureConnectedTab'
import { captureChartRegion } from './captureChartRegion'
import type { ChartRegion } from '../shared/types/chart'

// In-memory map of active trade machines (keyed by intentId)
const activeTrades = new Map<string, TradeMachine>()

type BalanceCandidateState = {
  value: number
  sourceKey: string
  count: number
}

const balanceCandidates = new Map<number, BalanceCandidateState>()

type AccountCandidateState = {
  accountKey: string
  detectedAccount: DetectedAccount
  count: number
}

const accountCandidates = new Map<number, AccountCandidateState>()
const activeAccountKeys = new Map<number, string>()
let lastAccountChange: AccountChangeEvent | null = null

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: TCMessage, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[TC SW] Message handler error', err)
      sendResponse({ ok: false, error: String(err) })
    })
  return true // keep port open for async response
})

chrome.runtime.onConnect.addListener(port => {
  // ── Chat stream port ────────────────────────────────────────────────────────
  if (port.name === TC_AI_STREAM_PORT) {
    let controller: AbortController | null = null

    port.onMessage.addListener(async message => {
      if (message?.type === 'TC_AI_STREAM_CANCEL') {
        controller?.abort()
        controller = null
        return
      }

      if (message?.type !== 'TC_AI_STREAM_START') return

      controller?.abort()
      controller = new AbortController()

      try {
        await handleAIStream(port, message.payload as AIStreamStartPayload, controller.signal)
      } catch (error) {
        port.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
      } finally {
        controller = null
      }
    })

    port.onDisconnect.addListener(() => {
      controller?.abort()
      controller = null
    })
    return
  }

  // ── Trade review port ───────────────────────────────────────────────────────
  if (port.name === TC_TRADE_REVIEW_PORT) {
    let controller: AbortController | null = null

    port.onMessage.addListener(async message => {
      if (message?.type === 'TC_TRADE_REVIEW_CANCEL') {
        controller?.abort()
        controller = null
        return
      }

      if (message?.type !== 'TC_TRADE_REVIEW_START') return

      controller?.abort()
      controller = new AbortController()

      try {
        await handleTradeReview(
          port,
          message.payload as { intentId: string; direction: 'long' | 'short'; symbol: string | null },
          controller.signal,
        )
      } catch (error) {
        try {
          port.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
        } catch { /* disconnected */ }
      } finally {
        controller = null
      }
    })

    port.onDisconnect.addListener(() => {
      controller?.abort()
      controller = null
    })
    return
  }
})

async function handleMessage(
  msg: TCMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (msg.type) {
    case 'TC_GET_SESSION_STATE':
      return buildSessionStateResponse()

    case 'TC_GET_APP_STATE':
      return buildAppState()

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

    case 'TC_GET_CURRENT_TAB_STATUS':
      return handleCurrentTabStatus()

    case 'TC_ENABLE_PLATFORM':
      return handleEnablePlatform(msg.payload as { platformId: string; enabled: boolean })

    case 'TC_CONTENT_STATUS':
      return handleContentStatus(msg.payload as ContentStatusPayload, sender)

    case 'TC_GET_CONNECTED_TAB_STATUS':
      return handleConnectedTabStatus()

    case 'TC_ATTACH_CURRENT_TAB':
    case 'TC_RECONNECT_CURRENT_TAB':
      return handleAttachCurrentTab()

    case 'TC_CLEAR_CONNECTED_TAB':
      return handleClearConnectedTab()

    case 'TC_CAPTURE_CONNECTED_TAB':
      return captureConnectedTab()

    case 'TC_OPEN_SIDE_PANEL':
    case 'TC_OPEN_SIDECAR':
      return handleOpenSidePanel(msg.payload as { tabId?: number } | undefined)

    case 'TC_RUN_DIAGNOSTICS':
      return handleDiagnostics()

    case 'TC_TEST_AI_PROVIDER':
      return handleTestAIProvider()

    case 'TC_REINJECT_CONTENT_SCRIPT':
      return handleReinjectContentScript(msg.payload as { tabId?: number } | undefined)

    case 'TC_HEALTH_CHECK': {
      const hc = msg.payload as { balance?: number | null; equity?: number | null; pnl?: number | null } | undefined
      const detectedBalance = hc?.balance ?? hc?.equity ?? null
      if (detectedBalance && detectedBalance > 0) {
        const tabId = sender.tab?.id ?? 0
        if (await shouldAcceptBalanceCandidate(tabId, detectedBalance, 'health_check')) {
          await syncLiveSessionFromBalance(detectedBalance, 'Detected platform')
          await broadcastAppStateChanged()
        }
      }
      return { ok: true }
    }

    case 'TC_GET_PIN_STATE':
      return handleGetPinState(sender)

    case 'TC_PIN_TAB':
      return handlePinTab()

    case 'TC_UNPIN_TAB':
      return handleUnpinTab(sender)

    case 'TC_COMPANION_COLLAPSE':
      return handleCompanionCollapse(sender, msg.payload as { collapsed?: boolean })

    case 'TC_AGENT_TOOL_REQUEST':
      return handleAgentToolRequest(sender, msg.payload as AgentToolRequest)

    case 'TC_CAPTURE_CHART_REGION':
      return captureChartRegion()

    case 'TC_CLEAR_CHART_ANNOTATIONS': {
      const connected = await getConnectedTabState()
      if (connected?.tabId) {
        await sendToTab(connected.tabId, { type: 'TC_CLEAR_CHART_ANNOTATIONS' }).catch(() => {})
      }
      return { ok: true }
    }

    case 'TC_START_CHART_SELECTION': {
      const connected = await getConnectedTabState()
      if (!connected?.tabId) return { ok: false, error: 'No connected tab.' }
      return sendToTab(connected.tabId, { type: 'TC_START_CHART_SELECTION' }).catch(() => ({ ok: false, error: 'Content script unreachable.' }))
    }

    default:
      return { ok: true }
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleTradeIntent(
  payload: TradeIntentPayload,
  _sender: chrome.runtime.MessageSender,
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

  // Create a new trade machine for this intent.
  // Immediately advance to ORDER_SUBMITTED so that when the broker detects the
  // position (TC_POSITION_OPENED) the machine is in a valid state to receive
  // POSITION_OPEN without waiting for a gate answer (advisory-only flow).
  const machine = new TradeMachine(getSessionAccountId(session, account?.id))
  machine.transition('ORDER_SUBMITTED')
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
      await upsertTrade(getSessionAccountId(await getLiveSession(), account?.id), record)
    }

    return { blocked: true, reason }
  }

  // Gate passed — advance state machine (guard against advisory-flow double-advance)
  if (machine?.canTransitionTo('ORDER_SUBMITTED')) {
    machine.transition('ORDER_SUBMITTED')
  }

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
  const scopedAccountId = getSessionAccountId(session, account?.id)

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
    machine = TradeMachine.fromUnplannedPosition(scopedAccountId)
    activeTrades.set(machine.snapshot().tradeIntentId, machine)
  }

  machine.setPosition(position.symbol, position.direction)
  machine.transition('POSITION_OPEN')

  await upsertTrade(scopedAccountId, machine.snapshot())
}

async function handlePositionClosed(
  payload: PositionClosedPayload,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const { trade } = payload
  const account = await getActiveAccount()
  const session = await getLiveSession()
  const settings = await getSettings()
  const scopedAccountId = getSessionAccountId(session, account?.id)

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
    await upsertTrade(scopedAccountId, machine.snapshot())
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

async function handleCurrentTabStatus(): Promise<CurrentTabStatusResponse> {
  const tab = await getActiveTab()
  if (!tab?.id) {
    return { tabId: null, domain: '', url: '', title: '', pinned: false, status: 'not_eligible', confidence: 0 }
  }

  const url = tab.url ?? ''
  const domain = safeDomain(url)
  const pinState = await getPinState(tab.id)
  const isPinned = !!pinState?.pinned

  const detectedPlatform = getPermittedPlatformForUrl(url)

  // Not a permitted platform — return immediately, no injection
  if (!detectedPlatform && !isPinned) {
    return {
      tabId: tab.id, domain, url,
      title: tab.title ?? domain,
      pinned: false, status: 'not_eligible', confidence: 0,
    }
  }

  // Permitted platform — check if it's enabled in settings
  if (detectedPlatform) {
    const enabled = await getPlatformEnabled(detectedPlatform.id)
    if (!enabled) {
      return {
        tabId: tab.id, domain, url,
        title: tab.title ?? domain,
        pinned: isPinned,
        status: 'platform_disabled',
        confidence: 0,
        detectedPlatformId: detectedPlatform.id,
        detectedPlatformName: detectedPlatform.name,
      }
    }
  }

  await ensureContentScriptInjected(tab.id).catch(() => {})
  const snapshot = await getTabSnapshot(tab.id).catch(() => null)

  let status: CurrentTabStatusResponse['status']
  if (isPinned && pinState?.mode === 'manual_attach') {
    status = 'manual_attached'
  } else if (snapshot?.status && snapshot.status !== 'not_eligible') {
    status = snapshot.status
  } else if (detectedPlatform) {
    status = 'candidate'
  } else {
    status = snapshot?.status ?? 'not_eligible'
  }

  return {
    tabId: tab.id, domain, url,
    title: tab.title ?? domain,
    pinned: isPinned,
    pinState: pinState ?? undefined,
    snapshot: snapshot ?? undefined,
    status,
    confidence: snapshot?.confidence ?? (detectedPlatform ? 20 : 0),
    detectedPlatformId: detectedPlatform?.id ?? snapshot?.adapterId,
    detectedPlatformName: detectedPlatform?.name ?? snapshot?.platformName,
  }
}

async function handleEnablePlatform(payload: { platformId: string; enabled: boolean }): Promise<{ ok: boolean }> {
  await setPlatformEnabled(payload.platformId, payload.enabled)
  await broadcastAppStateChanged()
  return { ok: true }
}

async function handleContentStatus(
  payload: ContentStatusPayload,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean }> {
  const tab = sender.tab
  const snapshot = payload.snapshot

  if (tab?.id && tab.url && snapshot.status !== 'not_eligible') {
    const pinState: TabPinState = {
      tabId: tab.id,
      origin: safeOrigin(tab.url),
      urlPattern: tab.url,
      pinned: true,
      mode: 'auto_platform',
      panelCollapsed: false,
      adapterId: snapshot.adapterId,
      lastSnapshotAt: Date.now(),
    }
    await setPinState(pinState).catch(() => {})
    await setConnectedTabStateFromTab(tab, {
      mode: 'auto_platform',
      adapterId: snapshot.adapterId,
    }).catch(() => {})
  }

  const detectedBalance = payload.balance ?? payload.equity ?? snapshot.accountBalance ?? null
  const detectedAccount = payload.detectedAccount ?? snapshot.detectedAccount ?? null
  chrome.runtime.sendMessage({ type: 'CONTENT_PLATFORM_DETECTED', payload: snapshot, timestamp: Date.now() }).catch(() => {})
  if (detectedBalance && detectedBalance > 0) {
    chrome.runtime.sendMessage({ type: 'CONTENT_BALANCE_UPDATED', payload: { balance: detectedBalance, equity: payload.equity ?? null, snapshot }, timestamp: Date.now() }).catch(() => {})
  }
  if (tab?.id && detectedAccount) {
    await handleDetectedAccount(tab.id, detectedAccount, detectedBalance, payload.equity ?? null)
  } else if (detectedBalance && detectedBalance > 0) {
    const liveSession = await getLiveSession().catch(() => null)
    if (liveSession?.startedAt) {
      await patchLiveSession({
        detectedBalance,
        detectedEquity: payload.equity ?? liveSession.detectedEquity ?? null,
        lastSyncedAt: Date.now(),
      })
      await broadcastSessionEvent('SESSION_STATE_UPDATED')
    }
    const sourceKey = `${snapshot.adapterId}:${snapshot.origin}:${snapshot.platformName}`
    if (tab?.id && await shouldAcceptBalanceCandidate(tab.id, detectedBalance, sourceKey)) {
      await syncLiveSessionFromBalance(detectedBalance, snapshot.platformName)
    }
  }

  await broadcastAppStateChanged()
  return { ok: true }
}

// Authoritative connected-tab status for sidepanel normal refresh.
async function handleConnectedTabStatus(): Promise<CurrentTabStatusResponse> {
  const connected = await getConnectedTabState()

  if (!connected?.tabId) {
    return {
      tabId: null,
      domain: '',
      url: '',
      title: '',
      pinned: false,
      status: 'not_eligible',
      confidence: 0,
    }
  }

  const tab = await chrome.tabs.get(connected.tabId).catch(() => null)

  if (!tab?.id) {
    await clearConnectedTabState()
    return {
      tabId: null,
      domain: '',
      url: '',
      title: '',
      pinned: false,
      status: 'not_eligible',
      confidence: 0,
    }
  }

  await ensureContentScriptInjected(tab.id).catch(() => {})
  const snapshot = await getTabSnapshot(tab.id).catch(() => null)

  const isAutoDetected =
    snapshot?.status === 'adapter_active' || snapshot?.status === 'verified_platform'

  await patchConnectedTabState({
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    adapterId: snapshot?.adapterId ?? connected.adapterId,
    mode: isAutoDetected ? 'auto_platform' : connected.mode,
  })

  const domain = safeDomain(tab.url ?? '')
  const status: CurrentTabStatusResponse['status'] =
    snapshot?.status === 'adapter_active'
      ? 'adapter_active'
      : snapshot?.status === 'verified_platform'
        ? 'verified_platform'
        : snapshot?.status === 'candidate'
          ? 'candidate'
          : connected.mode === 'manual_attach'
            ? 'manual_attached'
            : isPermittedTradingPlatform(tab.url ?? '')
              ? 'candidate'
              : 'not_eligible'

  return {
    tabId: tab.id,
    domain,
    url: tab.url ?? '',
    title: tab.title ?? domain,
    pinned: true,
    pinState: await getPinState(tab.id).catch(() => undefined) ?? undefined,
    snapshot: snapshot ?? undefined,
    status,
    confidence: snapshot?.confidence ?? (isPermittedTradingPlatform(tab.url ?? '') ? 20 : 0),
  }
}

async function handleAttachCurrentTab(): Promise<{ ok: boolean; pinState?: TabPinState; error?: string }> {
  const tab = await getActiveTab()
  if (!tab?.id || !tab.url) return { ok: false, error: 'No active tab available.' }
  if (!isPermittedTradingPlatform(tab.url)) {
    return { ok: false, error: 'Trader\'s Companion only supports MT5 Web and Match-Trader.' }
  }
  return pinSpecificTab(tab)
}

async function handleClearConnectedTab(_sender?: chrome.runtime.MessageSender): Promise<{ ok: boolean }> {
  const connected = await getConnectedTabState()
  await clearConnectedTabState()
  if (connected?.tabId) {
    await sendToTab(connected.tabId, { type: 'TC_COMPANION_UNPINNED' }).catch(() => {})
  }
  return { ok: true }
}

async function handleGetPinState(sender: chrome.runtime.MessageSender): Promise<TabPinState | null> {
  const tabId = sender.tab?.id
  if (!tabId) return null
  return getPinState(tabId)
}

async function handlePinTab(): Promise<{ ok: boolean; pinState?: TabPinState; error?: string }> {
  const tab = await getActiveTab()
  if (!tab?.id || !tab.url) return { ok: false, error: 'No active tab available.' }
  if (!isPermittedTradingPlatform(tab.url)) {
    return { ok: false, error: 'Trader\'s Companion only supports MT5 Web and Match-Trader.' }
  }
  return pinSpecificTab(tab)
}

async function pinSpecificTab(tab: chrome.tabs.Tab): Promise<{ ok: boolean; pinState?: TabPinState; error?: string }> {
  if (!tab.id || !tab.url) return { ok: false, error: 'No tab available.' }

  await ensureContentScriptInjected(tab.id).catch(() => {})
  const snapshot = await getTabSnapshot(tab.id).catch(() => null)

  const pinState: TabPinState = {
    tabId: tab.id,
    origin: safeOrigin(tab.url),
    urlPattern: tab.url,
    pinned: true,
    mode: (snapshot?.status === 'adapter_active' || snapshot?.status === 'verified_platform') ? 'auto_platform' : 'manual_attach',
    panelCollapsed: false,
    adapterId: snapshot?.adapterId ?? 'generic',
    lastSnapshotAt: Date.now(),
  }

  await setPinState(pinState)
  await setConnectedTabStateFromTab(tab, {
    mode: pinState.mode,
    adapterId: pinState.adapterId,
  })

  return { ok: true, pinState }
}

async function handleOpenSidePanel(payload?: { tabId?: number }): Promise<{ ok: boolean; error?: string }> {
  const targetTab = payload?.tabId ? await chrome.tabs.get(payload.tabId).catch(() => null) : await getActiveTab()
  if (!targetTab?.id || !targetTab.url) return { ok: false, error: 'No active tab found.' }

  const pinResult = await pinSpecificTab(targetTab)
  if (!pinResult.ok || !pinResult.pinState?.tabId) {
    return { ok: false, error: pinResult.error ?? 'Could not attach to current tab.' }
  }

  const tabId = pinResult.pinState.tabId
  const sidePanel = getSidePanelApi()

  if (!sidePanel) {
    return { ok: false, error: 'Chrome Side Panel API is unavailable. Update Chrome to use Trader\'s Companion.' }
  }

  try {
    await sidePanel.setOptions({ tabId, path: 'src/sidepanel/index.html', enabled: true })
    await sidePanel.open({ tabId })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not open side panel: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function handleUnpinTab(sender: chrome.runtime.MessageSender): Promise<{ ok: boolean }> {
  const tab = sender.tab ?? await getPinnedOrActiveTab()
  if (tab?.id) {
    await chrome.storage.session.remove(pinKey(tab.id))
    await sendToTab(tab.id, { type: 'TC_COMPANION_UNPINNED' }).catch(() => {})
  }
  await clearConnectedTabState()
  return { ok: true }
}

async function handleCompanionCollapse(sender: chrome.runtime.MessageSender, payload: { collapsed?: boolean }): Promise<{ ok: boolean }> {
  const tab = sender.tab ?? await getPinnedOrActiveTab()
  if (!tab?.id) return { ok: false }
  const current = await getPinState(tab.id)
  if (current) {
    const next = { ...current, panelCollapsed: !!payload.collapsed, lastSnapshotAt: Date.now() }
    await setPinState(next)
    await sendToTab(tab.id, { type: 'TC_COMPANION_COLLAPSE', payload: { collapsed: next.panelCollapsed } }).catch(() => {})
  }
  return { ok: true }
}

async function handleAgentToolRequest(_sender: chrome.runtime.MessageSender, payload: AgentToolRequest): Promise<unknown> {
  // Chart capture: extract canvas layers directly, fallback to cropped screenshot.
  if (payload.tool === 'captureVisibleChart' || payload.tool === 'captureConnectedChart') {
    const result = await captureChartRegion()
    if (!result.ok) return result
    // Return dataUrl alias so browserAgent.ts callers keep working
    return { ...result, dataUrl: result.croppedDataUrl }
  }

  if (payload.tool === 'getUserRules') {
    const settings = await getSettings()
    const account = await getActiveAccount()
    const playbooks = await chrome.storage.local.get(`playbooks_${account?.id ?? 'default'}`)
    return { settings, playbooks: playbooks[`playbooks_${account?.id ?? 'default'}`] ?? [] }
  }

  if (payload.tool === 'getSessionState') {
    return buildSessionStateResponse()
  }

  const tab = await resolveConnectedTab(payload.tabId)
  if (!tab?.id) return { ok: false, error: 'No connected trading tab available.' }

  if (payload.tool === 'getPlatformSnapshot') {
    const snapshot = await getTabSnapshot(tab.id)
    return snapshot ?? { ok: false, error: 'Platform snapshot unavailable.' }
  }

  if (payload.tool === 'getVisiblePageText') {
    await ensureContentScriptInjected(tab.id).catch(() => {})
    return sendToTab(tab.id, { type: 'TC_AGENT_TOOL_REQUEST', payload }).catch(err => ({ ok: false, error: String(err) }))
  }

  return { ok: false, error: 'Tool not available in background.' }
}

async function handleAIStream(
  port: chrome.runtime.Port,
  payload: AIStreamStartPayload,
  signal: AbortSignal,
): Promise<void> {
  const settings = await getSettings()
  if (!settings) {
    port.postMessage({ type: 'error', error: 'TC settings are not configured.' })
    return
  }

  const intent = (payload.intent ?? 'unknown') as ChatIntent
  const includeChartContext = CHART_CAPTURE_INTENTS.has(intent)

  // Vision gating — only relevant for chart review intents.
  if (includeChartContext) {
    const providerMeta = getProviderCapability(settings.aiProvider)
    if (promptLikelyRequiresVision(payload.prompt) && !providerMeta.supportsVision) {
      port.postMessage({
        type: 'error',
        error: `${providerMeta.label} is connected, but the selected model is not configured for image/chart review. Use a vision-capable provider or ask a text-only question.`,
      })
      return
    }
  }

  // Only resolve the connected tab when chart context is actually needed.
  const tab = includeChartContext ? await resolveConnectedTab(payload.tabId) : null
  const canReadConnectedTab = !!tab?.id

  const account = await getActiveAccount()
  const playbookResult = await chrome.storage.local.get(`playbooks_${account?.id ?? 'default'}`)
  const playbooks = (playbookResult[`playbooks_${account?.id ?? 'default'}`] as Playbook[] | undefined) ?? []

  // Fetch snapshot + visible text only for chart intents, session for everything else.
  let snapshot = null
  let visibleText = ''
  const session = await buildSessionStateResponse()

  if (canReadConnectedTab) {
    const [snap, text] = await Promise.all([
      getTabSnapshot(tab!.id!).catch(() => null),
      sendToTab(tab!.id!, { type: 'TC_AGENT_TOOL_REQUEST', payload: { tool: 'getVisiblePageText' } }).catch(() => ''),
    ])
    snapshot = snap
    visibleText = typeof text === 'string' ? text : ''
  }

  if (signal.aborted) return

  // Capture function — used by the model's two-turn tool mechanism (chart_review).
  let capturedRegion: ChartRegion | undefined
  let captureId: string | undefined
  let capturedAt: number | undefined
  let preScreenshotDataUrl: string | undefined

  const captureChart = async (): Promise<string | null> => {
    const result = await captureChartRegion()

    if (!result.ok) {
      try { port.postMessage({ type: 'error', error: result.error }) } catch { /* disconnected */ }
      return null
    }

    capturedRegion = result.region
    captureId = result.captureId
    capturedAt = result.capturedAt

    try {
      port.postMessage({ type: 'screenshot', screenshotDataUrl: result.croppedDataUrl })
    } catch { /* disconnected */ }

    return result.croppedDataUrl
  }

  // For force_chart_recapture: capture BEFORE calling the model so the image is
  // injected directly into the payload and the model cannot answer from history.
  if (intent === 'force_chart_recapture') {
    try { port.postMessage({ type: 'activity', activity: 'Capturing connected chart…' }) } catch { /* disconnected */ }

    const forceResult = await captureChartRegion()
    if (!forceResult.ok) {
      try { port.postMessage({ type: 'error', error: forceResult.error }) } catch { /* disconnected */ }
      return
    }

    capturedRegion = forceResult.region
    captureId = forceResult.captureId
    capturedAt = forceResult.capturedAt
    preScreenshotDataUrl = forceResult.croppedDataUrl

    try {
      port.postMessage({ type: 'screenshot', screenshotDataUrl: preScreenshotDataUrl })
    } catch { /* disconnected */ }
  } else if (!includeChartContext) {
    console.info('[TC_CONTEXT]', { reusedPreviousChartContext: false, reason: 'intent does not require chart capture', intent })
  }

  const model = createAIModel(settings)
  await model.streamChat(
    {
      prompt: payload.prompt,
      messages: payload.messages,
      settings,
      session,
      playbooks,
      snapshot,
      visibleText,
      intent,
      includeChartContext,
      capturedRegion,
      captureId,
      capturedAt,
      screenshotDataUrl: preScreenshotDataUrl,
    },
    async chunk => {
      // Dispatch annotation overlays to the connected chart tab before forwarding the chunk.
      if (chunk.type === 'annotations' && chunk.annotations && chunk.annotations.length > 0) {
        const connectedState = await getConnectedTabState().catch(() => null)
        if (connectedState?.tabId) {
          sendToTab(connectedState.tabId, {
            type: 'TC_RENDER_CHART_ANNOTATIONS',
            payload: { annotations: chunk.annotations, region: chunk.annotationRegion },
          }).catch(() => { /* tab may have navigated */ })
        }
      }
      // Forward all chunks to the sidepanel port, enriching the capture metadata
      // so the UI can show captureId / capturedAt if needed in future.
      try {
        port.postMessage(chunk)
      } catch {
        // Port was disconnected while the provider stream was active.
      }
    },
    captureChart,
    signal,
  )
}

async function handleTradeReview(
  port: chrome.runtime.Port,
  payload: { intentId: string; direction: 'long' | 'short'; symbol: string | null },
  signal: AbortSignal,
): Promise<void> {
  const settings = await getSettings()
  if (!settings || settings.aiProvider === 'off') {
    try {
      port.postMessage({ type: 'error', error: 'No AI provider configured. Add one in Settings → AI Provider.' })
    } catch { /* disconnected */ }
    return
  }

  const account = await getActiveAccount()
  const session = await buildSessionStateResponse()
  const playbookResult = await chrome.storage.local.get(`playbooks_${account?.id ?? 'default'}`)
  const playbooks = (playbookResult[`playbooks_${account?.id ?? 'default'}`] as Playbook[] | undefined) ?? []
  const activePlaybook = playbooks.find(p => p.active)

  // ── Capture chart (best effort — continue text-only if it fails) ────────────
  let screenshotDataUrl: string | undefined
  let captureId: string | undefined
  let capturedAt: number | undefined

  try { port.postMessage({ type: 'activity', activity: 'Capturing chart…' }) } catch { return }

  const captureResult = await captureChartRegion()
  if (captureResult.ok) {
    screenshotDataUrl = captureResult.croppedDataUrl
    captureId = captureResult.captureId
    capturedAt = captureResult.capturedAt
    try { port.postMessage({ type: 'screenshot', screenshotDataUrl }) } catch { return }
  }
  // If capture failed we continue with text-only — no error surfaced to user.

  if (signal.aborted) return

  // ── System prompt — advisory-only trade review ─────────────────────────────
  const systemOverride = [
    `You are Trader's Companion, a trade review assistant.`,
    `Your role is advisory — the trader makes all execution decisions.`,
    ``,
    `Review the setup and output exactly seven sections. No text before or after.`,
    ``,
    `**Quality:** [Strong / Average / Weak] — one sentence on setup quality.`,
    `**Suggestion:** [Good to go / Proceed with caution / Consider skipping] — one sentence.`,
    `**Playbook match:** [Yes / Partial / No] — one sentence.`,
    `**Risk check:** one line (risk vs. limit, trades used, daily budget remaining).`,
    `**Key levels:** one line (stop zone and target if visible; "not visible" if unclear).`,
    `**Invalidation:** one line — what price action would invalidate this idea.`,
    `**Note:** Advisory only — execution is always the trader's decision.`,
    ``,
    `Rules:`,
    `- Never say "buy" or "sell" — use "long", "short", or "the trade".`,
    `- If chart is unclear or missing, say so — do not invent price levels.`,
    `- One short sentence per section. No extra commentary.`,
  ].join('\n')

  // ── Context prompt — fully self-contained, injected as the user message ────
  const ctxLines: string[] = [
    `Trade review request:`,
    `- Direction: ${payload.direction === 'long' ? 'Long (Buy)' : 'Short (Sell)'}`,
    `- Symbol: ${payload.symbol ?? 'not detected'}`,
    `- Playbook: ${activePlaybook?.name ?? 'none selected'}`,
  ]
  if (activePlaybook?.stopRule) ctxLines.push(`- Stop rule: ${activePlaybook.stopRule}`)
  if (activePlaybook?.entryConfirmation) ctxLines.push(`- Entry confirmation: ${activePlaybook.entryConfirmation}`)
  ctxLines.push(
    `- Account balance: ${session.accountBalance ? `$${session.accountBalance.toFixed(2)}` : 'not available'}`,
    `- Risk per trade: ${session.riskPerTrade ? `$${session.riskPerTrade.toFixed(2)}` : 'not set'}`,
    `- Daily budget: ${session.dailyBudget ? `$${session.dailyBudget.toFixed(2)}` : 'not set'}`,
    `- Daily P&L: ${session.dailyPnl >= 0 ? '+' : ''}$${session.dailyPnl.toFixed(2)}`,
    `- Trades today: ${session.tradesOpenedToday} / ${session.maxTrades}`,
    `- No Trade Mode: ${session.noTradeMode ? 'ON' : 'off'}`,
    `- Locked: ${session.locked ? 'YES' : 'no'}`,
    ``,
    screenshotDataUrl
      ? `A fresh chart screenshot is attached. Review this setup and respond in the required format.`
      : `No chart was captured. Review this setup based on session and playbook data only. Respond in the required format.`,
  )

  const model = createAIModel(settings)
  await model.streamChat(
    {
      prompt: ctxLines.join('\n'),
      messages: [],
      settings,
      session,
      playbooks,
      snapshot: null,
      visibleText: '',
      intent: 'chart_review',
      includeChartContext: false,
      systemOverride,
      contextLevel: 'none',
      screenshotDataUrl,
      captureId,
      capturedAt,
    },
    chunk => {
      try { port.postMessage(chunk) } catch { /* disconnected */ }
    },
    async () => null, // capture tool not offered — image already provided or unavailable
    signal,
  )
}

async function handleReinjectContentScript(payload?: { tabId?: number }): Promise<{ ok: boolean; error?: string }> {
  const tab = await resolveConnectedTab(payload?.tabId)
  if (!tab?.id) return { ok: false, error: 'No connected tab found.' }
  try {
    await ensureContentScriptInjected(tab.id, true)
    return { ok: true }
  } catch (error) {
    console.error('[TC SW] Content script reinjection failed:', error)
    return { ok: false, error: String(error) }
  }
}

async function handleDiagnostics(): Promise<Record<string, unknown>> {
  const tab = await getActiveTab()
  const sidePanel = getSidePanelApi()
  let storageAvailable = false
  let contentConnected = false
  let lastError = ''

  try {
    await chrome.storage.session.get('__tc_diag__')
    storageAvailable = true
  } catch (error) {
    lastError = String(error)
  }

  if (tab?.id) {
    try {
      await ensureContentScriptInjected(tab.id)
      contentConnected = !!(await getTabSnapshot(tab.id))
    } catch (error) {
      lastError = String(error)
    }
  }

  return {
    ok: true,
    extensionContext: !!chrome.runtime?.id,
    activeTabId: tab?.id ?? null,
    sidePanelApi: !!sidePanel?.open,
    storageAvailable,
    contentConnected,
    adapterStatus: tab?.id ? (await getTabSnapshot(tab.id).catch(() => null))?.status ?? 'unavailable' : 'no_tab',
    lastError,
  }
}

async function handleTestAIProvider(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings()
  if (!settings) return { ok: false, error: 'TC settings are not configured.' }

  const meta = getProviderCapability(settings.aiProvider)
  if (settings.aiProvider === 'off') {
    return { ok: false, error: 'AI review is disabled. Select a provider first.' }
  }

  const key = getProviderApiKey(settings)?.trim()
  const model = getProviderModel(settings)?.trim()

  if (!key) return { ok: false, error: `${meta.label} API key is missing. Add it in Settings -> AI Provider.` }
  if (!model) return { ok: false, error: `${meta.label} model is missing.` }

  if (settings.aiProvider === 'claude') {
    return testClaudeConnection(key, model)
  }

  return testOpenAICompatibleConnection({
    label: meta.label,
    baseUrl: meta.baseUrl!,
    apiKey: key,
    model,
  })
}

async function testClaudeConnection(key: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Return OK.' }],
      }),
    })
    if (!response.ok) return { ok: false, error: `Claude connection failed: ${response.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function testOpenAICompatibleConnection(args: {
  label: string
  baseUrl: string
  apiKey: string
  model: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${args.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: [{ role: 'user', content: 'Return OK.' }],
        max_tokens: 8,
        stream: false,
      }),
    })

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      return { ok: false, error: `${args.label} connection failed: ${response.status} ${err}` }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildSessionStateResponse(): Promise<SessionStateResponse> {
  const session  = await getLiveSession()
  const settings = await getSettings()
  const lockedBalance = session?.lockedBalance ?? session?.accountBalance ?? 0
  const calculated = calculateSessionValues(lockedBalance, settings)
  const dailyPnl = session?.dailyPnl ?? 0
  const budgetLeft = Math.max(0, calculated.dailyBudget + Math.min(0, dailyPnl))
  const maxTrades = settings?.maxTrades ?? session?.maxTrades ?? 3
  const tradesOpenedToday = session?.tradesOpenedToday ?? 0

  return {
    locked:          !!session?.lockState,
    lockedUntil:     session?.lockState?.lockedUntil,
    lockReason:      session?.lockState?.reason,
    noTradeMode:     session?.noTradeMode ?? false,
    tradesOpenedToday,
    dailyPnl,
    riskPerTrade:    calculated.riskPerTrade,
    dailyBudget:     calculated.dailyBudget,
    maxTrades,
    disciplineScore: session?.disciplineScore ?? 0,
    accountBalance:  lockedBalance,
    detectedBalance: session?.detectedBalance ?? session?.accountBalance ?? null,
    lockedSessionBalance: lockedBalance || null,
    detectedEquity:  session?.detectedEquity ?? null,
    lockedEquity:    session?.lockedEquity ?? null,
    startedAt:       session?.startedAt,
    platform:         session?.platform,
    accountKey:       session?.accountKey,
    accountName:      session?.accountName,
    accountType:      session?.accountType,
    currency:         session?.currency,
    balanceSource:    session?.sessionSource,
    budgetLeft,
    tradesRemaining: Math.max(0, maxTrades - tradesOpenedToday),
    lastSyncedAt:     session?.lastSyncedAt,
  }
}

async function buildAppState(): Promise<AppStateResponse> {
  const [tab, session, settings] = await Promise.all([
    handleCurrentTabStatus(),
    buildSessionStateResponse(),
    getSettings().catch(() => null),
  ])
  const snapshot = tab.snapshot
  const lifecycle = resolveLifecycle(tab, session)

  return {
    lifecycle,
    tab,
    session,
    snapshot: snapshot ?? undefined,
    platformName: tab.detectedPlatformName ?? snapshot?.platformName,
    detectedAccount: snapshot?.detectedAccount ?? null,
    accountChange: lastAccountChange,
    statusReason: lifecycleReason(lifecycle, tab, session),
    protection: buildProtectionStatus(session, settings, snapshot),
  }
}

async function handleDetectedAccount(
  tabId: number,
  detectedAccount: DetectedAccount,
  detectedBalance: number | null,
  detectedEquity: number | null,
): Promise<void> {
  const enriched: DetectedAccount = {
    ...detectedAccount,
    balance: detectedAccount.balance ?? detectedBalance,
    equity: detectedAccount.equity ?? detectedEquity,
  }
  const accountKey = getDetectedAccountKey(enriched)
  if (!accountKey) return

  const current = accountCandidates.get(tabId)
  const nextCount = current?.accountKey === accountKey ? current.count + 1 : 1
  accountCandidates.set(tabId, { accountKey, detectedAccount: { ...enriched, accountKey }, count: nextCount })
  debugAccountDetection(tabId, activeAccountKeys.get(tabId) ?? null, accountKey, enriched, nextCount)
  chrome.runtime.sendMessage({ type: 'CONTENT_ACCOUNT_DETECTED', payload: { ...enriched, accountKey }, timestamp: Date.now() }).catch(() => {})
  if (nextCount < 2) return

  const previousAccountKey = activeAccountKeys.get(tabId) ?? null
  if (previousAccountKey === accountKey) {
    await refreshActiveAccountSession({ ...enriched, accountKey })
    return
  }

  activeAccountKeys.set(tabId, accountKey)
  lastAccountChange = {
    previousAccountKey,
    nextAccountKey: accountKey,
    platform: enriched.platform,
    reason: getAccountChangeReason(previousAccountKey, accountKey, enriched),
    detectedAccount: { ...enriched, accountKey },
  }
  chrome.runtime.sendMessage({ type: 'CONTENT_ACCOUNT_CHANGED', payload: lastAccountChange, timestamp: Date.now() }).catch(() => {})

  await persistActiveSession()
  chrome.runtime.sendMessage({ type: 'SESSION_REHYDRATE_REQUESTED', payload: lastAccountChange, timestamp: Date.now() }).catch(() => {})
  await rehydrateAccountSession({ ...enriched, accountKey })
}

async function syncLiveSessionFromBalance(balance: number, platformName: string): Promise<void> {
  const existing = await getLiveSession().catch(() => null)
  const settings = await getSettings().catch(() => null)
  const account  = await getActiveAccount().catch(() => null)
  const calculated = calculateSessionValues(balance, settings)

  if (existing) {
    if (existing.startedAt) {
      const locked = calculateSessionValues(existing.accountBalance, settings)
      await patchLiveSession({
        detectedBalance: balance,
        dailyBudget: locked.dailyBudget,
        riskPerTrade: locked.riskPerTrade,
        maxTrades: locked.maxTrades,
        enforcementMode: locked.enforcementMode,
      }).catch(() => {})
      return
    }

    await patchLiveSession({
      accountBalance: balance,
      detectedBalance: balance,
      lockedBalance: balance,
      dailyBudget: calculated.dailyBudget,
      riskPerTrade: calculated.riskPerTrade,
      maxTrades: calculated.maxTrades,
      enforcementMode: calculated.enforcementMode,
      sessionSource: 'auto_detected',
    }).catch(() => {})
    return
  }

  await setLiveSession({
    accountId: account?.id ?? 'auto',
    detectedBalance: balance,
    lockedBalance: balance,
    startedAt: Date.now(),
    accountBalance: balance,
    dailyBudget: calculated.dailyBudget,
    riskPerTrade: calculated.riskPerTrade,
    tradesOpenedToday: 0,
    dailyPnl: 0,
    peakDailyPnl: 0,
    noTradeMode: false,
    lockState: null,
    maxTrades: calculated.maxTrades,
    disciplineScore: 100,
    enforcementMode: calculated.enforcementMode,
    sessionSource: `auto_detected:${platformName}`,
  }).catch(() => {})
}

async function rehydrateAccountSession(account: DetectedAccount & { accountKey: string }): Promise<void> {
  const settings = await getSettings().catch(() => null)
  const existing = await getAccountScopedSession(account.platform, account.accountKey)
  const balance = account.balance ?? account.equity ?? existing?.accountBalance ?? 0

  if (existing) {
    const lockedBalance = existing.lockedBalance ?? existing.accountBalance
    const calculated = calculateSessionValues(lockedBalance, settings)
    const restoredSession: LiveSessionState = {
      ...existing,
      platform: account.platform,
      accountKey: account.accountKey,
      accountId: account.accountId ?? account.accountKey,
      accountName: account.accountName,
      accountType: account.accountType,
      currency: account.currency,
      detectedBalance: account.balance ?? existing.detectedBalance ?? null,
      detectedEquity: account.equity ?? existing.detectedEquity ?? null,
      lockedBalance,
      accountBalance: lockedBalance,
      dailyBudget: calculated.dailyBudget,
      riskPerTrade: calculated.riskPerTrade,
      maxTrades: calculated.maxTrades,
      enforcementMode: calculated.enforcementMode,
      lastSyncedAt: Date.now(),
    }
    await setLiveSession(restoredSession)
    await setAccountScopedSession(account.platform, account.accountKey, restoredSession)
    debugSessionRehydrated(account.platform, account.accountKey, 'restored_existing_session', restoredSession, settings)
    await broadcastSessionEvent('SESSION_REHYDRATED')
    return
  }

  if (!balance || balance <= 0) return
  const calculated = calculateSessionValues(balance, settings)
  const session: LiveSessionState = {
    accountId: account.accountId ?? account.accountKey,
    accountKey: account.accountKey,
    platform: account.platform,
    accountName: account.accountName,
    accountType: account.accountType,
    currency: account.currency,
    detectedBalance: balance,
    detectedEquity: account.equity,
    lockedBalance: balance,
    lockedEquity: account.equity,
    lastSyncedAt: Date.now(),
    startedAt: Date.now(),
    accountBalance: balance,
    dailyBudget: calculated.dailyBudget,
    riskPerTrade: calculated.riskPerTrade,
    tradesOpenedToday: 0,
    dailyPnl: 0,
    peakDailyPnl: 0,
    noTradeMode: false,
    lockState: null,
    maxTrades: calculated.maxTrades,
    disciplineScore: 100,
    enforcementMode: calculated.enforcementMode,
    sessionSource: `auto_detected:${account.platform}`,
  }
  await setLiveSession(session)
  await setAccountScopedSession(account.platform, account.accountKey, session)
  debugSessionRehydrated(account.platform, account.accountKey, 'created_from_detected_balance', session, settings)
  await broadcastSessionEvent('SESSION_REHYDRATED')
}

async function refreshActiveAccountSession(account: DetectedAccount & { accountKey: string }): Promise<void> {
  const session = await getLiveSession().catch(() => null)
  if (!session || session.accountKey !== account.accountKey) return
  await patchLiveSession({
    accountName: account.accountName,
    accountType: account.accountType,
    currency: account.currency,
    detectedBalance: account.balance ?? session.detectedBalance ?? null,
    detectedEquity: account.equity ?? session.detectedEquity ?? null,
    lockedEquity: account.equity ?? session.lockedEquity,
    lastSyncedAt: Date.now(),
  })
}

async function persistActiveSession(): Promise<void> {
  const session = await getLiveSession().catch(() => null)
  if (!session?.accountKey || !session.platform) return
  await setAccountScopedSession(session.platform as PlatformName, session.accountKey, session)
}

async function getAccountScopedSession(platform: PlatformName, accountKey: string): Promise<LiveSessionState | null> {
  const key = accountSessionStorageKey(platform, accountKey)
  const result = await chrome.storage.session.get(key)
  return (result[key] as LiveSessionState | undefined) ?? null
}

async function setAccountScopedSession(platform: PlatformName | string, accountKey: string, session: LiveSessionState): Promise<void> {
  await chrome.storage.session.set({ [accountSessionStorageKey(platform, accountKey)]: session })
}

function accountSessionStorageKey(platform: PlatformName | string, accountKey: string): string {
  return `tc.session.${platform}:${accountKey}:${tradingDayKey()}`
}

function tradingDayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDetectedAccountKey(account: DetectedAccount): string | null {
  if (account.accountId?.trim()) return sanitizeAccountKey(account.accountId)
  const stableParts = [
    account.platform,
    account.accountName,
    account.accountType,
    account.currency,
    account.rawSource,
  ].filter(Boolean).join('|')
  if (stableParts.replace(account.platform, '').trim()) return hashAccountKey(stableParts)
  const fallback = account.balance ?? account.equity
  return fallback && fallback > 0 ? hashAccountKey(`${account.platform}|balance:${fallback}`) : null
}

function sanitizeAccountKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
}

function hashAccountKey(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fp_${(hash >>> 0).toString(36)}`
}

function getAccountChangeReason(
  previousAccountKey: string | null,
  nextAccountKey: string,
  account: DetectedAccount,
): AccountChangeEvent['reason'] {
  if (!previousAccountKey) return 'platform_account_widget_changed'
  if (account.accountId && sanitizeAccountKey(account.accountId) === nextAccountKey) return 'account_id_changed'
  if (account.currency) return 'currency_changed'
  if (/server|broker/i.test(account.rawSource)) return 'server_changed'
  return 'account_label_changed'
}

function debugAccountDetection(
  tabId: number,
  previousAccountKey: string | null,
  nextAccountKey: string,
  account: DetectedAccount,
  stableScanCount: number,
): void {
  if (!import.meta.env.DEV) return
  console.debug('[TC] ACCOUNT_DETECTED', {
    tabId,
    previousAccountKey,
    nextAccountKey,
    changedFields: previousAccountKey && previousAccountKey !== nextAccountKey ? ['accountKey'] : [],
    confidence: stableScanCount >= 2 ? 0.95 : 0.5,
    account,
  })
}

function debugSessionRehydrated(
  platform: PlatformName,
  accountKey: string,
  source: 'restored_existing_session' | 'created_from_detected_balance',
  session: LiveSessionState,
  settings: SessionSettings | null,
): void {
  if (!import.meta.env.DEV) return
  const lockedBalance = session.lockedBalance ?? session.accountBalance
  const calculated = calculateSessionValues(lockedBalance, settings)
  console.debug('[TC] SESSION_REHYDRATED', {
    sessionKey: accountSessionStorageKey(platform, accountKey),
    source,
    lockedBalance,
  })
  debugSessionCalculation(lockedBalance, settings, calculated, session.dailyPnl)
}

function debugSessionCalculation(
  lockedSessionBalance: number,
  settings: SessionSettings | null,
  calculated: ReturnType<typeof calculateSessionValues>,
  realizedLossToday: number,
): void {
  if (!import.meta.env.DEV) return
  console.debug('[TC] SESSION_RECALCULATED', {
    lockedSessionBalance,
    riskPercent: settings?.riskPercent ?? 1,
    dailyLossPercent: settings?.dailyLossLimitPercent ?? 2,
    riskPerTrade: calculated.riskPerTrade,
    dailyBudget: calculated.dailyBudget,
    budgetLeft: Math.max(0, calculated.dailyBudget + Math.min(0, realizedLossToday)),
  })
}

async function broadcastSessionEvent(type: 'SESSION_REHYDRATED' | 'SESSION_RECALCULATED' | 'SESSION_STATE_UPDATED'): Promise<void> {
  const state = await buildAppState().catch(() => null)
  if (!state) return
  chrome.runtime.sendMessage({ type, payload: state, timestamp: Date.now() }).catch(() => {})
  chrome.runtime.sendMessage({ type: 'SESSION_STATE_UPDATED', payload: state, timestamp: Date.now() }).catch(() => {})
}

async function shouldAcceptBalanceCandidate(tabId: number, value: number, sourceKey: string): Promise<boolean> {
  const existing = await getLiveSession().catch(() => null)
  if (existing?.startedAt && existing.accountBalance > 0) return false

  const rounded = Math.round(value * 100) / 100
  const current = balanceCandidates.get(tabId)
  const sameValue = current && Math.abs(current.value - rounded) < 0.01
  const sameSource = current?.sourceKey === sourceKey
  const next: BalanceCandidateState = {
    value: rounded,
    sourceKey,
    count: sameValue || sameSource ? current.count + 1 : 1,
  }

  balanceCandidates.set(tabId, next)
  return next.count >= 2
}

function calculateSessionValues(balance: number, settings: SessionSettings | null): {
  riskPerTrade: number
  dailyBudget: number
  maxTrades: number
  enforcementMode: 'training' | 'strict' | 'prop_firm'
} {
  const riskPercent = settings?.riskPercent ?? 1
  const dailyLossPercent = settings?.dailyLossLimitPercent ?? 2
  return {
    riskPerTrade: Math.round(balance * (riskPercent / 100) * 100) / 100,
    dailyBudget: Math.round(balance * (dailyLossPercent / 100) * 100) / 100,
    maxTrades: settings?.maxTrades ?? 3,
    enforcementMode: settings?.enforcementMode ?? 'training',
  }
}

async function recalculateLiveSessionFromSettings(): Promise<void> {
  const session = await getLiveSession().catch(() => null)
  const lockedBalance = session?.lockedBalance ?? session?.accountBalance ?? 0
  if (!lockedBalance || lockedBalance <= 0) return
  const settings = await getSettings().catch(() => null)
  const calculated = calculateSessionValues(lockedBalance, settings)
  await patchLiveSession({
    accountBalance: lockedBalance,
    lockedBalance,
    dailyBudget: calculated.dailyBudget,
    riskPerTrade: calculated.riskPerTrade,
    maxTrades: calculated.maxTrades,
    enforcementMode: calculated.enforcementMode,
  })
  debugSessionCalculation(lockedBalance, settings, calculated, session?.dailyPnl ?? 0)
  await broadcastSessionEvent('SESSION_RECALCULATED')
}

function resolveLifecycle(
  tab: CurrentTabStatusResponse,
  session: SessionStateResponse,
): PlatformLifecycleState {
  if (tab.status === 'platform_disabled') return 'unsupported'
  if (tab.status === 'not_eligible') return 'unsupported'
  if (tab.status === 'candidate') return 'detecting_platform'
  if (!tab.snapshot) return 'platform_ready'
  if (!tab.snapshot.detectedAccount && !session.accountKey) return 'detecting_account'
  if (lastAccountChange && lastAccountChange.nextAccountKey !== session.accountKey) return 'account_switching'
  if (tab.snapshot.detectedAccount && !session.startedAt) return 'account_detected'
  if (!session.accountBalance || session.accountBalance <= 0) return 'session_rehydrating'
  if (session.startedAt) return 'session_active'
  return 'detecting_account'
}

function lifecycleReason(
  lifecycle: PlatformLifecycleState,
  tab: CurrentTabStatusResponse,
  session: SessionStateResponse,
): string {
  switch (lifecycle) {
    case 'unsupported':
      return tab.status === 'platform_disabled'
        ? 'This platform is disabled in settings.'
        : 'Open MT5 Web or Match-Trader to start a trading session.'
    case 'detecting_platform':
    case 'detecting':
      return 'Checking trading platform...'
    case 'detecting_account':
      return 'Platform detected. Detecting active account...'
    case 'account_detected':
      return 'Account detected. Preparing session...'
    case 'account_switching':
      return 'Account change detected. Re-syncing session...'
    case 'session_rehydrating':
      return 'Loading session for this account...'
    case 'supported_not_ready':
      return 'Supported platform detected. Waiting for account/session data...'
    case 'platform_ready':
      return 'Platform detected. Waiting for account data...'
    case 'session_detected':
      return 'Account data detected. Session is syncing...'
    case 'session_active':
      return session.locked ? 'Session synced. Protection lock is active.' : 'Session synced. Risk rules applied.'
    case 'session_stale':
      return 'Session needs re-syncing.'
    case 'error':
      return 'Detection error. Re-sync session.'
  }
}

function buildProtectionStatus(
  session: SessionStateResponse,
  settings: SessionSettings | null,
  snapshot?: PlatformSnapshot | null,
): AppStateResponse['protection'] {
  const hasBalance = session.accountBalance > 0
  const hasPlaybook = true
  const platformLabel = snapshot?.platformName ?? 'MT5 Web + Match-Trader only'
  return [
    {
      id: 'pre_trade_gate',
      label: 'Pre-Trade Gate',
      status: hasPlaybook ? 'On' : 'Needs playbook',
      reason: hasPlaybook ? 'Checklist rules are available before entry.' : 'Create a playbook to enable setup checks.',
      action: hasPlaybook ? undefined : 'Open Settings',
    },
    {
      id: 'risk_guard',
      label: 'Risk Guard',
      status: hasBalance ? 'Active' : 'Missing balance',
      reason: hasBalance
        ? `${(settings?.riskPercent ?? 1)}% risk rule applied to detected balance.`
        : 'Waiting for a detected account balance.',
    },
    {
      id: 'no_trade_mode',
      label: 'No Trade Mode',
      status: session.noTradeMode ? 'Active' : 'Inactive',
      reason: session.noTradeMode ? 'New entries are paused intentionally.' : 'New entries are allowed by this rule.',
    },
    {
      id: 'green_day',
      label: 'Green Day Protection',
      status: settings?.autoNoTradeModeOnTarget ? 'On' : 'Off',
      reason: settings?.autoNoTradeModeOnTarget ? 'Target protection can pause entries after a green day.' : 'Enable a profit target rule in settings.',
    },
    {
      id: 'mistake_tags',
      label: 'Mistake Tags',
      status: 'Enabled',
      reason: 'Trade review can record setup quality and rule breaks.',
    },
    {
      id: 'platform_lock',
      label: 'Platform Lock',
      status: snapshot ? platformLabel : 'MT5 + Match-Trader only',
      reason: snapshot ? 'Unsupported pages stay disconnected.' : 'Only enabled trading platforms can sync sessions.',
    },
  ]
}

async function broadcastAppStateChanged(): Promise<void> {
  const state = await buildAppState().catch(() => null)
  if (!state) return
  chrome.runtime.sendMessage({
    type: 'TC_APP_STATE_CHANGED',
    payload: state,
    timestamp: Date.now(),
  }).catch(() => {})
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

function getSessionAccountId(session: LiveSessionState | null, fallback?: string): string {
  return session?.accountKey ?? session?.accountId ?? fallback ?? 'default'
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url && !tab.url.startsWith('chrome-extension://')) return tab

  // Fallback: find a known trading platform tab in the current window
  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs.find(candidate => !!candidate.id && !!candidate.url && isPermittedTradingPlatform(candidate.url)) ?? tab ?? null
}

async function getPinnedOrActiveTab(): Promise<chrome.tabs.Tab | null> {
  const result = await chrome.storage.session.get('tc_last_pinned_tab_id')
  const tabId = result.tc_last_pinned_tab_id as number | undefined
  if (tabId) {
    try {
      return await chrome.tabs.get(tabId)
    } catch {
      await chrome.storage.session.remove('tc_last_pinned_tab_id')
    }
  }
  return getActiveTab()
}

/** Resolves the authoritative connected tab. Never falls back to the active tab. */
async function resolveConnectedTab(requestedTabId?: number): Promise<chrome.tabs.Tab | null> {
  const connected = await getConnectedTabState()

  if (!connected?.tabId) return null

  if (requestedTabId && requestedTabId !== connected.tabId) {
    // Do not allow sidepanel/active tab drift to override the connected tab.
    console.warn('[TC] Ignoring requested tab id because it is not the connected tab.', {
      requestedTabId,
      connectedTabId: connected.tabId,
    })
  }

  return chrome.tabs.get(connected.tabId).catch(async () => {
    await clearConnectedTabState()
    return null
  })
}

async function getTabSnapshot(tabId: number): Promise<PlatformSnapshot | null> {
  try {
    const response = await sendToTab(tabId, { type: 'TC_GET_PLATFORM_SNAPSHOT' })
    return response as PlatformSnapshot
  } catch {
    return null
  }
}


interface SidePanelApi {
  setOptions(options: { tabId: number; path: string; enabled: boolean }): Promise<void>
  open(options: { tabId: number }): Promise<void>
}

function getSidePanelApi(): SidePanelApi | null {
  return ((chrome as unknown as { sidePanel?: SidePanelApi }).sidePanel) ?? null
}

async function ensureContentScriptInjected(tabId: number, force = false): Promise<void> {
  if (!force) {
    try {
      await sendToTab(tabId, { type: 'TC_GET_PLATFORM_SNAPSHOT' })
      return
    } catch {
      // Continue to injection attempt.
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/index.js'],
  })
}

async function getPinState(tabId: number): Promise<TabPinState | null> {
  const result = await chrome.storage.session.get(pinKey(tabId))
  return (result[pinKey(tabId)] as TabPinState | undefined) ?? null
}

async function setPinState(state: TabPinState): Promise<void> {
  await chrome.storage.session.set({ [pinKey(state.tabId)]: state })
}

function pinKey(tabId: number): string {
  return `tc_pin_${tabId}`
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

const PERMITTED_TRADING_PLATFORMS = [
  {
    id: 'mt5',
    name: 'MT5 Web',
    matchers: [/metatrader/i, /mql5\.com/i, /mt5/i, /webterminal/i],
    enabled: true,
  },
  {
    id: 'match_trader',
    name: 'Match-Trader',
    matchers: [/match-trader/i, /matchtrader/i, /matchtraderweb/i, /maven\.markets/i],
    enabled: true,
  },
] as const

function getPermittedPlatformForUrl(url: string): { id: string; name: string } | null {
  try {
    const { hostname } = new URL(url)
    return PERMITTED_TRADING_PLATFORMS.find(p => p.matchers.some(m => m.test(hostname))) ?? null
  } catch {
    return null
  }
}

function isPermittedTradingPlatform(url: string): boolean {
  return getPermittedPlatformForUrl(url) !== null
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
chrome.tabs.onRemoved.addListener(tabId => {
  balanceCandidates.delete(tabId)
  chrome.storage.session.remove(pinKey(tabId)).catch(() => {})
})

chrome.tabs.onActivated.addListener(() => {
  broadcastAppStateChanged().catch(() => {})
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url) {
    if (tab.url && isPermittedTradingPlatform(tab.url)) {
      ensureContentScriptInjected(tabId, changeInfo.status === 'complete').catch(() => {})
    }
    broadcastAppStateChanged().catch(() => {})
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session' && changes.liveSession?.newValue === undefined) {
    balanceCandidates.clear()
    accountCandidates.clear()
    activeAccountKeys.clear()
    lastAccountChange = null
  }
  if (areaName === 'session' && changes.liveSession?.newValue) {
    const session = changes.liveSession.newValue as LiveSessionState
    if (session.accountKey && session.platform) {
      setAccountScopedSession(session.platform, session.accountKey, session).catch(() => {})
    }
  }
  if (areaName === 'local' && changes.settings) {
    recalculateLiveSessionFromSettings().catch(() => {})
  }
  if (
    areaName === 'session' && (changes.liveSession || changes[CONNECTED_TAB_STORAGE_KEY]) ||
    areaName === 'local' && (changes.settings || changes.tc_platform_enabled)
  ) {
    broadcastAppStateChanged().catch(() => {})
  }
})

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
