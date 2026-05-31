export function parseMoneyValue(raw: string): number | null {
  const trimmed = raw.replace(/\u00a0/g, ' ').trim()
  if (!trimmed || /^(--|n\/?a)$/i.test(trimmed)) return null

  let normalized = trimmed
    .replace(/\bUSD\b/gi, '')
    .replace(/US\$/gi, '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim()

  if (!normalized || normalized.startsWith('-')) return null

  const match = normalized.match(/^(\+?\d+(?:\.\d+)?)([km])?$/i)
  if (!match) return null

  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return null

  const suffix = match[2]?.toLowerCase()
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1
  const parsed = value * multiplier

  return Number.isFinite(parsed) ? parsed : null
}
