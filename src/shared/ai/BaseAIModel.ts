import type { AiProvider, SessionSettings } from '../types/playbook'
import type { AIChatMessage, AIContentBlock, AIContextPayload, AIProviderClient, AIStreamChunk, CaptureChartFn } from './types'

// ── Context level ─────────────────────────────────────────────────────────────

type ContextLevel = 'none' | 'session' | 'full'

function getContextLevel(intent: string | undefined, includeChartContext?: boolean): ContextLevel {
  if (intent === 'greeting' || intent === 'casual') return 'none'
  if (includeChartContext || intent === 'force_chart_recapture' || intent === 'chart_review') return 'full'
  return 'session'
}

// ── Base class ─────────────────────────────────────────────────────────────────

export abstract class BaseAIModel implements AIProviderClient {
  abstract provider: AiProvider

  protected constructor(protected readonly settings: SessionSettings) {}

  abstract streamChat(
    payload: AIContextPayload,
    onChunk: (chunk: AIStreamChunk) => void,
    captureChart: CaptureChartFn,
    signal?: AbortSignal,
  ): Promise<void>

  // ── System prompt ────────────────────────────────────────────────────────────

  protected buildSystemPrompt(payload: AIContextPayload): string {
    const intent = payload.intent ?? 'unknown'
    const level = getContextLevel(intent, payload.includeChartContext)

    // Greetings and casual messages get a minimal prompt — no chart/review instructions.
    if (level === 'none') {
      return [
        `You are Trader's Companion, a professional trading accountability assistant.`,
        `Respond naturally to the user's greeting or short message.`,
        `Keep your reply to 1–2 lines. Ask what they want to check: chart, playbook, discipline, or session.`,
        `Do not mention chart context, screenshots, playbook rules, risk calculations, or confidence.`,
        `Do not perform any analysis.`,
      ].join('\n')
    }

    const activePlaybook = payload.playbooks?.find(p => p.active) ?? payload.playbooks?.[0]

    // Full or session-level prompt — high-tone, discipline-first.
    const lines = [
      `You are Trader's Companion, a concise trading discipline assistant.`,
      `Your job is to help the trader slow down, follow their playbook, and avoid forced trades.`,
      ``,
      `You are not a signal engine.`,
      `You do not tell the user to buy or sell.`,
      `You do not over-explain.`,
      `You respond naturally to greetings and casual messages — keep them short.`,
      `You keep every answer short unless the user explicitly asks for a detailed review.`,
      ``,
      `Tone: professional, firm, calm, direct, discipline-first.`,
      ``,
      `Default response length: 1 to 5 short lines.`,
      ``,
      `For discipline checks:`,
      `- Be firm. Ask if the user can name the setup, key zone, invalidation, and risk before entry.`,
      `- If the answer is no, tell them to pause or skip.`,
      `- Do not produce a full chart analysis unless chart context was requested.`,
      ``,
      `For general trading questions:`,
      `- Answer briefly and directly.`,
      `- No padding, no over-explanation.`,
    ]

    if (level === 'full') {
      lines.push(
        ``,
        `For chart or playbook reviews, use compact markdown sections:`,
        `**Captured:** Fresh chart snapshot taken at [time].`,
        `**Visible context:** ...`,
        `**Playbook match:** ...`,
        `**Risk/session:** ...`,
        `**Missing confirmation:** ...`,
        `**Decision:** ...`,
        `**Reminder:** Review only, not a signal.`,
        ``,
        `Keep each section to one short sentence. No long paragraphs.`,
        `If chart data is incomplete, say what is missing — do not invent details.`,
        `If no chart was captured, do not pretend you saw one.`,
        ``,
        `You have access to a capture_chart tool that captures the connected trading chart tab.`,
        `Only call capture_chart when chart visual analysis is required and the provider supports vision.`,
        `Never invent account balance, symbol, timeframe, or risk values.`,
      )

      // Fresh capture instruction: when a captureId is provided, the model must
      // treat this as new context and not reason from prior chart descriptions.
      if (payload.captureId) {
        const capturedTime = payload.capturedAt
          ? new Date(payload.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : 'just now'
        lines.push(
          ``,
          `IMPORTANT: This is a FRESH chart capture (ID: ${payload.captureId}, taken at ${capturedTime}).`,
          `You are reviewing this new capture ONLY.`,
          `Do not reference or repeat observations from previous chart captures in this conversation.`,
          `Do not say "same chart" or "still" unless the new capture clearly confirms it.`,
          `Base your read entirely on the image provided with this message.`,
        )
      }
    }

    if (activePlaybook) {
      lines.push(
        ``,
        `Active playbook: ${activePlaybook.name}.`,
        activePlaybook.stopRule ? `Stop rule: ${activePlaybook.stopRule}.` : '',
        activePlaybook.entryConfirmation ? `Entry confirmation: ${activePlaybook.entryConfirmation}.` : '',
      )
    } else {
      lines.push(``, `No active playbook configured.`)
    }

    lines.push(``, `Never provide trade signals. Never pretend confidence when context is missing.`)

    return lines.filter(l => l !== undefined).join('\n')
  }

  // ── Context messages ──────────────────────────────────────────────────────────

  protected buildSessionContext(payload: AIContextPayload): string {
    const session = payload.session
    const parts = [`Session context:`]

    if (session.accountBalance) parts.push(`- Account balance: ${session.accountBalance}`)
    if (session.dailyBudget) parts.push(`- Daily budget: ${session.dailyBudget}`)
    if (session.riskPerTrade) parts.push(`- Risk per trade: ${session.riskPerTrade}`)
    parts.push(`- Trades today: ${session.tradesOpenedToday}/${session.maxTrades}`)
    parts.push(`- No Trade Mode: ${session.noTradeMode ? 'on' : 'off'}`)
    if (session.locked) parts.push(`- Locked: yes`)

    return parts.join('\n')
  }

  protected buildChartContextMessage(payload: AIContextPayload): string {
    const snapshot = payload.snapshot
    const session = payload.session

    const lines = [
      `Connected platform context:`,
      `- Platform: ${snapshot?.platformName ?? 'unknown'}`,
      `- Symbol: ${snapshot?.symbol ?? 'not detected'}`,
      `- Timeframe: ${snapshot?.timeframe ?? 'not detected'}`,
      `- Detection status: ${snapshot?.status ?? 'unknown'}`,
      `- Detection confidence: ${snapshot?.confidence ?? 0}%`,
    ]

    if (payload.captureId) {
      const capturedTime = payload.capturedAt
        ? new Date(payload.capturedAt).toISOString()
        : 'unknown'
      lines.push(
        ``,
        `Chart capture context:`,
        `- Capture ID: ${payload.captureId}`,
        `- Captured at: ${capturedTime}`,
        `- Source: fresh_connected_chart_capture`,
      )
    }

    lines.push(
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
    )

    return lines.join('\n')
  }

  // ── Message builder ───────────────────────────────────────────────────────────

  protected buildMessages(payload: AIContextPayload): AIChatMessage[] {
    // contextLevel override lets callers skip automatic context injection.
    const level = payload.contextLevel ?? getContextLevel(payload.intent, payload.includeChartContext)
    // systemOverride lets callers supply a fully custom system prompt.
    const systemContent = payload.systemOverride ?? this.buildSystemPrompt(payload)

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

    const messages: AIChatMessage[] = [
      { role: 'system', content: systemContent },
    ]

    // Inject context block only where it adds value.
    if (level === 'full') {
      messages.push({ role: 'user', content: this.buildChartContextMessage(payload) })
    } else if (level === 'session') {
      messages.push({ role: 'user', content: this.buildSessionContext(payload) })
    }
    // level === 'none' → no context block (greetings, casual, trade review with self-contained prompt)

    return [
      ...messages,
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
