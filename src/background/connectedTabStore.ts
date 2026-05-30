export const CONNECTED_TAB_STORAGE_KEY = 'tc.connectedTab'

export type ConnectedTabState = {
  tabId: number
  windowId: number
  url?: string
  title?: string
  favIconUrl?: string
  origin?: string
  pinned: true
  mode: 'auto_platform' | 'manual_attach'
  adapterId?: string
  attachedAt: number
  lastSeenAt: number
}

const storageArea = chrome.storage.session ?? chrome.storage.local

export async function getConnectedTabState(): Promise<ConnectedTabState | null> {
  const result = await storageArea.get(CONNECTED_TAB_STORAGE_KEY)
  return (result[CONNECTED_TAB_STORAGE_KEY] as ConnectedTabState | undefined) ?? null
}

export async function setConnectedTabStateFromTab(
  tab: chrome.tabs.Tab,
  patch?: Partial<ConnectedTabState>,
): Promise<ConnectedTabState> {
  if (!tab.id || !tab.windowId) {
    throw new Error('Cannot attach TC to this tab.')
  }

  const existing = await getConnectedTabState()
  const now = Date.now()

  const state: ConnectedTabState = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    origin: safeOrigin(tab.url ?? ''),
    pinned: true,
    mode: patch?.mode ?? existing?.mode ?? 'manual_attach',
    adapterId: patch?.adapterId ?? existing?.adapterId,
    attachedAt: existing?.tabId === tab.id ? existing.attachedAt : now,
    lastSeenAt: now,
    ...patch,
  }

  await storageArea.set({ [CONNECTED_TAB_STORAGE_KEY]: state })
  await chrome.storage.session.set({ tc_last_pinned_tab_id: tab.id })

  return state
}

export async function patchConnectedTabState(patch: Partial<ConnectedTabState>): Promise<void> {
  const current = await getConnectedTabState()
  if (!current) return
  await storageArea.set({
    [CONNECTED_TAB_STORAGE_KEY]: {
      ...current,
      ...patch,
      lastSeenAt: Date.now(),
    },
  })
}

export async function clearConnectedTabState(): Promise<void> {
  const current = await getConnectedTabState()
  await storageArea.remove(CONNECTED_TAB_STORAGE_KEY)
  await chrome.storage.session.remove('tc_last_pinned_tab_id')
  if (current?.tabId) {
    await chrome.storage.session.remove(`tc_pin_${current.tabId}`).catch(() => {})
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
