import { parseMoneyValue } from './money'

export const parseMoneyValueTestCases: Array<[string, number | null]> = [
  ['9k', 9000],
  ['9K', 9000],
  ['9.5k', 9500],
  ['9000', 9000],
  ['9,000', 9000],
  ['9 000', 9000],
  ['$9,000.00', 9000],
  ['US$9,000.00', 9000],
  ['USD 9,000.00', 9000],
  ['1m', 1000000],
  ['--', null],
  ['N/A', null],
]

export function runParseMoneyValueTests(): void {
  for (const [raw, expected] of parseMoneyValueTestCases) {
    const actual = parseMoneyValue(raw)
    if (actual !== expected) {
      throw new Error(`parseMoneyValue(${JSON.stringify(raw)}) returned ${actual}; expected ${expected}`)
    }
  }
}
