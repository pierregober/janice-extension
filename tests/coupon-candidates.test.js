const test = require('node:test')
const assert = require('node:assert/strict')
const { parseCodes, mergeCandidates } = require('../extension/shared/coupon-candidates.js')

test('shopper codes accept common separators and deduplicate without changing the supplied spelling', () => {
  assert.deepEqual(parseCodes(' AFF15, aff15;SAVE_20\nWelcome-10\tSAVE_20 '), ['AFF15', 'SAVE_20', 'Welcome-10'])
  assert.deepEqual(parseCodes(''), [])
})

test('merging retains provider offer data and keeps shopper candidates separate from checkout outcomes', () => {
  const offer = { code: 'AFF15', advertisedDiscount: { amountMinor: 1500 } }
  assert.deepEqual(mergeCandidates([offer, { code: 'aff15' }], 'aff15,SAVE20'), [offer, { code: 'SAVE20', source: { kind: 'shopper-entered' } }])
  assert.deepEqual(offer, { code: 'AFF15', advertisedDiscount: { amountMinor: 1500 } }, 'provider data is untouched')
})

test('the combined batch is bounded and malformed codes fail before execution', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({ code: `SAVE${i}` }))
  assert.equal(mergeCandidates(twenty, 'save0').length, 20)
  assert.throws(() => mergeCandidates(twenty, 'EXTRA'), /20 different codes/)
  assert.throws(() => parseCodes('x'.repeat(2001)), /2,000 characters/)
  for (const text of ['<script>', 'SAVE/20', 'SAVE!', '-SAVE', 'x'.repeat(65)]) assert.throws(() => parseCodes(text), /64 letters/)
  for (const text of [null, {}, 123]) assert.throws(() => parseCodes(text), /2,000 characters/)
  assert.throws(() => mergeCandidates([{ code: 'BAD!' }]), /64 letters/)
})
