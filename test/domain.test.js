import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localDate, localTime, monthRange, requestItems, requestTotal } from '../src/domain.js'

test('operational dates and month filters use Makassar time', () => {
  const midnight = new Date('2026-12-31T16:00:00Z')
  assert.equal(localDate(midnight), '2027-01-01')
  assert.equal(localTime(midnight), '00:00')
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2027-01-01' })
})

test('request total uses named lines and sums rounded subtotals', () => {
  const lines = requestItems([
    { item_name: ' Beras ', qty: '1.25', unit_price: '1135.01', unit: 'kg' },
    { item_name: ' ', qty: '1', unit_price: '1000', unit: 'pcs' },
    { item_name: 'Telur', qty: '2', unit_price: '100', unit: 'pcs' },
  ])
  assert.equal(lines[0].item_name, 'Beras')
  assert.equal(lines.length, 2)
  assert.equal(requestTotal(lines), 1618.76)
})
