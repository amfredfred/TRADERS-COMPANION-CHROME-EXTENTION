import type { AiProvider, SessionSettings } from '../types/playbook'
import type { AIChatMessage, AIContentBlock, AIContextPayload, AIProviderClient, AIStreamChunk, CaptureChartFn } from './types'

export abstract class BaseAIModel implements AIProviderClient {
  abstract provider: AiProvider

  protected constructor(protected readonly settings: SessionSettings) {}

  abstract streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void>

  protected buildSystemPrompt(payload: AIContextPayload): string {
    const activePlaybook = payload.playbooks.find(p => p.active) ?? payload.playbooks[0]

    return [
      `You are Trader's Companion, a professional trading accountability assistant.`,
      `You do not place trades, modify trades, close trades, or provide guaranteed signals.`,
      `Your job is to review context, ask for missing confirmation, check risk discipline, and enforce the user's playbook.`,
      `Be direct, concise, and practical.`,
      `You have access to a capture_chart tool that captures the connected trading chart tab, not the browser's active tab.`,
      `Only call capture_chart when visual chart analysis is required and the selected provider/model supports image input.`,
      `When the user asks about the chart and image capture is available, call capture_chart instead of asking the user to describe it.`,
      `If screenshot/chart context is unavailable, say exactly what is missing. Do not pretend you saw the chart.`,
      `Always mention uncertainty when chart/screenshot/platform context is incomplete.`,
      `Never invent account balance, symbol, timeframe, trade state, or risk values.`,
      `Use the user's session settings and playbook as the source of truth.`,
      `Format responses using compact markdown only. Use bold labels for review sections. Do not use markdown tables unless explicitly requested. Do not use large markdown headings.`,
      `Keep responses short and readable inside a narrow extension chat panel.`,
      `For trade reviews, use: **Visible context:** ... **Playbook match:** ... **Risk/session check:** ... **Missing confirmation:** ... **Confidence:** ... **Reminder:** This is a review, not a signal.`,
      activePlaybook
        ? `Active playbook: ${activePlaybook.name}. Stop rule: ${activePlaybook.stopRule}. Entry confirmation: ${activePlaybook.entryConfirmation}.`
        : `No active playbook configured.`,
    ].join('\n')
  }

  protected buildContextMessage(payload: AIContextPayload): string {
    const snapshot = payload.snapshot
    const session = payload.session

    return [
      `Current connected platform context:`,
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
      `Visible page text:`,
      payload.visibleText?.trim() ? payload.visibleText.slice(0, 5000) : `No readable visible text captured.`,
    ].join('\n')
  }

  protected buildMessages(payload: AIContextPayload): AIChatMessage[] {
    const promptContent: AIChatMessage['content'] = payload.screenshotDataUrl
      ? [
          {
            type: 'image_base64',
            mediaType: 'image/png',
            data: payload.screenshotDataUrl.replace(/^data:image\/[a-z]+;base64,/, ''),
          } satisfies AIContentBlock,
          { type: 'text', text: payload.prompt } satisfies AIContentBlock,
        ]
      : payload.prompt

    return [
      { role: 'system', content: this.buildSystemPrompt(payload) },
      { role: 'user', content: this.buildContextMessage(payload) },
      ...payload.messages,
      { role: 'user', content: promptContent },
    ]
  }

  protected requireApiKey(value: string | undefined, label: string): string {
    const key = value?.trim()
    if (!key) throw new Error(`${label} is missing. Add it in Settings -> AI Provider.`)
    return key
  }
}
