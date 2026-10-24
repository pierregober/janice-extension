// The verified drawer promo controls and read-only cart JSON. This fixture
// replaces its coupon component after each server response, as the live
// theme does. It never submits checkout, product removal or an order form.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const { createSharperImageDrawerAdapter } = require('../extension/content/adapters/sharper-image-drawer.js')

const html = kind => fs.readFileSync(path.join(__dirname, 'fixtures/drawer', `${kind}.html`), 'utf8')
const copy = value => JSON.parse(JSON.stringify(value))
const TIMING = { pollMs: 4, settleMs: 16, timeoutMs: 160 }

function fixture(t, { codes = [], currency = 'USD', failFetch = false, noReplace = false, initialDraft = '', typeCode, delay = 12, origin = 'https://sharperimage.com' } = {}) {
  const dom = new JSDOM(`<!doctype html><body><section id="shopify-section-cart-drawer">${html('baseline')}<a class="product-remove">Remove</a><button type="submit" name="checkout">Checkout</button></section></body>`, { url: `${origin}/products/demo`, pretendToBeVisual: true })
  const { window } = dom
  const drawer = window.document.querySelector('section')
  let server = {
    currency, total_price: 15999, items_subtotal_price: 15999,
    discount_codes: [],
    items: [{ variant_id: 53427141411105, quantity: 1, original_line_price: 15999, key: 'discount-sensitive-key' }],
    token: 'PRIVATE', note: 'PRIVATE', attributes: { email: 'private@example.com' },
  }
  const record = { applies: [], removes: [], forbidden: 0, reads: 0 }
  function render(kind) {
    drawer.querySelector('discount-code-component')?.remove()
    drawer.insertAdjacentHTML('afterbegin', html(kind))
    wire()
  }
  function wire() {
    drawer.querySelector('[data-qa="promo-apply"]').addEventListener('click', () => {
      const code = drawer.querySelector('input[name="discount_code"]').value
      record.applies.push(code)
      drawer.setAttribute('data-is-updating', 'true')
      // The real theme clears BUSY before its eventual section replacement.
      window.setTimeout(() => drawer.removeAttribute('data-is-updating'), 2)
      window.setTimeout(() => {
        server.discount_codes = [{ code, applicable: code === 'AFF15' }]
        server.total_price = code === 'AFF15' ? 14499 : 15999
        server.items[0].key = `${code}-CHANGED-KEY`
        if (!noReplace) render(code === 'AFF15' ? 'accepted' : 'rejected')
      }, delay)
    })
    for (const button of drawer.querySelectorAll('[data-qa^="promo-remove-"]')) button.addEventListener('click', () => {
      record.removes.push(button.dataset.discountCode)
      drawer.setAttribute('data-is-updating', 'true')
      window.setTimeout(() => {
        server.discount_codes = []
        server.total_price = 15999
        drawer.removeAttribute('data-is-updating')
        if (!noReplace) render('baseline')
      }, delay)
    })
  }
  wire()
  drawer.querySelector('.product-remove').addEventListener('click', () => { record.forbidden++ })
  drawer.querySelector('[name="checkout"]').addEventListener('click', () => { record.forbidden++ })
  if (codes.length) {
    server.discount_codes = codes.map(code => ({ code, applicable: true }))
    server.total_price = 14499
    render('accepted')
    for (const code of codes.slice(1)) {
      const button = window.document.createElement('button')
      button.type = 'button'
      button.dataset.qa = 'promo-remove-1'
      button.dataset.discountCode = code
      drawer.querySelector('discount-code-component').append(button)
    }
  }
  drawer.querySelector('input').value = initialDraft
  window.fetch = async (url, options) => {
    record.reads++
    assert.equal(url, '/cart.js')
    assert.equal(options.method, 'GET', 'cart endpoint is read-only')
    if (failFetch) return { ok: false, status: 429 }
    return { ok: true, json: async () => copy(server) }
  }
  const adapter = createSharperImageDrawerAdapter({ window, timing: TIMING, typeCode })
  t.after(() => window.close())
  return { window, drawer, adapter, record, server: () => server, replace: render }
}

