import { sendToBackground } from '../shared/lib/messages'
import type { PlatformAdapter } from './adapters/types'
import { getPlatformSnapshot } from './adapters/registry'
import type { PlatformSnapshot } from '../shared/types/platform'
import type { SessionStateResponse } from '../shared/lib/messages'

export interface ToolActivity {
  label: string
  detail: string
  at: number
}

export interface AgentReview {
  response: string
  activities: ToolActivity[]
}

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

export async function captureAndReview(prompt: string, adapter: PlatformAdapter): Promise<AgentReview> {
  const activities: ToolActivity[] = []
  const snapshot = getPlatformSnapshot(adapter, 'manual_attach')
  activities.push(activity('Checked platform snapshot', `${snapshot.platformName}, ${snapshot.confidence}% confidence`))

  const text = getVisiblePageText()
  activities.push(activity('Read visible page text', `${text.length} characters available`))

  const session = await getSessionState()
  activities.push(activity('Checked session risk', session ? `${session.tradesOpenedToday}/${session.maxTrades} trades today` : 'No live session found'))

  const rules = await getUserRules()
  activities.push(activity('Loaded user rules', rules ? 'Settings available' : 'No saved rules found'))

  const capture = await captureVisibleChart()
  activities.push(activity('Captured screenshot', capture.ok ? 'Visible tab captured for review' : capture.error ?? 'Capture unavailable'))

  return {
    activities,
    response: buildReview(prompt, snapshot, text, session),
  }
}

function activity(label: string, detail: string): ToolActivity {
  return { label, detail, at: Date.now() }
}

function buildReview(prompt: string, snapshot: PlatformSnapshot, visibleText: string, session: SessionStateResponse | null): string {
  const structure = snapshot.symbol
    ? `The visible context appears to be focused on ${snapshot.symbol}${snapshot.timeframe ? ` on ${snapshot.timeframe}` : ''}.`
    : 'I cannot reliably identify the symbol from visible page text, so treat this as manual review context.'

  const platformLine = snapshot.status === 'adapter_active'
    ? 'Adapter support appears active, so TC may be able to use platform-specific checks.'
    : 'This is manual attach mode, so I can review visible context and rules, but I cannot promise order interception.'

  const riskLine = session
    ? `Session check: ${session.tradesOpenedToday}/${session.maxTrades} trades used, daily budget $${session.dailyBudget.toFixed(2)}, No Trade Mode ${session.noTradeMode ? 'on' : 'off'}.`
    : 'Session check: no live session state was available.'

  const textHint = visibleText.length > 80
    ? 'Visible page labels were available, but chart structure still depends mainly on the screenshot.'
    : 'There was very little readable text on the page; screenshot context matters most here.'

  return [
    `Visible context:\n- ${structure}\n- ${platformLine}\n- ${textHint}`,
    `Playbook match:\n- I would compare this against your selected playbook checklist: bias, sweep, displacement, retest, stop beyond invalidation.\n- If any of those are missing, this should not be treated as an A setup.`,
    `Risk/session check:\n- ${riskLine}`,
    `Missing confirmation:\n- Confirm the invalidation level, intended risk, and whether this is being taken soon after a loss.\n- Your question was: "${prompt || 'Review visible chart'}"`,
    `Confidence:\nMedium`,
    `This is a review, not a signal.`,
  ].join('\n\n')
}
