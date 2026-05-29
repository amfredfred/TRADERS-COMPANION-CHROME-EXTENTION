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
  // Strip currency symbols, spaces; keep digits, dot, comma, leading minus
  const s = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const n = parseFloat(s)
  if (!isFinite(n) || isNaN(n) || Math.abs(n) > 1_000_000_000) return null
  return n
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

export function findSemanticBalance(): number | null {
  return findLabeledValue(BALANCE_RE)
}

export function findSemanticEquity(): number | null {
  return findLabeledValue(EQUITY_RE)
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
