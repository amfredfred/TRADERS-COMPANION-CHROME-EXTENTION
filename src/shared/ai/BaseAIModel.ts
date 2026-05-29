import type { AiProvider, SessionSettings } from '../types/playbook'
import type { AIChatMessage, AIContextPayload, AIProviderClient, AIStreamChunk } from './types'

export abstract class BaseAIModel implements AIProviderClient {
  abstract provider: AiProvider

  protected constructor(protected readonly settings: SessionSettings) {}

  abstract streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>

  protected buildSystemPrompt(payload: AIContextPayload): string {
    const activePlaybook = payload.playbooks.find(p => p.active) ?? payload.playbooks[0]

    return [
      `You are Trader's Companion, a professional trading accountability assistant.`,
      `You do not place trades, modify trades, close trades, or provide guaranteed signals.`,
      `Your job is to review context, ask for missing confirmation, check risk discipline, and enforce the user's playbook.`,
      `Be direct, concise, and practical.`,
      `Always mention uncertainty when chart/screenshot/platform context is incomplete.`,
      `Never invent account balance, symbol, timeframe, trade state, or risk values.`,
      `Use the user's session settings and playbook as the source of truth.`,
      `Format trade reviews with: Visible context, Playbook match, Risk/session check, Missing confirmation, Confidence, then "This is a review, not a signal."`,
      activePlaybook
        ? `Active playbook: ${activePlaybook.name}. Stop rule: ${activePlaybook.stopRule}. Entry confirmation: ${activePlaybook.entryConfirmation}.`
        : `No active playbook configured.`,
    ].join('\n')
  }

  protected buildContextMessage(payload: AIContextPayload): string {
    const snapshot = payload.snapshot
    const session = payload.session

    return [
      `Current platform context:`,
      `- Platform: ${snapshot?.platformName ?? 'unknown'}`,
      `- Symbol: ${snapshot?.symbol ?? 'not detected'}`,
      `- Timeframe: ${snapshot?.timeframe ?? 'not detected'}`,
      `- Detection status: ${snapshot?.status ?? 'unknown'}`,
      `- Detection confidence: ${snapshot?.confidence ?? 0}%`,
      ``,
      `Session/risk context:`,
      `- Account balance: ${session.accountBalance || 'not available'}`,
      `- Daily budget: ${session.dailyBudget || 'not available'}`,
      `- Risk per trade: ${session.riskPerTrade || 'not available'}`,
      `- Trades today: ${session.tradesOpenedToday}/${session.maxTrades}`,
      `- No Trade Mode: ${session.noTradeMode ? 'on' : 'off'}`,
      `- Locked: ${session.locked ? 'yes' : 'no'}`,
      ``,
      `Screenshot: ${payload.screenshotDataUrl ? 'captured and available to the extension runtime' : 'unavailable'}`,
      ``,
      `Visible page text:`,
      payload.visibleText?.trim() ? payload.visibleText.slice(0, 5000) : `No readable visible text captured.`,
    ].join('\n')
  }

  protected buildMessages(payload: AIContextPayload): AIChatMessage[] {
    return [
      { role: 'system', content: this.buildSystemPrompt(payload) },
      { role: 'user', content: this.buildContextMessage(payload) },
      ...payload.messages,
      { role: 'user', content: payload.prompt },
    ]
  }

  protected requireApiKey(value: string | undefined, label: string): string {
    const key = value?.trim()
    if (!key) throw new Error(`${label} is missing. Add it in Settings -> AI Provider.`)
    return key
  }
}
