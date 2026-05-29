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
import { sendToTab, TC_AI_STREAM_PORT } from '../shared/lib/messages'
import { createAIModel } from '../shared/ai/createAIModel'
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
  AgentToolRequest,
} from '../shared/lib/messages'
import type { Playbook } from '../shared/types/playbook'
import type { PlatformSnapshot, TabPinState } from '../shared/types/platform'

// In-memory map of active trade machines (keyed by intentId)
const activeTrades = new Map<string, TradeMachine>()

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
  if (port.name !== TC_AI_STREAM_PORT) return

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

    case 'TC_GET_CURRENT_TAB_STATUS':
      return handleCurrentTabStatus()

    case 'TC_OPEN_SIDE_PANEL':
      return handleOpenSidePanel(msg.payload as { tabId?: number; forceFallback?: boolean } | undefined)

    case 'TC_OPEN_SIDECAR':
      return handleOpenSidePanel(msg.payload as { tabId?: number; forceFallback?: boolean } | undefined)

    case 'TC_OPEN_DOCKED_SIDECAR':
      return handleOpenSidePanel({ ...(msg.payload as object), forceFallback: true })

    case 'TC_RUN_DIAGNOSTICS':
      return handleDiagnostics()

    case 'TC_TEST_AI_PROVIDER':
      return handleTestAIProvider()

    case 'TC_REINJECT_CONTENT_SCRIPT':
      return handleReinjectContentScript(msg.payload as { tabId?: number } | undefined)

    case 'TC_HEALTH_CHECK':
      return { ok: true }

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

async function handleCurrentTabStatus(): Promise<CurrentTabStatusResponse> {
  const tab = await getActiveTab()
  if (!tab?.id) {
    return {
      tabId: null,
      domain: '',
      url: '',
      title: '',
      pinned: false,
      status: 'unsupported_page',
      confidence: 0,
    }
  }

  const url = tab.url ?? ''
  const domain = safeDomain(url)
  const pinState = await getPinState(tab.id)
  await ensureContentScriptInjected(tab.id).catch(() => {})
  const snapshot = await getTabSnapshot(tab.id).catch(() => null)

  return {
    tabId: tab.id,
    domain,
    url,
    title: tab.title ?? domain,
    pinned: !!pinState?.pinned,
    pinState: pinState ?? undefined,
    snapshot: snapshot ?? undefined,
    status: snapshot?.status ?? (isLikelyTradingUrl(url) ? 'manual_attach_available' : 'not_trading_tab'),
    confidence: snapshot?.confidence ?? (isLikelyTradingUrl(url) ? 25 : 0),
  }
}

async function handleGetPinState(sender: chrome.runtime.MessageSender): Promise<TabPinState | null> {
  const tabId = sender.tab?.id
  if (!tabId) return null
  return getPinState(tabId)
}

async function handlePinTab(notifyContent = true): Promise<{ ok: boolean; pinState?: TabPinState; error?: string }> {
  const tab = await getActiveTab()
  if (!tab?.id || !tab.url) return { ok: false, error: 'No active tab available.' }
  return pinSpecificTab(tab, notifyContent)
}

async function pinSpecificTab(tab: chrome.tabs.Tab, notifyContent = true): Promise<{ ok: boolean; pinState?: TabPinState; error?: string }> {
  if (!tab.id || !tab.url) return { ok: false, error: 'No tab available.' }
  await ensureContentScriptInjected(tab.id).catch(() => {})
  const snapshot = await getTabSnapshot(tab.id).catch(() => null)
  const pinState: TabPinState = {
    tabId: tab.id,
    origin: safeOrigin(tab.url),
    urlPattern: tab.url,
    pinned: true,
    mode: snapshot?.status === 'adapter_active' ? 'auto_platform' : 'manual_attach',
    panelCollapsed: false,
    adapterId: snapshot?.adapterId ?? 'generic',
    lastSnapshotAt: Date.now(),
  }

  await setPinState(pinState)
  await chrome.storage.session.set({ tc_last_pinned_tab_id: tab.id })
  if (notifyContent) {
    await sendToTab(tab.id, { type: 'TC_COMPANION_PINNED', payload: { collapsed: false } }).catch(() => {})
  }
  return { ok: true, pinState }
}

async function handleOpenSidePanel(payload?: { tabId?: number; forceFallback?: boolean }): Promise<{ ok: boolean; fallback?: boolean; error?: string }> {
  const targetTab = payload?.tabId ? await chrome.tabs.get(payload.tabId).catch(() => null) : await getActiveTab()
  if (!targetTab?.id || !targetTab.url) return { ok: false, error: 'No active tab found.' }

  const pinResult = await pinSpecificTab(targetTab, false)
  if (!pinResult.ok || !pinResult.pinState?.tabId) {
    return { ok: false, error: pinResult.error ?? 'Could not pin current tab.' }
  }

  const tabId = pinResult.pinState.tabId
  const sidePanel = getSidePanelApi()

  if (sidePanel && !payload?.forceFallback) {
    try {
      await sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/index.html',
        enabled: true,
      })
      await sidePanel.open({ tabId })
      return { ok: true }
    } catch (err) {
      console.error('[TC SW] sidePanel.open failed. Falling back to injected sidecar.', err)
    }
  } else if (!sidePanel && !payload?.forceFallback) {
    console.warn('[TC SW] Chrome Side Panel API is not available. Falling back to injected sidecar.')
  }

  return openDockedFallback(tabId)
}

