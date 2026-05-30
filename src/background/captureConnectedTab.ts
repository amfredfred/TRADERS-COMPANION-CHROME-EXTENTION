import { clearConnectedTabState, getConnectedTabState, patchConnectedTabState } from './connectedTabStore'
import type { CaptureConnectedTabResponse } from '../shared/lib/messages'

export async function captureConnectedTab(): Promise<CaptureConnectedTabResponse> {
  const connected = await getConnectedTabState()

  if (!connected?.tabId || !connected.windowId) {
    return {
      ok: false,
      code: 'NO_CONNECTED_TAB',
      error: 'No chart tab is connected. Attach TC to a chart tab first.',
    }
  }

  const tab = await chrome.tabs.get(connected.tabId).catch(() => null)

  if (!tab?.id) {
    await clearConnectedTabState()
    return {
      ok: false,
      code: 'TAB_NOT_FOUND',
      error: 'Connected tab is no longer available. Reconnect TC to a chart tab.',
    }
  }

  await patchConnectedTabState({
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
  })

  const debuggerResult = await tryCaptureViaDebugger(tab.id)

  if (debuggerResult.ok) {
    return {
      ok: true,
      tabId: tab.id,
      windowId: tab.windowId,
      dataUrl: debuggerResult.dataUrl,
      capturedAt: Date.now(),
      method: 'debugger',
      url: tab.url,
      title: tab.title,
      domain: safeDomain(tab.url ?? ''),
    }
  }

  console.info('[TC] Debugger capture failed, trying activate_restore fallback:', debuggerResult.error)

  const fallbackResult = await captureByActivateRestore(tab.id, tab.windowId)

  if (fallbackResult.ok) {
    console.info('[TC] Captured connected tab via activate_restore fallback')
    return {
      ok: true,
      tabId: tab.id,
      windowId: tab.windowId,
      dataUrl: fallbackResult.dataUrl,
      capturedAt: Date.now(),
      method: 'activate_restore',
      url: tab.url,
      title: tab.title,
      domain: safeDomain(tab.url ?? ''),
    }
  }

  return {
    ok: false,
    code: 'CAPTURE_FAILED',
    error: 'Failed to capture the connected chart tab. Reconnect TC to the chart and try again.',
  }
}

// ── Debugger / CDP path (preferred for inactive tabs) ─────────────────────────

async function tryCaptureViaDebugger(tabId: number): Promise<
  | { ok: true; dataUrl: string }
  | { ok: false; error: string }
> {
  const target = { tabId }
  let attached = false

  try {
    await chrome.debugger.attach(target, '1.3')
    attached = true

    await chrome.debugger.sendCommand(target, 'Page.enable')

    const result = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    }) as { data?: string }

    if (!result?.data) {
      return { ok: false, error: 'Debugger capture returned no image data.' }
    }

    return { ok: true, dataUrl: `data:image/png;base64,${result.data}` }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Debugger capture failed.',
    }
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(target) } catch { /* ignore */ }
    }
  }
}

// ── Activate / capture / restore fallback ────────────────────────────────────

async function captureByActivateRestore(
  tabId: number,
  windowId: number,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  let previousActiveTabId: number | undefined
  let previousWindowId: number | undefined

  try {
    const [previousActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true })
    previousActiveTabId = previousActiveTab?.id
    previousWindowId = previousActiveTab?.windowId

    await chrome.windows.update(windowId, { focused: true })
    await chrome.tabs.update(tabId, { active: true })
    await wait(180)

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })

    await restorePreviousTab(previousWindowId, previousActiveTabId)

    return { ok: true, dataUrl }
  } catch (error) {
    await restorePreviousTab(previousWindowId, previousActiveTabId)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Activate/restore capture failed.',
    }
  }
}

async function restorePreviousTab(windowId?: number, tabId?: number) {
  if (!windowId || !tabId) return
  try {
    await chrome.windows.update(windowId, { focused: true })
    await chrome.tabs.update(tabId, { active: true })
  } catch { /* ignore */ }
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
