// A deterministic Demo cart drawer, served at the supported store origin
// through Playwright routing. No requests reach the live store. These
// checks prove field discovery, serial native Apply/Remove operations and
// verified comparisons. They are simulated results, never live-store proof.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '../../fixtures/cart-drawer')
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../../extension/data/mock-coupons.json'), 'utf8'))

async function fixture(t, { query = '', emptyCandidates = false, viewport, codes } = {}) {
  const dataset = emptyCandidates ? { ...DATA, coupons: [] } : codes ? { ...DATA, coupons: codes.map(code => ({ id: `demo-${code}`, storeId: 'sharper-image-us', code, offerText: 'Demo coupon candidate' })) } : null
  const extensionDir = testCopy({ hostPermissions: ['https://sharperimage.com/*'], ...(dataset ? { dataset } : {}) })
  const browser = await launch({ extensionDir, ...(viewport ? { viewport } : {}) })
  t.after(async () => {
    await browser.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  })
  await browser.context.route('https://sharperimage.com/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/cart.js') {
      const cart = await route.request().frame().evaluate(() => window.JaniceDrawerDemo?.cartSnapshot())
      return route.fulfill({ status: cart ? 200 : 503, contentType: 'application/json', body: JSON.stringify(cart ?? {}) })
    }
    const name = pathname.endsWith('.css') ? 'cart-drawer.css' : pathname.endsWith('.js') ? 'cart-drawer.js' : 'index.html'
    return route.fulfill({ status: 200, contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html', body: fs.readFileSync(path.join(FIXTURE, name)) })
  })
  const page = await browser.context.newPage()
  await page.goto(`https://sharperimage.com/cart-drawer-fixture?${query}`)
  const tabId = await browser.tabId('https://sharperimage.com/*')
  const launcher = page.locator('janice-coupons-launcher')
  await launcher.locator('.tab').waitFor()
  const inline = page.locator('janice-inline-coupon')
  const outline = inline.locator('.coupon-outline')
  const useCode = inline.locator('.use-code')
  const mutations = () => page.evaluate(() => window.JaniceDrawerDemo.record.applies)
  const runDone = async previousId => {
    const deadline = Date.now() + 35000
    while (Date.now() < deadline) {
      const run = await browser.storedRun(tabId)
      if (run?.status === 'done' && run.runId !== previousId) return run
      await page.waitForTimeout(80)
    }
    throw new Error(`coupon run did not finish: ${JSON.stringify(await browser.storedRun(tabId))}`)
  }
  return { browser, page, tabId, launcher, inline, outline, useCode, mutations, runDone }
}

async function followsField(field, outline) {
  const deadline = Date.now() + 1500
  let input
  let ring
  do {
    input = await field.boundingBox()
    ring = await outline.boundingBox()
    if (input && ring && Math.abs(ring.x - input.x) <= 5 && Math.abs(ring.y - input.y) <= 5) break
    await field.page().waitForTimeout(25)
  } while (Date.now() < deadline)
  assert.ok(input && ring)
  assert.ok(Math.abs(ring.x - input.x) <= 5 && Math.abs(ring.y - input.y) <= 5, `outline stays attached to the promo input: ${JSON.stringify({ input, ring })}`)
  assert.ok(ring.width >= input.width && ring.width <= input.width + 10 && ring.height >= input.height && ring.height <= input.height + 10, 'the rainbow is a thin input outline')
  return input
}

async function screenshot(page, field, useCode, name) {
  const input = await field.boundingBox()
  const button = await useCode.boundingBox()
  const status = await page.locator('janice-inline-coupon').locator('.coupon-status').boundingBox()
  const boxes = [input, button, status].filter(Boolean)
  const viewport = page.viewportSize()
  const x = Math.max(0, Math.min(...boxes.map(box => box.x)) - 12)
  const y = Math.max(0, Math.min(...boxes.map(box => box.y)) - 30)
  const right = Math.min(viewport.width, Math.max(...boxes.map(box => box.x + box.width)) + 12)
  const bottom = Math.min(viewport.height, Math.max(...boxes.map(box => box.y + box.height)) + 40)
  const dir = path.join(__dirname, '../../test-results/inline-coupon')
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, name), clip: { x, y, width: right - x, height: bottom - y } })
}