async function handleUnpinTab(sender: chrome.runtime.MessageSender): Promise<{ ok: boolean }> {
  const tab = sender.tab ?? await getPinnedOrActiveTab()
  if (tab?.id) {
    await chrome.storage.session.remove(pinKey(tab.id))
    await chrome.storage.session.remove('tc_last_pinned_tab_id')
    await sendToTab(tab.id, { type: 'TC_COMPANION_UNPINNED' }).catch(() => {})
  }
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

async function handleAgentToolRequest(sender: chrome.runtime.MessageSender, payload: AgentToolRequest): Promise<unknown> {
  const tab = await resolveToolTab(sender, payload.tabId)

  if (payload.tool === 'captureVisibleChart') {
    if (!tab?.windowId) return { ok: false, error: 'No active window available.' }
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
      return { ok: true, dataUrl }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
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

  if (!tab?.id) return { ok: false, error: 'No trading tab available.' }

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

  const tab = await resolveToolTab({} as chrome.runtime.MessageSender, payload.tabId)
  if (!tab?.id) {
    port.postMessage({ type: 'error', error: 'No trading tab is attached. Open a supported trading page or use manual review mode.' })
    return
  }
  const account = await getActiveAccount()
  const playbookResult = await chrome.storage.local.get(`playbooks_${account?.id ?? 'default'}`)
  const playbooks = (playbookResult[`playbooks_${account?.id ?? 'default'}`] as Playbook[] | undefined) ?? []

  const [snapshot, visibleText, session, capture] = await Promise.all([
    getTabSnapshot(tab.id).catch(() => null),
    sendToTab(tab.id, { type: 'TC_AGENT_TOOL_REQUEST', payload: { tool: 'getVisiblePageText' } }).catch(() => ''),
    buildSessionStateResponse(),
    handleAgentToolRequest({} as chrome.runtime.MessageSender, { tabId: tab.id, tool: 'captureVisibleChart' } as AgentToolRequest).catch(() => null),
  ])

  if (signal.aborted) return

  const model = createAIModel(settings)
  await model.streamChat(
    {
      prompt: payload.prompt,
      messages: payload.messages,
      settings,
      session,
      playbooks,
      snapshot,
      visibleText: typeof visibleText === 'string' ? visibleText : '',
      screenshotDataUrl: (capture as { dataUrl?: string } | null)?.dataUrl,
    },
    chunk => {
      try {
        port.postMessage(chunk)
      } catch {
        // Port was disconnected while the provider stream was active.
      }
    },
    signal,
  )
}

async function handleReinjectContentScript(payload?: { tabId?: number }): Promise<{ ok: boolean; error?: string }> {
  const tab = await resolveToolTab({} as chrome.runtime.MessageSender, payload?.tabId)
  if (!tab?.id) return { ok: false, error: 'No active tab found.' }
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
  if (settings.aiProvider === 'off') return { ok: false, error: 'AI review is disabled. Select OpenAI or Claude first.' }

  try {
    if (settings.aiProvider === 'gpt4o') {
      const key = settings.openaiApiKey?.trim()
      if (!key) return { ok: false, error: 'OpenAI API key is missing. Add it in Settings -> AI Provider.' }
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) return { ok: false, error: `OpenAI connection failed: ${response.status}` }
      return { ok: true }
    }

    const key = settings.claudeApiKey?.trim()
    if (!key) return { ok: false, error: 'Claude API key is missing. Add it in Settings -> AI Provider.' }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
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
    disciplineScore: session?.disciplineScore ?? 0,
    accountBalance:  session?.accountBalance ?? 0,
    startedAt:       session?.startedAt,
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

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url && !tab.url.startsWith('chrome-extension://')) return tab

  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs.find(candidate => !!candidate.id && !!candidate.url && isLikelyTradingUrl(candidate.url)) ?? tab ?? null
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

async function resolveToolTab(sender: chrome.runtime.MessageSender, requestedTabId?: number): Promise<chrome.tabs.Tab | null> {
  if (requestedTabId) {
    try {
      return await chrome.tabs.get(requestedTabId)
    } catch {
      return null
    }
  }
  return sender.tab ?? getPinnedOrActiveTab()
}

async function getTabSnapshot(tabId: number): Promise<PlatformSnapshot | null> {
  try {
    const response = await sendToTab(tabId, { type: 'TC_GET_PLATFORM_SNAPSHOT' })
    return response as PlatformSnapshot
  } catch {
    return null
  }
}

async function openDockedFallback(tabId: number): Promise<{ ok: boolean; fallback: true; error?: string }> {
  try {
    await ensureContentScriptInjected(tabId, true).catch(() => {})
    const response = await sendToTab(tabId, { type: 'TC_OPEN_DOCKED_SIDECAR', payload: { collapsed: false, fallback: true } })
    const failed = response && typeof response === 'object' && 'ok' in response && (response as { ok?: boolean }).ok === false
    if (failed) {
      return { ok: false, fallback: true, error: (response as { error?: string }).error ?? 'Docked sidecar could not be opened.' }
    }
    return { ok: true, fallback: true }
  } catch (error) {
    console.error('[TC SW] Docked fallback failed:', error)
    return { ok: false, fallback: true, error: String(error) }
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

function isLikelyTradingUrl(url: string): boolean {
  return /trading|trade|terminal|metatrader|mql5|ctrader|chart|broker/i.test(url)
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
  chrome.storage.session.remove(pinKey(tabId)).catch(() => {})
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
