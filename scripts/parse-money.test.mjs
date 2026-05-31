import assert from 'node:assert/strict'
import { parseMoneyValue } from '../src/shared/lib/money.ts'

const cases = [
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

for (const [raw, expected] of cases) {
  assert.equal(parseMoneyValue(raw), expected, raw)
}

console.log(`parseMoneyValue: ${cases.length} cases passed`)
