/**
 * Semantic value detection for unknown trading platforms.
 *
 * Strategy: scan the live DOM for labelled numeric widgets.
 * Most trading UIs render account info as adjacent label+value elements:
 *
 *   <span class="label">Balance</span>
 *   <span class="value">10,432.56</span>
 *
 * or as a single element: "Balance: 10,432.56"
 *
 * We find the label element by own-text, then read the nearest numeric sibling.
 */

import type { DetectedPosition } from '../../shared/types/trade'
import type { DetectedAccount } from '../../shared/types/platform'
import type { PlatformName } from './types'
import { parseMoneyValue } from '../../shared/lib/money'

// ── Primitives ────────────────────────────────────────────────────────────────

function ownText(el: Element): string {
  let t = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) t += node.textContent ?? ''
  }
  return t.trim()
}

/**
 * Parse a money / numeric string like "10,432.56", "$1 234.00", "-45.3".
 * Returns null if no valid finite number is found or value is implausibly large.
 */
function parseAmount(raw: string): number | null {
  return parseMoneyValue(raw)
}

/** Read a numeric value from an element's textContent. */
function numericContent(el: Element): number | null {
  return parseAmount(el.textContent ?? '')
}

// ── Label → value lookup ──────────────────────────────────────────────────────

const QUERY = 'span, div, td, th, label, p, li'

/**
 * Find the numeric value paired with a label element whose own text matches re.
 * Checks (in order):
 *   1. Next element sibling
 *   2. Previous element sibling
 *   3. Other children of the parent element
 *   4. Text after a colon in the same element ("Balance: 10,432.56")
 */
function findLabeledValue(re: RegExp): number | null {
  for (const el of document.querySelectorAll(QUERY)) {
    if (!re.test(ownText(el))) continue

    // 1. Adjacent sibling (next)
    const next = el.nextElementSibling
    if (next) {
      const v = numericContent(next)
      if (v !== null) return v
    }

    // 2. Previous sibling (value-first layouts)
    const prev = el.previousElementSibling
    if (prev) {
      const v = numericContent(prev)
      if (v !== null) return v
    }

    // 3. Other children of the parent
    const parent = el.parentElement
    if (parent) {
      for (const sibling of parent.children) {
        if (sibling === el) continue
        const v = numericContent(sibling)
        if (v !== null) return v
      }
    }

    // 4. Inline "Label: value" text
    const full = el.textContent ?? ''
    const afterColon = full.replace(re, '').replace(/^[\s:]+/, '')
    if (afterColon) {
      const v = parseAmount(afterColon)
      if (v !== null) return v
    }
  }
  return null
}

// ── Public value detectors ────────────────────────────────────────────────────

const BALANCE_RE = /\bbalance\b/i
const EQUITY_RE  = /\bequity\b/i
const PNL_RE     = /\b(p[&\/]?l|profit\s*&?\s*loss|floating|unrealized|open\s+p[&\/]?l)\b/i
const ACCOUNT_VALUE_RE = /\b(balance|equity|account\s*balance|available\s*balance|funds|net\s*liquidation|account\s*value)\b/i
const ACCOUNT_PANEL_RE = /\b(account|summary|funds|wallet|portfolio|terminal|trade|header|balance|equity)\b/i
const NEGATIVE_CONTEXT_RE = /\b(p[&\/]?l|profit|loss|margin|spread|price|bid|ask|lot|volume|stop|take\s*profit|tp|sl|chart|axis|symbol)\b/i
const STRONG_ACCOUNT_SOURCE_RE = /\b(balance|equity|funds|account|net\s*liquidation|account\s*value)\b/i
const MONEY_TOKEN_RE = /(?:US\$|\$|USD\s*)?\s*\d[\d,\s]*(?:\.\d+)?\s*[kKmM]?/g
const QUERY_ELEMENTS = 'span, div, td, th, label, p, li, button'
const ACCOUNT_ID_RE = /\b(account|login|id|number|server|broker|currency|type)\b/i
const ACCOUNT_NUMBER_RE = /\b\d{5,12}\b/
const CURRENCY_RE = /\b(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|US\$|\$)\b/i

