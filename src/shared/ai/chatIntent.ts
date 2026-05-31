/**
 * Chat intent classifier.
 *
 * Classifies a user message into a typed intent so the app can route:
 *  - what chart/session context to include
 *  - whether to offer the capture_chart tool
 *  - how to shape the system prompt
 */

export type ChatIntent =
  | 'greeting'
  | 'casual'
  | 'general_trading_question'
  | 'discipline_check'
  | 'chart_review'
  | 'force_chart_recapture'
  | 'playbook_check'
  | 'risk_check'
  | 'session_check'
  | 'trade_log'
  | 'open_trade_management'
  | 'unknown'

// ── Pattern banks ─────────────────────────────────────────────────────────────

/**
 * Patterns that explicitly request a fresh chart capture, overriding any
 * existing chart context in the conversation. Takes priority over chart_review.
 */
const FORCE_CAPTURE_PATTERNS: RegExp[] = [
  /snap again/i,
  /capture again/i,
  /screen again/i,
  /screenshot again/i,
  /check again/i,
  /scan again/i,
  /recapture/i,
  /refresh.*chart/i,
  /take.*screenshot/i,
  /take.*another/i,
  /just capture/i,
  /capture.*screen/i,
  /again.*capture/i,
  /again.*snap/i,
  /review.*connected chart/i,
  /re-?check/i,
]

const GREETING_PATTERNS: RegExp[] = [
  /^hi[!.]?$/i,
  /^hello[!.]?$/i,
  /^hey[!.]?$/i,
  /^yo[!.]?$/i,
  /^gm[!.]?$/i,
  /^sup[!.]?$/i,
  /^good morning[!.]?$/i,
  /^good afternoon[!.]?$/i,
  /^good evening[!.]?$/i,
  /^what('?s| is) up[?!.]?$/i,
]

const CHART_REVIEW_PATTERNS: RegExp[] = [
  /review.*chart/i,
  /analy[sz]e.*chart/i,
  /what.*chart/i,
  /what.*happening/i,
  /what.*see/i,
  /how.*look/i,
  /show.*chart/i,
  /check.*setup/i,
  /is this.*valid/i,
  /review.*connected/i,
  /look at.*chart/i,
  /read.*chart/i,
  /chart.*review/i,
]

const DISCIPLINE_PATTERNS: RegExp[] = [
  /am i forcing/i,
  /forcing this/i,
  /should i take/i,
  /revenge.*trad/i,
  /overtrading/i,
  /discipline/i,
  /impulsive/i,
  /emotional.*trad/i,
  /fomo/i,
  /tilt/i,
  /stop.*myself/i,
  /keep.*taking.*trade/i,
]

const PLAYBOOK_PATTERNS: RegExp[] = [
  /playbook/i,
  /does this match/i,
  /my setup/i,
  /check.*rules/i,
  /my rules/i,
  /follow.*rules/i,
  /crt/i,
  /against.*my.*plan/i,
]

const RISK_PATTERNS: RegExp[] = [
  /risk.*per.*trade/i,
  /position.*size/i,
  /daily.*budget/i,
  /how much.*risk/i,
  /my risk/i,
  /risk.*check/i,
  /max.*loss/i,
]

const SESSION_PATTERNS: RegExp[] = [
  /session.*status/i,
  /today.*trades/i,
  /how many.*trade/i,
  /trades.*today/i,
  /no trade mode/i,
  /lock.*status/i,
  /how.*session/i,
]

const TRADE_LOG_PATTERNS: RegExp[] = [
  /log.*trade/i,
  /trade.*idea/i,
  /journal/i,
  /record.*trade/i,
  /save.*trade/i,
]

const OPEN_TRADE_MANAGEMENT_PATTERNS: RegExp[] = [
  /should i close/i,
  /close my trade/i,
  /close my current/i,
  /close.*open trade/i,
  /my open trade/i,
  /current open trade/i,
  /should i hold/i,
  /hold or close/i,
  /hold.*close/i,
  /can this.*hit tp/i,
  /is tp still/i,
  /tp still/i,
  /should i exit/i,
  /exit manually/i,
  /take partial/i,
  /move.*sl/i,
  /move.*stop/i,
  /tighten.*stop/i,
  /is this still valid/i,
  /am i cooked/i,
  /should i let it/i,
  /let it run/i,
  /let it breathe/i,
  /should i cut/i,
  /cut.*trade/i,
  /cut it/i,
  /should i reduce/i,
  /reduce.*position/i,
  /is price ranging/i,
  /still have momentum/i,
  /does this still/i,
  /can this still run/i,
  /can this still/i,
  /likely to reverse/i,
  /going to reverse/i,
  /take.*profit.*now/i,
]

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Intents that should include chart context (snapshot + visible text) and
 * allow the `capture_chart` tool to be offered to the AI model.
 */
export const CHART_CAPTURE_INTENTS = new Set<ChatIntent>([
  'chart_review',
  'force_chart_recapture',
  'playbook_check',
  'open_trade_management',
])

/**
 * Intents that include session context (trades today, risk, locks) but NOT
 * chart snapshot or visible text.
 */
export const SESSION_CONTEXT_INTENTS = new Set<ChatIntent>([
  'general_trading_question',
  'discipline_check',
  'risk_check',
  'session_check',
  'trade_log',
  'unknown',
])

/**
 * Classify the user's message into a `ChatIntent`.
 *
 * @param message   Raw user message string.
 * @param source    `'typed'` (keyboard input) or `'quick_prompt'` (chip click).
 */
export function getChatIntent(
  message: string,
  source?: 'typed' | 'quick_prompt',
): ChatIntent {
  const text = message.trim()

  // Greetings always win — never trigger chart analysis.
  if (GREETING_PATTERNS.some(p => p.test(text))) return 'greeting'

  // Short messages with no trading keywords = casual chat.
  if (
    text.length < 30 &&
    !/trade|chart|setup|entry|stop|risk|market|position|playbook|session|balance|tick|candle|zone|break|sweep|fvg|ob|ote|premium|discount|liquidity|reversal|momentum/i.test(
      text,
    )
  ) {
    return 'casual'
  }

  // Quick-prompt chart actions always force a fresh capture.
  if (source === 'quick_prompt' && /show chart|review chart|check.*chart/i.test(text)) {
    return 'force_chart_recapture'
  }

  // Force recapture takes priority over all other chart intents.
  if (FORCE_CAPTURE_PATTERNS.some(p => p.test(text))) return 'force_chart_recapture'

  // Order matters — more specific checks first.
  if (TRADE_LOG_PATTERNS.some(p => p.test(text))) return 'trade_log'
  if (OPEN_TRADE_MANAGEMENT_PATTERNS.some(p => p.test(text))) return 'open_trade_management'
  if (DISCIPLINE_PATTERNS.some(p => p.test(text))) return 'discipline_check'
  if (RISK_PATTERNS.some(p => p.test(text))) return 'risk_check'
  if (SESSION_PATTERNS.some(p => p.test(text))) return 'session_check'
  if (CHART_REVIEW_PATTERNS.some(p => p.test(text))) return 'chart_review'
  if (PLAYBOOK_PATTERNS.some(p => p.test(text))) return 'playbook_check'

  return 'general_trading_question'
}
