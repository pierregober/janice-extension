const test = require('node:test')
const assert = require('node:assert/strict')

const { parseAmount, formatAmount } = require('../extension/shared/money.js')
const { sameCode, sameCodes, isComparable, chooseBest } = require('../extension/shared/compare.js')

const total = (amountMinor, extra = {}) => ({
  amountMinor,
  currency: 'USD',
  basis: 'order-total',
  shippingIncluded: false,
  taxIncluded: false,
  ...extra,
})

test('parses displayed US amounts into integer cents', () => {
  assert.equal(parseAmount('$319.98'), 31998)
  assert.equal(parseAmount('$1,234.56'), 123456)
  assert.equal(parseAmount('$15'), 1500)
  assert.equal(parseAmount('$0.00'), 0)
  assert.equal(parseAmount('USD $9.5'), 950)
  assert.equal(parseAmount('− $15.00'), -1500, 'the checkout writes discounts with U+2212')
  assert.equal(parseAmount('-$5.10'), -510)
})

test('refuses text that does not hold exactly one readable amount', () => {
  assert.equal(parseAmount('Enter shipping address'), null)
  assert.equal(parseAmount('$304.98$319.98'), null, 'a mid-animation total holds two amounts')
  assert.equal(parseAmount('$1.234'), null)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount(undefined), null)
})

test('formats cents for display without floating-point drift', () => {
  assert.equal(formatAmount(31998, 'USD'), '$319.98')
  assert.equal(formatAmount(1500, 'USD'), '$15.00')
  assert.equal(formatAmount(-1500, 'USD'), '-$15.00')
  assert.equal(formatAmount(10000001, 'USD'), '$100,000.01')
  assert.equal(formatAmount(29, 'USD'), '$0.29')
})

test('discount codes compare case-insensitively', () => {
  assert.equal(sameCode('aff15', 'AFF15 '), true)
  assert.equal(sameCode('AFF15', 'AFF150'), false)
  assert.equal(sameCodes(['SAVE20'], ['save20']), true)
  assert.equal(sameCodes([], []), true)
  assert.equal(sameCodes(['A'], ['A', 'B']), false)
})

test('totals compare only on the same currency, amount type, shipping and tax basis', () => {
  assert.equal(isComparable(total(100), total(90)), true)
  assert.equal(isComparable(total(100), total(90, { currency: 'CAD' })), false)
  assert.equal(isComparable(total(100), total(90, { shippingIncluded: true })), false)
  assert.equal(isComparable(total(100), null), false)
})

test('the baseline keeps ties and worse totals', () => {
  assert.equal(chooseBest(total(18000), [{ code: 'AFF15', outcome: 'accepted', total: total(18500) }]).source, 'baseline')
  assert.equal(chooseBest(total(18500), [{ code: 'AFF15', outcome: 'accepted', total: total(18500) }]).source, 'baseline')
})

test('the lowest accepted, comparable total wins; rejections and other bases never do', () => {
  const best = chooseBest(total(20000), [
    { code: 'A', outcome: 'accepted', total: total(19000) },
    { code: 'B', outcome: 'accepted', total: total(18500) },
    { code: 'C', outcome: 'accepted', total: total(18500) },
    { code: 'D', outcome: 'rejected', total: total(100) },
    { code: 'E', outcome: 'accepted', total: total(1000, { taxIncluded: true }) },
    { code: 'F', outcome: 'unverified', total: null },
  ])
  assert.deepEqual(best, { source: 'candidate', code: 'B', total: total(18500) })
})