export interface BalanceCandidate {
  raw: string
  parsed: number
  source: string
  label?: string
  confidence: number
  element?: Element
  rejected?: string
}

function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function describeElement(el: Element): string {
  const parts = [el.tagName.toLowerCase()]
  const id = el.getAttribute('id')
  if (id) parts.push(`#${id}`)
  const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-e2e')
  if (testId) parts.push(`[data-testid="${testId}"]`)
  const className = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
  if (className) parts.push(`.${className}`)
  return parts.join('')
}

function candidateTokens(text: string): string[] {
  return Array.from(text.matchAll(MONEY_TOKEN_RE), match => match[0].trim()).filter(Boolean)
}

function elementContext(el: Element, labelText: string, sourceKind: string): string {
  return [
    sourceKind,
    labelText,
    ownText(el),
    el.textContent ?? '',
    el.parentElement?.textContent ?? '',
    el.getAttribute('class') ?? '',
    el.parentElement?.getAttribute('class') ?? '',
    el.getAttribute('id') ?? '',
    el.parentElement?.getAttribute('id') ?? '',
    el.getAttribute('data-testid') ?? '',
    el.parentElement?.getAttribute('data-testid') ?? '',
    el.getAttribute('data-e2e') ?? '',
    el.parentElement?.getAttribute('data-e2e') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.parentElement?.getAttribute('aria-label') ?? '',
  ].join(' ')
}

function hasStrongAccountContext(el: Element, labelText: string, sourceKind: string): boolean {
  return sourceKind.startsWith('preferred:') ||
    STRONG_ACCOUNT_SOURCE_RE.test(labelText) ||
    STRONG_ACCOUNT_SOURCE_RE.test(elementContext(el, labelText, sourceKind))
}

function confidenceFor(el: Element, raw: string, parsed: number, labelText: string, sourceKind: string): number {
  const sourceText = elementContext(el, labelText, sourceKind)
  const accountContext = hasStrongAccountContext(el, labelText, sourceKind)

  let score = 0.35
  if (ACCOUNT_VALUE_RE.test(sourceText)) score += 0.32
  if (ACCOUNT_PANEL_RE.test(sourceText)) score += 0.12
  if (isElementVisible(el)) score += 0.1
  if (/\b(balance|equity|funds)\b/i.test(labelText)) score += 0.12
  if (raw.includes('$') || /\bUSD\b|US\$/i.test(raw)) score += 0.04
  if (/[kKmM]\s*$/.test(raw)) score += 0.04
  if (parsed > 0 && parsed <= 1_000_000_000) score += 0.08
  if (parsed >= 1_000 && parsed <= 1_000_000) score += 0.04
  if (parsed < 100 && !accountContext) score -= 0.22
  if (NEGATIVE_CONTEXT_RE.test(sourceText) && !accountContext) score -= 0.35

  return Math.max(0, Math.min(0.98, score))
}

function rejectionReason(el: Element, raw: string, parsed: number | null, labelText: string, sourceKind: string): string | null {
  const context = elementContext(el, labelText, sourceKind)
  const accountContext = hasStrongAccountContext(el, labelText, sourceKind)
  if (parsed === null) return 'not a supported money format'
  if (parsed <= 0) return 'not a positive balance'
  if (parsed > 1_000_000_000) return 'outside reasonable account range'
  if (NEGATIVE_CONTEXT_RE.test(context) && !accountContext) {
    return /chart|axis|price|bid|ask/i.test(context) ? 'near chart price axis' : 'near non-balance trading metric'
  }
  if (candidateTokens(raw).length > 2) return 'too many numeric values in source'
  return null
}

function logBalanceDebug(message: string, candidate: BalanceCandidate | { raw: string; reason: string }): void {
  if (!import.meta.env.DEV) return
  if ('parsed' in candidate) {
    console.debug(`[TC] ${message}`, {
      raw: candidate.raw,
      parsed: candidate.parsed,
      source: candidate.label ?? candidate.source,
      confidence: Number(candidate.confidence.toFixed(2)),
    })
  } else {
    console.debug('[TC] Rejected balance candidate', candidate)
  }
}

