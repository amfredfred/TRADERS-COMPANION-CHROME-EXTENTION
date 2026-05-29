/**
 * Semantic buy/sell button detection.
 *
 * Works on any platform by scanning the live DOM for interactive elements
 * whose own text is exactly "Buy" or "Sell" and that co-locate with a
 * price-like number. No hardcoded class names required.
 *
 * Match strategy:
 *   1. Find leaf-level elements whose own text nodes read exactly "Buy" or "Sell".
 *   2. Climb to the nearest ancestor that is either an explicit button/role=button
 *      OR that contains a trading-price-like number alongside the side text.
 *   3. Return that container so click interception works on the whole widget.
 */

const PRICE_RE = /\b\d{1,6}\.\d{2,5}\b/
const BUY_RE   = /^\s*buy\s*$/i
const SELL_RE  = /^\s*sell\s*$/i

function ownText(el: Element): string {
  let t = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) t += node.textContent ?? ''
  }
  return t.trim()
}

function isButtonLike(el: Element): boolean {
  return el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'
}

function climbToContainer(origin: Element): Element {
  let cursor: Element | null = origin.parentElement
  while (cursor && cursor !== document.body) {
    // Explicit button semantics — stop immediately
    if (isButtonLike(cursor)) return cursor
    // Container holds a price — this is the order widget root
    if (PRICE_RE.test(cursor.textContent ?? '')) return cursor
    // Bail out if we've climbed past a likely layout boundary
    const tag = cursor.tagName
    if (tag === 'SECTION' || tag === 'MAIN' || tag === 'FORM') break
    cursor = cursor.parentElement
  }
  // No price-containing ancestor found — return origin itself
  // (handles plain "Buy / Sell" buttons with no inline price)
  return origin
}

/**
 * Return the element to treat as the Buy or Sell button on the current page,
 * or null if no unambiguous order button is found.
 */
export function findSemanticOrderButton(side: 'buy' | 'sell'): Element | null {
  const re = side === 'buy' ? BUY_RE : SELL_RE

  // Fast path: common explicit button selectors first
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (re.test(ownText(el))) return el
    // Child span/div that is the label inside an explicit button
    for (const child of el.querySelectorAll('span, div')) {
      if (re.test(ownText(child))) return el
    }
  }

  // Wider scan: any span or div whose own text is exactly the side word
  for (const el of document.querySelectorAll('span, div')) {
    if (!re.test(ownText(el))) continue
    const container = climbToContainer(el)
    // Require at least some price-like text in the container to avoid
    // matching generic "Buy now" or "Sell" links in nav bars
    if (PRICE_RE.test(container.textContent ?? '')) return container
  }

  return null
}

/**
 * True when both a Buy and a Sell order button can be found semantically.
 * Used by the detector to promote unknown platforms to adapter_active.
 */
export function semanticOrderButtonsPresent(): boolean {
  return !!findSemanticOrderButton('buy') && !!findSemanticOrderButton('sell')
}