test('drawer adapter detects only verified controls/origin and reads whitelisted authoritative cart amounts', async t => {
  const page = fixture(t)
  assert.equal(page.adapter.detect().supported, true)
  assert.equal(page.adapter.detect().state, null, 'inspection does not fetch until baseline is requested')
  assert.equal(page.record.reads, 0)
  assert.deepEqual(await page.adapter.prepare(), { ok: true })
  const state = await page.adapter.readSettledState()
  assert.equal(state.ok, true)
  assert.deepEqual(state.total, { amountMinor: 15999, currency: 'USD', basis: 'cart-total', shippingIncluded: false, taxIncluded: false })
  assert.deepEqual(state.appliedCodes, [])
  assert.equal(JSON.stringify(state).includes('PRIVATE'), false)
  assert.equal(JSON.stringify(state).includes('private@example.com'), false)
  assert.equal(page.record.reads, 1)
  const other = fixture(t, { origin: 'https://shop.app' })
  assert.deepEqual(other.adapter.detect(), { supported: false, reason: 'not-checkout' })
  assert.equal((await other.adapter.applyCode('AFF15')).status, 'unsupported')
  assert.equal(other.record.applies.length, 0)
})

test('drawer adapter waits for real replacement, rejects invalid codes and reads accepted savings before native removal', async t => {
  const page = fixture(t, { delay: 35 })
  await page.adapter.prepare()
  const baseline = await page.adapter.readSettledState()
  const rejected = await page.adapter.applyCode('JANICETEST0')
  assert.equal(rejected.status, 'rejected')
  assert.match(rejected.message, /JANICETEST0 is not valid/)
  assert.equal(rejected.state.total.amountMinor, 15999)
  assert.deepEqual(rejected.state.appliedCodes, [], 'inapplicable stored codes are not applied codes')
  const accepted = await page.adapter.applyCode('AFF15')
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.state.total.amountMinor, 14499)
  assert.deepEqual(accepted.state.appliedCodes, ['AFF15'])
  assert.equal(accepted.state.cartIdentity, baseline.cartIdentity, 'discount-dependent line key is ignored')
  const removed = await page.adapter.removeCode('AFF15')
  assert.equal(removed.status, 'removed')
  assert.equal(removed.state.total.amountMinor, 15999)
  assert.deepEqual(removed.state.appliedCodes, [])
  assert.deepEqual(page.record.applies, ['JANICETEST0', 'AFF15'])
  assert.deepEqual(page.record.removes, ['AFF15'])
  assert.equal(page.record.forbidden, 0)
  assert.equal(page.record.reads, 6, 'one read per baseline/outcome plus one pre-Apply guard; never every poll')
})

test('drawer adapter preserves draft state and refuses to overwrite intervening shopper text', async t => {
  const page = fixture(t, { initialDraft: 'MYDRAFT' })
  await page.adapter.prepare()
  await page.adapter.readSettledState()
  assert.equal((await page.adapter.applyCode('JANICETEST0')).status, 'rejected')
  assert.deepEqual(page.adapter.restoreDraft(), { ok: true })
  assert.equal(page.drawer.querySelector('input').value, 'MYDRAFT')
  page.drawer.querySelector('input').value = 'SHOPPER'
  assert.deepEqual(page.adapter.restoreDraft(), { ok: false, reason: 'codes-changed' })
  assert.equal(page.drawer.querySelector('input').value, 'SHOPPER')
  const result = await page.adapter.applyCode('AFF15')
  assert.equal(result.reason, 'codes-changed')
  assert.deepEqual(page.record.applies, ['JANICETEST0'])
})

