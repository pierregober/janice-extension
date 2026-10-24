// The Sharper Image adapter against (1) markup captured from the live
// checkout and (2) the Demo fixture, which simulates the store's behavior.
const test = require('node:test')
const assert = require('node:assert/strict')

const { FAST, plain, createDemoCheckout, createLivePage } = require('./helpers/demo.js')

// The adapter in the page's window, answering with plain copies for assertions.
function adapterFor({ window, Janice }, isDemo = true) {
  const adapter = Janice.createSharperImageAdapter({ window, timing: FAST, isDemo })
  return {
    detect: () => plain(adapter.detect()),
    readState: () => plain(adapter.readState()),
    prepare: async () => plain(await adapter.prepare()),
    applyCode: async code => plain(await adapter.applyCode(code)),
    removeCode: async code => plain(await adapter.removeCode(code)),
  }
}

test('live markup: reads the total from the shown copy, the currency, the code and the cart', () => {
  const page = createLivePage('live-summary-aff15.html')
  const adapter = adapterFor(page, false)
  const state = adapter.readState()

  assert.equal(adapter.detect().supported, true)
  assert.equal(state.ok, true)
  assert.deepEqual(state.total, { amountMinor: 30498, currency: 'USD', basis: 'order-total', shippingIncluded: false, taxIncluded: false })
  assert.equal(state.subtotalMinor, 31998, 'an order discount leaves the subtotal unchanged')
  assert.deepEqual(state.appliedCodes, ['AFF15'])
  assert.deepEqual(state.unrestorable, [])
  assert.equal(state.cartIdentity, 'TESTTOKEN#2×Glass Topper Cocktail Smoker Set')
  assert.equal(state.pending, false)
})

test('live markup: a lagging digit roller does not change the total read', () => {
  const page = createLivePage('live-summary-aff15.html')
  // As observed: the roller's label keeps the old amount for seconds (and in background tabs).
  page.window.document.querySelector('[aria-label="$304.98"]').setAttribute('aria-label', '$319.98')
  assert.equal(adapterFor(page, false).readState().total.amountMinor, 30498)
})

test('live markup: the baseline capture has no code and the full total', () => {
  const state = adapterFor(createLivePage('live-summary-baseline.html'), false).readState()
  assert.equal(state.total.amountMinor, 31998)
  assert.deepEqual(state.appliedCodes, [])
})

test('live markup: only the checkout path is treated as a checkout', () => {
  const page = createLivePage('live-summary-baseline.html')
  page.dom.reconfigure({ url: 'https://sharperimage.com/products/glass-topper-cocktail-smoker-set' })
  assert.deepEqual(adapterFor(page, false).detect(), { supported: false, reason: 'not-checkout' })
})

test('Demo: reads the baseline as the live checkout shows it', () => {
  const state = adapterFor(createDemoCheckout({ spendMinor: 20000 })).readState()
  assert.equal(state.ok, true)
  assert.deepEqual(state.total, { amountMinor: 20000, currency: 'USD', basis: 'order-total', shippingIncluded: true, taxIncluded: true })
  assert.deepEqual(state.appliedCodes, [])
  assert.match(state.cartIdentity, /#1×Demo Desk Lamp$/)
})

test('Demo: applying AFF15 waits for the store and reads the accepted code and new total', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000 })
  const outcome = await adapterFor(checkout).applyCode('AFF15')

  assert.equal(outcome.status, 'accepted')
  assert.equal(outcome.state.total.amountMinor, 18500)
  assert.deepEqual(outcome.state.appliedCodes, ['AFF15'])
  assert.match(outcome.message, /Discount code AFF15 has been applied Updated total price: 185.00 US dollars/)
  assert.deepEqual(checkout.demo.record.applies, ['AFF15'])
})

test('Demo: a rejection is read with the store message and an unchanged total', async () => {
  const outcome = await adapterFor(createDemoCheckout({ spendMinor: 14999 })).applyCode('AFF15')
  assert.equal(outcome.status, 'rejected')
  assert.equal(outcome.message, 'AFF15 requires a minimum purchase of $150.00.')
  assert.equal(outcome.state.total.amountMinor, 14999)
  assert.deepEqual(outcome.state.appliedCodes, [])
})

test('Demo: removing a code waits for the store and reads the restored total', async () => {
  const outcome = await adapterFor(createDemoCheckout({ spendMinor: 20000, existing: ['SAVE20'] })).removeCode('SAVE20')
  assert.equal(outcome.status, 'removed')
  assert.equal(outcome.state.total.amountMinor, 20000)
})

test('Demo: the shown total is read while the animated roller is stalled', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000, failures: ['stalled-roller'] })
  const outcome = await adapterFor(checkout).applyCode('AFF15')
  assert.equal(outcome.state.total.amountMinor, 18500)
  assert.equal(checkout.window.document.querySelector('[aria-label^="$"]').getAttribute('aria-label'), '$200.00')
})

test('Demo: a collapsed order summary is opened before testing', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000, layout: 'collapsed' })
  const adapter = adapterFor(checkout)

  const detection = adapter.detect()
  assert.equal(detection.supported, true)
  assert.equal(detection.layout, 'collapsed')
  assert.equal(detection.state.total.amountMinor, 20000, 'the hidden summary is still read, without opening it')
  assert.equal(checkout.demo.state.expanded, false, 'detection changes nothing')

  assert.deepEqual(await adapter.prepare(), { ok: true, expanded: true })
  assert.equal((await adapter.applyCode('AFF15')).status, 'accepted')
})

test('Demo: missing controls, an unreadable total and another currency are reported, not guessed', () => {
  assert.deepEqual(adapterFor(createDemoCheckout({ failures: ['missing-controls'] })).detect(), { supported: false, reason: 'no-discount-field' })
  assert.deepEqual(adapterFor(createDemoCheckout({ failures: ['unreadable-total'] })).detect(), { supported: false, reason: 'unreadable-total' })
  assert.equal(adapterFor(createDemoCheckout({ failures: ['non-usd'] })).readState().total.currency, 'CAD')
})

test('Demo: a gift card is read as a reduction that cannot be restored', () => {
  const state = adapterFor(createDemoCheckout({ failures: ['gift-card'] })).readState()
  assert.deepEqual(state.unrestorable, ['Gift card ending 4242'])
})

test('Demo: a checkout that never settles times out as unverified', async () => {
  const outcome = await adapterFor(createDemoCheckout({ failures: ['never-settle-apply'] })).applyCode('AFF15')
  assert.equal(outcome.status, 'unverified')
  assert.equal(outcome.reason, 'timeout')
})

test('Demo: an Apply button that lost its label is still found, inside the discount form only', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000 })
  checkout.window.document.querySelector('button[aria-label="Apply Discount Code"]').removeAttribute('aria-label')
  assert.equal((await adapterFor(checkout).applyCode('AFF15')).status, 'accepted')
  assert.deepEqual(checkout.demo.record.forbidden, [])
})

test('a discount field inside the payment form is refused, and nothing is clicked', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000 })
  const { document } = checkout.window
  // Move the discount field into the main checkout form, next to the email and Pay now.
  document.getElementById('demo-main-form').append(document.querySelector('input[name="reductions"]'))

  const outcome = await adapterFor(checkout).applyCode('AFF15')
  assert.equal(outcome.status, 'unsupported')
  assert.deepEqual(checkout.demo.record.forbidden, [])
  assert.deepEqual(checkout.demo.record.applies, [])
})
