const test = require('node:test')
const assert = require('node:assert/strict')

const { read } = require('./helpers/demo.js')
const { createLocalMockProvider, ProviderError } = require('../extension/providers/local-mock-provider.js')

const dataset = () => JSON.parse(read('data/mock-coupons.json'))

test('the local provider returns AFF15 with the supplied offer terms, unknowns left unknown', async () => {
  const provider = createLocalMockProvider({ loadDataset: dataset })
  const candidates = await provider.getCandidates('sharper-image-us')

  assert.equal(provider.id, 'local-mock')
  assert.deepEqual(candidates, [
    {
      id: 'sharper-image-aff15',
      code: 'AFF15',
      storeId: 'sharper-image-us',
      providerId: 'local-mock',
      offerText: 'Receive $15 Off Your Order when You Spend $150 or More. Enter Coupon Code: AFF15 at Checkout!',
      advertisedDiscount: { type: 'fixed-order-discount', amountMinor: 1500, currency: 'USD' },
      advertisedMinimumSpend: { amountMinor: 15000, currency: 'USD', inclusive: true, basis: null },
      expiresAt: null,
      restrictions: null,
    },
  ])
})

test('stores without data get an empty list', async () => {
  const provider = createLocalMockProvider({ loadDataset: dataset })
  assert.deepEqual(await provider.getCandidates('another-store'), [])
})

test('malformed or unreadable data is a provider error, and a later request retries', async () => {
  let attempts = 0
  const provider = createLocalMockProvider({
    loadDataset: () => {
      attempts += 1
      if (attempts === 1) throw new Error('disk on fire')
      if (attempts === 2) return { schemaVersion: 2, coupons: [] }
      return dataset()
    },
  })

  await assert.rejects(provider.getCandidates('sharper-image-us'), error => error instanceof ProviderError && error.code === 'unavailable')
  await assert.rejects(provider.getCandidates('sharper-image-us'), error => error instanceof ProviderError && error.code === 'invalid-dataset')
  assert.equal((await provider.getCandidates('sharper-image-us')).length, 1)
})

test('the extension bundles exactly the user-supplied dataset', () => {
  assert.equal(read('extension/data/mock-coupons.json'), read('data/mock-coupons.json'), 'run `npm run sync:data` after editing data/mock-coupons.json')
})