function addCandidate(
  candidates: BalanceCandidate[],
  rejected: Array<{ raw: string; reason: string }>,
  el: Element,
  raw: string,
  labelText: string,
  sourceKind: string,
): void {
  const parsed = parseMoneyValue(raw)
  const reason = rejectionReason(el, raw, parsed, labelText, sourceKind)
  if (reason || parsed === null) {
    rejected.push({ raw, reason: reason ?? 'not a supported money format' })
    return
  }

  candidates.push({
    raw,
    parsed,
    source: describeElement(el),
    label: labelText || sourceKind,
    confidence: confidenceFor(el, raw, parsed, labelText, sourceKind),
    element: el,
  })
}

function collectFromElement(
  candidates: BalanceCandidate[],
  rejected: Array<{ raw: string; reason: string }>,
  el: Element,
  labelText: string,
  sourceKind: string,
): void {
  for (const token of candidateTokens(el.textContent ?? '')) {
    addCandidate(candidates, rejected, el, token, labelText, sourceKind)
  }
}

export function findBestBalanceCandidate(preferredSelectors: string[] = []): BalanceCandidate | null {
  const candidates: BalanceCandidate[] = []
  const rejected: Array<{ raw: string; reason: string }> = []

  for (const selector of preferredSelectors) {
    for (const el of document.querySelectorAll(selector)) {
      collectFromElement(candidates, rejected, el, ownText(el), `preferred:${selector}`)
    }
  }

  for (const labelEl of document.querySelectorAll(QUERY_ELEMENTS)) {
    const labelText = ownText(labelEl)
    if (!ACCOUNT_VALUE_RE.test(labelText)) continue

    collectFromElement(candidates, rejected, labelEl, labelText, 'same element')

    const nearby = [
      labelEl.nextElementSibling,
      labelEl.previousElementSibling,
      labelEl.parentElement,
      ...Array.from(labelEl.children),
      ...Array.from(labelEl.parentElement?.children ?? []),
    ].filter((el): el is Element => !!el)

    for (const el of nearby) {
      collectFromElement(candidates, rejected, el, labelText, 'nearby label')
    }
  }

  const frequency = new Map<number, number>()
  for (const candidate of candidates) {
    frequency.set(candidate.parsed, (frequency.get(candidate.parsed) ?? 0) + 1)
  }

  for (const candidate of candidates) {
    const count = frequency.get(candidate.parsed) ?? 1
    if (count > 1) candidate.confidence = Math.min(0.99, candidate.confidence + Math.min(0.12, count * 0.03))
  }

  const best = candidates
    .filter(candidate => candidate.confidence >= 0.55)
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null

  for (const candidate of candidates) logBalanceDebug('Balance candidate found', candidate)
  for (const item of rejected) logBalanceDebug('Rejected candidate', item)

  return best
}

export function findSemanticBalance(): number | null {
  return findBestBalanceCandidate()?.parsed ?? findLabeledValue(BALANCE_RE)
}

export function findSemanticEquity(): number | null {
  return findBestBalanceCandidate()?.parsed ?? findLabeledValue(EQUITY_RE)
}

export function findSemanticAccount(platform: PlatformName, balance: number | null, equity: number | null): DetectedAccount | null {
  const accountTexts: string[] = []
  const preferredSelectors = [
    '[data-testid*="account" i]',
    '[data-testid*="login" i]',
    '[data-testid*="server" i]',
    '[class*="account" i]',
    '[class*="login" i]',
    '[class*="server" i]',
    '[id*="account" i]',
  ]

  for (const selector of preferredSelectors) {
    for (const el of document.querySelectorAll(selector)) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text && text.length <= 240) accountTexts.push(text)
    }
  }

  for (const el of document.querySelectorAll(QUERY_ELEMENTS)) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text || text.length > 240 || !ACCOUNT_ID_RE.test(text)) continue
    accountTexts.push(text)
  }

  const rawSource = Array.from(new Set(accountTexts)).slice(0, 8).join(' | ')
  const accountId = ACCOUNT_NUMBER_RE.exec(rawSource)?.[0] ?? null
  const currencyMatch = CURRENCY_RE.exec(rawSource)
  const currency = currencyMatch?.[0]?.replace('US$', 'USD').replace('$', 'USD').toUpperCase() ?? null
  const accountType = /\b(demo|real|live|funded|challenge|evaluation)\b/i.exec(rawSource)?.[0] ?? null
  const accountName = accountId
    ? rawSource.split('|').map(part => part.trim()).find(part => part.includes(accountId)) ?? accountId
    : rawSource.split('|')[0]?.trim() ?? null

  if (!accountId && !accountName && !currency) return null

  return {
    platform,
    accountId,
    accountName,
    accountType,
    currency,
    balance,
    equity,
    rawSource: rawSource || `${platform}:${currency ?? 'unknown'}`,
    detectedAt: Date.now(),
  }
}