test('Demo drawer: Use code enters a candidate at once, clicks native Apply and reports a verified improving cart', async t => {
  const { page, launcher, inline, outline, useCode, mutations, runDone } = await fixture(t)
  assert.equal(await useCode.isVisible(), false, 'closed drawer has no code control')
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await useCode.waitFor()
  const field = page.getByLabel('Discount code', { exact: true })
  await followsField(field, outline)
  assert.equal(await useCode.innerText(), 'Use code')
  assert.equal(await inline.evaluate(element => element.matches(':popover-open')), true, 'attached control is above drawer stacking contexts')
  assert.equal(await page.locator('.savings-signal').count(), 0, 'the large reminder was removed')
  assert.equal(await page.evaluate(() => document.activeElement.id), 'open-cart', 'showing the outline does not steal focus')
  assert.equal(await launcher.locator('.card').isVisible(), false, 'the large coupon card stays closed')
  assert.equal(await mutations(), 0)
  const small = await useCode.boundingBox()
  assert.ok(small.height <= 36 && small.width <= 140, 'the action is a small field companion')
  const hit = await field.evaluate(input => {
    const box = input.getBoundingClientRect()
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === input
  })
  assert.equal(hit, true, 'the rainbow outline cannot intercept native input interaction')
  const applyHit = await page.getByRole('button', { name: 'Apply', exact: true }).evaluate(button => {
    const box = button.getBoundingClientRect()
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button
  })
  assert.equal(applyHit, true, 'the attached control leaves the merchant Apply button usable')
  await screenshot(page, field, useCode, 'desktop.png')
  await field.focus()
  await page.keyboard.press('Tab')
  assert.equal(await useCode.evaluate(button => button.getRootNode().activeElement === button), true, 'Tab reaches Use code from the native promo field')
  await page.keyboard.press('Tab')
  assert.equal(await page.getByRole('button', { name: 'Apply', exact: true }).evaluate(button => document.activeElement === button), true, 'Tab continues from Use code to the native Apply button')
  await field.evaluate(input => {
    window.JaniceEntryTrace = { values: [], metadata: [], changes: 0 }
    input.addEventListener('input', event => {
      window.JaniceEntryTrace.values.push(input.value)
      window.JaniceEntryTrace.metadata.push({ data: event.data, inputType: event.inputType })
    })
    input.addEventListener('change', () => { window.JaniceEntryTrace.changes++ })
  })
  await useCode.click()
  const run = await runDone()
  assert.equal(run.surface, 'cart-drawer')
  assert.equal(run.result.kind, 'better')
  assert.equal(run.result.code, 'AFF15')
  assert.equal(run.result.savingsMinor, 1500)
  assert.equal(await field.inputValue(), '', 'the store clears the field after applying')
  const entry = await page.evaluate(() => window.JaniceEntryTrace)
  assert.deepEqual(entry.values, ['AFF15'], 'the whole coupon goes in at once')
  assert.deepEqual(entry.metadata, [{ data: 'AFF15', inputType: 'insertText' }])
  assert.equal(entry.changes, 1, 'the store receives one completed change')
  assert.match(await inline.locator('.coupon-status').innerText(), /save \$15\.00.*AFF15/i)
  await page.waitForTimeout(40)
  const fieldBox = await field.boundingBox()
  const statusBox = await inline.locator('.coupon-status').boundingBox()
  assert.ok(!(statusBox.x < fieldBox.x + fieldBox.width && statusBox.x + statusBox.width > fieldBox.x && statusBox.y < fieldBox.y + fieldBox.height && statusBox.y + statusBox.height > fieldBox.y), 'the code-entry status does not cover the merchant field')
  const feedback = await page.locator('summary, .cart__total, .fixture-note, .cart-discount-code__message, .cart-discount-code__order-discounts, .cart-discount-code__order-discounts__title').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }))
  const resultButton = await useCode.boundingBox()
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  for (const box of feedback.filter(box => box.width && box.height)) {
    assert.equal(overlaps(statusBox, box), false, 'Janice status leaves native coupon feedback readable')
    assert.equal(overlaps(resultButton, box), false, 'Try again leaves native coupon feedback readable')
  }
  await screenshot(page, field, useCode, 'accepted.png')
  assert.equal(await mutations(), 1, 'Use code operates the native dedicated Apply once')
  assert.deepEqual(await page.evaluate(() => window.JaniceDrawerDemo.record.applyCodes), ['AFF15'])
  assert.equal(await page.evaluate(() => window.JaniceDrawerDemo.cartSnapshot().total_price), 18500)
  assert.equal(await page.locator('janice-coupons-panel').count(), 0, 'the drawer uses compact inline progress')
  assert.equal(await launcher.locator('.card').isVisible(), false)

  await field.fill('SHOPPER')
  await useCode.click()
  await runDone(run.runId)
  assert.equal(await field.inputValue(), 'SHOPPER', 'a different shopper draft is preserved')
  assert.equal(await mutations(), 1, 'an already-applied candidate is not tested again')
})

