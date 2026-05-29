export function isExtensionContextValid(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

export function extensionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isContextInvalidatedError(error: unknown): boolean {
  return extensionErrorMessage(error).includes('Extension context invalidated')
}

export async function safeSendMessage<TResponse = unknown>(message: unknown): Promise<TResponse | null> {
  if (!isExtensionContextValid()) {
    console.warn('[TC] Extension context invalidated. Message skipped:', message)
    return null
  }

  try {
    return await chrome.runtime.sendMessage(message)
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      console.warn('[TC] Extension context invalidated. Ignoring stale script call.')
      return null
    }
    throw error
  }
}

export async function safeSendTabMessage<TResponse = unknown>(tabId: number, message: unknown): Promise<TResponse | null> {
  if (!isExtensionContextValid()) return null

  try {
    return await chrome.tabs.sendMessage(tabId, message)
  } catch (error) {
    if (isContextInvalidatedError(error)) return null
    throw error
  }
}
