import { sendToBackground } from '../shared/lib/messages'
import type { SessionStateResponse } from '../shared/lib/messages'

export function getVisiblePageText(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const chunks: string[] = []
  let node: Node | null

  while ((node = walker.nextNode()) && chunks.join(' ').length < 5000) {
    const text = node.textContent?.trim()
    if (!text || text.length < 2) continue
    const parent = node.parentElement
    if (!parent) continue
    const style = window.getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    chunks.push(text)
  }

  return chunks.join(' ').replace(/\s+/g, ' ').slice(0, 5000)
}

export async function captureVisibleChart(): Promise<{ dataUrl?: string; ok: boolean; error?: string }> {
  try {
    const result = await sendToBackground({ type: 'TC_AGENT_TOOL_REQUEST', payload: { tool: 'captureVisibleChart' } })
    return result as { dataUrl?: string; ok: boolean; error?: string }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function getSessionState(): Promise<SessionStateResponse | null> {
  return sendToBackground({ type: 'TC_GET_SESSION_STATE' }).catch(() => null) as Promise<SessionStateResponse | null>
}

export async function getUserRules(): Promise<unknown> {
  return sendToBackground({ type: 'TC_AGENT_TOOL_REQUEST', payload: { tool: 'getUserRules' } }).catch(() => null)
}