export function findSemanticPnL(): number | null {
  return findLabeledValue(PNL_RE)
}

// ── Symbol detection ──────────────────────────────────────────────────────────

/**
 * Matches common trading instrument formats:
 *   XAUUSD  EURUSD  BTC/USDT  NAS100  US30  GC  NQ  ES  CL
 */
const SYMBOL_RE = /\b([A-Z]{2,4}\/[A-Z]{2,4}|[A-Z]{6}|US\d{2}|NAS\d{2,3}|NQ|ES|GC|CL|BTC|ETH|XAU)\b/

/** Priority selectors for symbol display — typically in headers or info bars. */
const SYMBOL_PRIORITY_SEL = [
  '[class*="symbol"]', '[class*="instrument"]', '[class*="market"]',
  '[class*="asset"]',  '[class*="pair"]',        '[class*="ticker"]',
  'h1', 'h2', 'h3',
].join(', ')

export function findSemanticSymbol(): string | null {
  // Check priority elements first
  for (const el of document.querySelectorAll(SYMBOL_PRIORITY_SEL)) {
    const text = el.textContent ?? ''
    const m = SYMBOL_RE.exec(text)
    if (m) return m[0]
  }
  return null
}

// ── Open positions scanner ────────────────────────────────────────────────────

const DIRECTION_RE  = /\b(buy|sell|long|short)\b/i
const OPEN_PNL_RE   = /^[+-]?\d[\d,.]*$/       // signed or plain number

/**
 * Scan for open position rows. Works best on platforms that render positions
 * in a <table> or repeated list items. Each row should contain:
 *   - A direction indicator ("Buy" / "Sell" / "Long" / "Short")
 *   - A symbol-like string
 *   - A numeric P&L value
 *
 * This is intentionally conservative — it only returns rows that match all
 * three criteria, to avoid false positives from random page tables.
 */
export function findSemanticOpenPositions(): DetectedPosition[] {
  const positions: DetectedPosition[] = []

  // Try <tr> rows first, then generic repeated containers
  const rowSelectors = [
    'tr',
    '[class*="position-row"]', '[class*="positionRow"]',
    '[class*="trade-row"]',    '[class*="tradeRow"]',
    '[class*="order-row"]',    '[class*="orderRow"]',
  ]

  const rows = document.querySelectorAll(rowSelectors.join(', '))
  const seen = new Set<string>()

  rows.forEach((row, idx) => {
    const text = row.textContent ?? ''

    // Must have a direction word
    const dirMatch = DIRECTION_RE.exec(text)
    if (!dirMatch) return

    // Must have a symbol-like word
    const symMatch = SYMBOL_RE.exec(text)
    if (!symMatch) return

    // Must have a signed/plain numeric value that looks like P&L
    const cells = Array.from(row.querySelectorAll('td, [class*="cell"], span'))
    let pnl: number | undefined
    for (const cell of cells) {
      const cellText = (cell.textContent ?? '').trim()
      if (OPEN_PNL_RE.test(cellText.replace(/,/g, ''))) {
        const v = parseFloat(cellText.replace(/,/g, ''))
        if (isFinite(v)) { pnl = v; break }
      }
    }

    // Build a stable ID from symbol + direction + index
    const symbol    = symMatch[0]
    const direction = /sell|short/i.test(dirMatch[0]) ? 'short' : 'long'
    const id        = `sem-${symbol}-${direction}-${idx}`

    if (seen.has(id)) return
    seen.add(id)

    positions.push({ id, symbol, direction, size: 0, pnl })
  })

  return positions
}
