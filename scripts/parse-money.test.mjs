import assert from 'node:assert/strict'
import { parseMoneyValue } from '../src/shared/lib/money.ts'

const cases = [
  ['100', 100],
  ['500', 500],
  ['1,000', 1000],
  ['9k', 9000],
  ['9K', 9000],
  ['9.5k', 9500],
  ['10k', 10000],
  ['25k', 25000],
  ['50k', 50000],
  ['100k', 100000],
  ['250k', 250000],
  ['250,000', 250000],
  ['9000', 9000],
  ['9,000', 9000],
  ['9 000', 9000],
  ['$9,000.00', 9000],
  ['US$9,000.00', 9000],
  ['USD 9,000.00', 9000],
  ['1m', 1000000],
  ['1.5m', 1500000],
  ['1.25m', 1250000],
  ['US$100,000.00', 100000],
  ['--', null],
  ['N/A', null],
  ['', null],
  ['random text', null],
]

for (const [raw, expected] of cases) {
  assert.equal(parseMoneyValue(raw), expected, raw)
}

console.log(`parseMoneyValue: ${cases.length} cases passed`)