test('Demo drawer: collapsed and offscreen fields stay quiet; newly revealed fields trigger discovery', async t => {
  const { page, useCode, outline, mutations } = await fixture(t, { query: 'collapsed=1' })
  await page.evaluate(() => {
    const drawer = document.getElementById('shopify-section-cart-drawer')
    drawer.removeAttribute('inert')
    drawer.setAttribute('aria-hidden', 'false')
    document.querySelector('details').open = true
  })
  await page.waitForTimeout(400)
  assert.equal(await useCode.isVisible(), false, 'CSS-rendered offscreen drawer field does not trigger')
  await page.evaluate(() => { document.querySelector('details').open = false; window.JaniceDrawerDemo.open() })
  await page.waitForTimeout(400)
  assert.equal(await useCode.isVisible(), false, 'collapsed discount disclosure does not trigger')
  await page.getByText('Add discount code', { exact: true }).click()
  await useCode.waitFor()
  const field = page.getByLabel('Discount code', { exact: true })
  await followsField(field, outline)
  // Scrolling the merchant's own drawer must move the outline with the field.
  await page.evaluate(() => {
    const drawer = document.getElementById('shopify-section-cart-drawer')
    drawer.style.height = '420px'
    drawer.insertAdjacentHTML('beforeend', '<div style="height:1000px" aria-hidden="true"></div>')
    drawer.scrollTop = 35
  })
  await page.waitForTimeout(250)
  await followsField(field, outline)
  await page.getByRole('button', { name: 'Close cart', exact: true }).click()
  await useCode.waitFor({ state: 'hidden' })
  assert.equal(await mutations(), 0)
})

test('Demo drawer: unrelated fields stay quiet; a later mobile coupon field gets a nearby control and follows replacement', async t => {
  const { page, launcher, inline, outline, useCode, mutations, runDone } = await fixture(t, { query: 'mode=gift', viewport: { width: 390, height: 844 } })
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await page.waitForTimeout(500)
  assert.equal(await useCode.isVisible(), false)
  await page.evaluate(() => window.JaniceDrawerDemo.setMode('search'))
  await page.waitForTimeout(400)
  assert.equal(await useCode.isVisible(), false)
  await page.evaluate(() => window.JaniceDrawerDemo.setMode('coupon'))
  await useCode.waitFor()
  let field = page.getByLabel('Coupon code', { exact: true })
  await followsField(field, outline)
  const box = await useCode.boundingBox()
  assert.ok(box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 845, 'mobile field control fits in the viewport')
  await screenshot(page, field, useCode, 'mobile.png')
  // Discovery is generic; native operations require the verified store input.
  await page.evaluate(() => window.JaniceDrawerDemo.setMode('discount'))
  field = page.getByLabel('Discount code', { exact: true })
  await page.evaluate(() => window.JaniceDrawerDemo.rerender())
  await page.waitForTimeout(300)
  await followsField(field, outline)
  await useCode.click()
  const run = await runDone()
  assert.equal(run.result.kind, 'better', 'the current input is used after a merchant rerender')
  assert.equal(await page.evaluate(() => window.JaniceDrawerDemo.cartSnapshot().total_price), 18500)
  assert.equal(await launcher.locator('.card').isVisible(), false)
  assert.equal(await page.locator('.savings-signal').count(), 0)
  await field.evaluate(input => { input.readOnly = true })
  await useCode.waitFor({ state: 'hidden' })
  assert.equal(await inline.isVisible(), false)
  await field.evaluate(input => { input.readOnly = false; input.disabled = true })
  await page.waitForTimeout(250)
  assert.equal(await useCode.isVisible(), false)
  await page.evaluate(() => window.JaniceDrawerDemo.setMode('promo'))
  await useCode.waitFor()
  const repurposed = await page.evaluate(() => {
    const input = document.querySelector('input[name="promo_code"]')
    let inputEvents = 0
    input.addEventListener('input', () => { inputEvents++ })
    input.name = 'email'
    input.setAttribute('aria-label', 'Email')
    input.placeholder = 'Email'
    document.querySelector('janice-inline-coupon').shadowRoot.querySelector('.use-code').click()
    return { value: input.value, inputEvents }
  })
  assert.deepEqual(repurposed, { value: '', inputEvents: 0 }, 'a field repurposed as contact information is never filled before the debounce')
  await page.evaluate(() => {
    const input = document.querySelector('input[name="email"]')
    input.name = 'promo_code'
    input.removeAttribute('aria-label')
    input.placeholder = 'Promo code'
  })
  await useCode.waitFor()
  const stale = await page.evaluate(() => {
    const input = document.querySelector('input[name="promo_code"]')
    let inputEvents = 0
    input.addEventListener('input', () => { inputEvents++ })
    input.remove()
    // Click before the mutation observer's debounce can replace the target.
    document.querySelector('janice-inline-coupon').shadowRoot.querySelector('.use-code').click()
    return { value: input.value, inputEvents }
  })
  assert.deepEqual(stale, { value: '', inputEvents: 0 }, 'a stale control never writes into a removed merchant field')
  assert.equal(await mutations(), 1, 'stale and repurposed controls never trigger another Apply')
})