test('drawer adapter never clicks Apply after typing cancellation or replacement', async t => {
  let canceled = false
  const page = fixture(t, { typeCode: async (input, code, options) => {
    input.value = code[0]
    canceled = true
    assert.equal(options.isCancelled(), true)
    return { ok: false, reason: 'stopped' }
  } })
  await page.adapter.prepare()
  await page.adapter.readSettledState()
  const stopped = await page.adapter.applyCode('AFF15', { isCancelled: () => canceled })
  assert.equal(stopped.status, 'canceled')
  assert.equal(stopped.reason, 'stopped')
  assert.equal(page.record.applies.length, 0)
  assert.deepEqual(page.adapter.restoreDraft(), { ok: true })
  const replaced = fixture(t, { typeCode: async (input, code) => {
    input.value = code
    input.remove()
    return { ok: true }
  } })
  assert.equal((await replaced.adapter.applyCode('AFF15')).reason, 'codes-changed')
  assert.equal(replaced.record.applies.length, 0)
})

test('drawer adapter treats READY without replacement as unverified and retains pending status', async t => {
  const page = fixture(t, { noReplace: true })
  await page.adapter.prepare()
  await page.adapter.readSettledState()
  const outcome = await page.adapter.applyCode('AFF15')
  assert.equal(outcome.status, 'unverified')
  assert.equal(outcome.state.pending, true)
  assert.equal(page.record.reads, 2, 'baseline/pre-Apply only; no server polls while the verified UI outcome is missing')
  assert.equal(page.record.forbidden, 0)
})

test('drawer adapter refuses missing unsafe Apply controls and reports throttled state without mutations', async t => {
  const page = fixture(t)
  page.drawer.querySelector('[data-qa="promo-apply"]').type = 'submit'
  assert.equal(page.adapter.detect().supported, false)
  assert.equal((await page.adapter.applyCode('AFF15')).reason, 'apply-disabled')
  assert.equal(page.record.applies.length, 0)
  const blocked = fixture(t, { failFetch: true })
  assert.deepEqual(await blocked.adapter.readSettledState(), { ok: false, reason: 'blocked', pending: false })
  assert.equal(blocked.record.applies.length, 0)
})

test('drawer adapter exposes currency, multiple existing codes, and quantity changes for controller guards', async t => {
  const page = fixture(t, { codes: ['AFF15', 'OTHER'], currency: 'CAD' })
  const first = await page.adapter.readSettledState()
  assert.equal(first.total.currency, 'CAD')
  assert.deepEqual(first.appliedCodes, ['AFF15', 'OTHER'])
  const previousIdentity = first.cartIdentity
  page.server().items[0].quantity = 2
  page.server().items[0].original_line_price = 31998
  const changed = await page.adapter.readSettledState()
  assert.notEqual(changed.cartIdentity, previousIdentity)
})

test('drawer adapter stops a changed cart or discount state after typing and before Apply', async t => {
  for (const change of ['quantity', 'codes', 'pending']) await t.test(change, async sub => {
    let page
    page = fixture(sub, { typeCode: async (input, code) => {
      input.value = code
      if (change === 'quantity') page.server().items[0].quantity = 2
      if (change === 'codes') page.server().discount_codes = [{ code: 'SHOPPER', applicable: true }]
      if (change === 'pending') page.drawer.setAttribute('data-is-updating', 'true')
      return { ok: true }
    } })
    await page.adapter.prepare()
    await page.adapter.readSettledState()
    const outcome = await page.adapter.applyCode('AFF15')
    assert.equal(outcome.status, 'unverified')
    assert.equal(outcome.reason, { quantity: 'cart-changed', codes: 'codes-changed', pending: 'checkout-busy' }[change])
    assert.deepEqual(page.record.applies, [], 'no Apply request after an intervening cart change')
  })
})

test('drawer adapter refuses server/DOM code mismatches in either direction and untouched draft restoration is a no-op', async t => {
  const page = fixture(t)
  assert.deepEqual(page.adapter.restoreDraft(), { ok: true })
  page.replace('accepted')
  let state = await page.adapter.readSettledState()
  assert.equal(state.ok, false)
  assert.equal(state.reason, 'cart-unreadable')
  const result = await page.adapter.applyCode('AFF15')
  assert.equal(result.status, 'unverified')
  assert.equal(page.record.applies.length, 0)
  page.replace('baseline')
  page.server().discount_codes = [{ code: 'AFF15', applicable: true }]
  state = await page.adapter.readSettledState()
  assert.equal(state.ok, false)
  assert.equal(state.reason, 'cart-unreadable')
})