test('Demo drawer: without candidate coupons an open discount field makes no savings claim', async t => {
  const { page, useCode, mutations } = await fixture(t, { emptyCandidates: true })
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await page.waitForTimeout(600)
  assert.equal(await useCode.isVisible(), false)
  assert.equal(await mutations(), 0)
})

test('Demo drawer: a serial batch rejects invalid codes and reapplies the lowest verified cart total', async t => {
  const { page, useCode, inline, runDone } = await fixture(t, { codes: ['SAVE20', 'AFF15', 'INVALID'] })
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await useCode.waitFor()
  await useCode.click()
  const run = await runDone()
  assert.deepEqual(run.attempts.map(attempt => [attempt.code, attempt.outcome]), [['SAVE20', 'accepted'], ['AFF15', 'accepted'], ['INVALID', 'rejected']])
  assert.equal(run.result.kind, 'better')
  assert.equal(run.result.code, 'SAVE20')
  assert.equal(run.result.savingsMinor, 2000)
  const state = await page.evaluate(() => ({ cart: window.JaniceDrawerDemo.cartSnapshot(), record: window.JaniceDrawerDemo.record }))
  assert.deepEqual(state.record.applyCodes, ['SAVE20', 'AFF15', 'INVALID', 'SAVE20'])
  assert.deepEqual(state.record.removes, ['SAVE20', 'AFF15'])
  assert.equal(state.record.overlapping, 0, 'native requests are serialized')
  assert.equal(state.record.formSubmits, 0)
  assert.equal(state.cart.total_price, 18000)
  assert.deepEqual(state.cart.discount_codes, [{ code: 'SAVE20', applicable: true }])
  assert.match(await inline.locator('.coupon-status').innerText(), /save \$20\.00.*SAVE20/i)
  assert.equal(await page.locator('janice-coupons-panel').count(), 0)
})

test('Demo drawer: Stop during a pending Apply settles it and restores the original cart state', async t => {
  const { page, useCode, runDone } = await fixture(t, { query: 'delay=700', codes: ['AFF15', 'SAVE20'] })
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await useCode.waitFor()
  await useCode.click()
  await page.waitForFunction(() => window.JaniceDrawerDemo.record.applies === 1 && window.JaniceDrawerDemo.pending)
  await useCode.filter({ hasText: /^Stop$/ }).click()
  const run = await runDone()
  assert.equal(run.result.kind, 'stopped')
  assert.equal(run.result.restoration, 'verified')
  const state = await page.evaluate(() => ({ cart: window.JaniceDrawerDemo.cartSnapshot(), record: window.JaniceDrawerDemo.record }))
  assert.deepEqual(state.record.applyCodes, ['AFF15'], 'no later candidate starts after Stop')
  assert.deepEqual(state.record.removes, ['AFF15'])
  assert.deepEqual(state.cart.discount_codes, [])
  assert.equal(state.cart.total_price, 20000)
  assert.equal(state.record.overlapping, 0)
})

test('Demo drawer: Stop after the code goes in but before Apply leaves Apply unpressed and restores the original field draft', async t => {
  const { page, useCode, runDone } = await fixture(t)
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  await useCode.waitFor()
  // Hold the cart read Janice makes after entering the code and before pressing Apply.
  let release
  const held = new Promise(resolve => { release = resolve })
  await page.route('**/cart.js', async route => {
    const isEntered = await route.request().frame().evaluate(() => document.querySelector('input[name="discount_code"]')?.value === 'AFF15')
    if (isEntered) await held
    await route.fallback()
  })
  await useCode.click()
  await page.waitForFunction(() => document.querySelector('input[name="discount_code"]')?.value === 'AFF15')
  await useCode.filter({ hasText: /^Stop$/ }).click()
  release()
  const run = await runDone()
  assert.equal(run.result.kind, 'stopped')
  assert.equal(run.result.restoration, 'verified')
  const state = await page.evaluate(() => ({ cart: window.JaniceDrawerDemo.cartSnapshot(), record: window.JaniceDrawerDemo.record, field: document.querySelector('input[name="discount_code"]').value }))
  assert.deepEqual(state.record.applyCodes, [], 'Apply is never pressed after Stop')
  assert.equal(state.field, '', 'the original empty field draft is restored')
  assert.deepEqual(state.cart.discount_codes, [])
  assert.equal(state.cart.total_price, 20000)
})
