// The page button: the scripts the manifest runs on sharperimage.com, with a
// stand-in for the service worker. The browser tests drive it again in
// Chromium on the Demo checkout.
const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

const { read, plain, loadScripts, createDemoCheckout, aff15Candidates, waitUntil } = require('./helpers/demo.js')

const LAUNCHER_SCRIPTS = JSON.parse(read('extension/manifest.json')).content_scripts[0].js
const STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false }
const usd = amountMinor => ({ amountMinor, currency: 'USD', basis: 'order-total', shippingIncluded: false, taxIncluded: false })

// The candidates as the service worker's inspect hands them out.
const summaries = async () =>
  (await aff15Candidates()).map(({ code, offerText, advertisedDiscount, advertisedMinimumSpend }) => ({ code, offerText, advertisedDiscount, advertisedMinimumSpend }))

async function checkoutInspection(patch = {}) {
  return {
    ok: true,
    detection: { store: { ...STORE, page: 'checkout' }, supported: true, reason: null, preview: { total: usd(15999), codes: [] }, run: null },
    candidates: await summaries(),
    providerError: null,
    run: null,
    ...patch,
  }
}

/** A page at url with the page button's scripts; replies answer its messages by type. */
function openPage(url, replies = {}) {
  const dom = new JSDOM('<!doctype html><html lang="en-US"><body><main><h1>Sharper Image</h1></main></body></html>', {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  const sent = []
  window.chrome = {
    runtime: {
      id: 'janice-test',
      sendMessage: async message => {
        sent.push(plain(message))
        return replies[message.type]?.(message)
      },
    },
  }
  loadScripts(window, LAUNCHER_SCRIPTS)
  return { window, sent, ...launcherParts(window) }
}

function launcherParts(window) {
  const host = () => window.document.querySelector('janice-coupons-launcher')
  const $ = selector => host().shadowRoot.querySelector(selector)
  const text = selector => $(selector).textContent.replace(/\s+/g, ' ').trim()
  const hover = () => $('.tab').dispatchEvent(new window.PointerEvent('pointerenter', { pointerType: 'mouse' }))
  const leave = () => $('.tab').dispatchEvent(new window.PointerEvent('pointerleave', { pointerType: 'mouse' }))
  const isShown = selector => !$(selector).hidden
  return { host, $, text, hover, leave, isShown }
}

test('page button: a tab on store pages that reads nothing until hovered; its card counts the coupons and links to the checkout', async () => {
  const inspection = { ...(await checkoutInspection()), detection: { store: { ...STORE, page: 'store' }, supported: false, reason: 'not-checkout', run: null } }
  const page = openPage('https://sharperimage.com/products/glass-topper-cocktail-smoker-set', { 'janice:inspect': () => inspection })
  const { window, sent, host, $, text, hover, leave, isShown } = page

  assert.ok(host(), 'the button is on the page')
  assert.deepEqual([...window.document.body.children].map(child => child.localName), ['main', 'janice-coupons-launcher'], 'nothing else is added')
  assert.equal(host().style.getPropertyValue('position'), 'fixed')
  assert.equal($('.tab').getAttribute('aria-label'), 'Janice Coupons')
  assert.equal($('.tab').getAttribute('aria-expanded'), 'false')
  assert.equal(isShown('.card'), false, 'the card never opens by itself')
  assert.deepEqual(sent, [], 'nothing is asked before the shopper opens it')

  hover()
  assert.equal(isShown('.card'), true)
  assert.equal($('.tab').getAttribute('aria-expanded'), 'true')
  await waitUntil(() => text('.heading') === '1 coupon found')
  assert.deepEqual(sent, [{ type: 'janice:inspect' }], 'one read-only request, for its own tab')
  assert.equal(text('.sub'), 'for Sharper Image')
  assert.equal(text('.store'), 'SI')
  assert.equal(text('.coupon .ticket'), 'AFF15')
  assert.equal(text('.coupon .offer'), '$15 off orders of $150 or more')
  assert.equal(text('.text'), 'Janice tries it for you at checkout and keeps it only if your total goes down.')
  assert.equal(isShown('.go'), true)
  assert.equal($('.go').getAttribute('href'), 'https://sharperimage.com/checkout')
  assert.equal(isShown('.try'), false, 'coupons are only tried at checkout')
  assert.equal(isShown('.demo'), false)
  assert.equal(text('.fine'), 'Never touches payment details or places orders.')
  assert.equal($('.tab').getAttribute('aria-label'), 'Janice Coupons: 1 coupon found')

  leave()
  await waitUntil(() => !isShown('.card'), 2000)
  assert.equal($('.tab').getAttribute('aria-expanded'), 'false')
})

test('page button at checkout: Try coupons in its card runs Janice; the button steps aside for the panel and shows the result after Close', async () => {
  const candidates = await aff15Candidates()
  const checkout = createDemoCheckout({ spendMinor: 20000 }, { preload: LAUNCHER_SCRIPTS })
  const { window } = checkout
  const parts = launcherParts(window)
  const { host, $, text, isShown } = parts

  // The service worker's part: inspect and start through main.js, as for the popup.
  let content = null
  const sent = []
  const ask = message => new Promise(resolve => content(message, { id: 'janice-test' }, resolve))
  window.chrome = {
    runtime: {
      id: 'janice-test',
      onMessage: { addListener: listener => (content = listener) },
      sendMessage: async message => {
        sent.push(message.type)
        if (message.type === 'janice:inspect') {
          const detection = await ask({ type: 'janice:detect' })
          return { ok: true, detection, candidates: await summaries(), providerError: null, run: detection.run }
        }
        if (message.type === 'janice:try') return ask({ type: 'janice:start', candidates })
        return { ok: true }
      },
    },
  }
  loadScripts(window, ['content/main.js'])

  assert.ok(host(), 'the button is on the Demo checkout')
  $('.tab').click()
  await waitUntil(() => text('.heading') === '1 coupon found')
  assert.equal(isShown('.demo'), true, 'the card says Demo')
  assert.equal(text('.text'), 'Janice tries it in your checkout and keeps it only if your total goes down.')
  assert.equal(text('.try'), 'Try coupons')
  assert.ok($('.try').classList.contains('primary'))
  assert.equal(isShown('.go'), false)
  assert.deepEqual(checkout.demo.record.applies, [], 'opening the card changes nothing on the checkout')
  assert.equal(window.document.querySelector('janice-coupons-panel'), null)

  $('.try').click()
  assert.equal(text('.try'), 'Starting…')
  assert.equal($('.try').disabled, true)
  await waitUntil(() => Boolean(window.document.querySelector('janice-coupons-panel')))
  await waitUntil(() => host().style.getPropertyValue('display') === 'none')
  assert.equal(isShown('.card'), false)

  const panel = window.document.querySelector('janice-coupons-panel').shadowRoot
  await waitUntil(() => !panel.querySelector('.close').hidden, 15000)
  assert.equal(panel.querySelector('.status').textContent, 'Demo result: You save $15.00 with AFF15')
  assert.deepEqual(checkout.demo.record.applies, ['AFF15'])
  assert.deepEqual(checkout.demo.record.forbidden, [])

  panel.querySelector('.close').click()
  await waitUntil(() => host().style.getPropertyValue('display') === 'block')
  $('.tab').click()
  await waitUntil(() => text('.heading') === 'You save $15.00 with AFF15')
  assert.ok($('.card').classList.contains('tone-success'))
  assert.equal(text('.sub'), '1 coupon found for Sharper Image')
  assert.equal(text('.try'), 'Try coupons again')
  assert.ok($('.try').classList.contains('secondary'))
  assert.deepEqual(
    sent.filter(type => type !== 'janice:run-update'),
    ['janice:inspect', 'janice:try', 'janice:inspect'],
  )
})

test('page button at checkout: what it says when it cannot offer Try coupons', async () => {
  const cases = [
    [{ detection: { store: { ...STORE, page: 'checkout' }, supported: false, reason: 'unrestorable-reduction', run: null } }, '1 coupon found', /gift card or another reduction.*Nothing was changed\./],
    [{ candidates: [] }, 'No coupons found yet', /^Janice has no codes for Sharper Image right now\.$/],
    [{ providerError: 'coupon data request failed (404)' }, "Couldn't load coupons", /^coupon data request failed \(404\)\. Nothing was changed\.$/],
    [{ ok: false, reason: 'error' }, "Janice can't read this page", /^Reload the page, then open Janice again\.$/],
  ]
  for (const [patch, heading, detail] of cases) {
    const inspection = await checkoutInspection(patch)
    const { $, text, isShown } = openPage('https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us', { 'janice:inspect': () => inspection })
    $('.tab').click()
    await waitUntil(() => text('.heading') === heading)
    assert.match(text('.text'), detail, heading)
    assert.equal(isShown('.try'), false, `${heading}: no Try coupons`)
    assert.equal(isShown('.go'), false, `${heading}: no checkout link`)
  }
})

test('page button: a refused start says why; Escape closes the card and returns focus to the button', async () => {
  const inspection = await checkoutInspection()
  const { window, $, text, isShown } = openPage('https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us', {
    'janice:inspect': () => inspection,
    'janice:try': () => ({ ok: false, reason: 'already-running' }),
  })
  $('.tab').focus()
  $('.tab').click()
  await waitUntil(() => text('.try') === 'Try coupons')
  $('.try').click()
  await waitUntil(() => isShown('.note'))
  assert.equal(text('.note'), 'A run is already in progress on this tab.')
  assert.equal(text('.announce'), 'A run is already in progress on this tab.')
  assert.equal(text('.try'), 'Try coupons')

  $('.try').focus()
  $('.try').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
  assert.equal(isShown('.card'), false)
  assert.equal($('.tab').getRootNode().activeElement, $('.tab'), 'focus is back on the button')
})

test('page button: a click keeps the card open until it is closed, and Copy puts the code on the clipboard', async () => {
  const inspection = await checkoutInspection()
  const { window, $, text, leave, isShown } = openPage('https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us', { 'janice:inspect': () => inspection })
  const copied = []
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async code => void copied.push(code) } })

  $('.tab').click()
  await waitUntil(() => text('.heading') === '1 coupon found')
  leave()
  await new Promise(resolve => setTimeout(resolve, 450))
  assert.equal(isShown('.card'), true, 'opened by a click, it stays open when the pointer leaves')

  $('.copy').click()
  await waitUntil(() => text('.copy') === 'Copied')
  assert.deepEqual(copied, ['AFF15'])
  assert.equal(text('.announce'), 'Copied AFF15.')
  assert.equal($('.copy').getAttribute('aria-label'), 'Copy code AFF15')

  window.document.querySelector('main').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, composed: true }))
  assert.equal(isShown('.card'), false, 'a click elsewhere on the page closes it')
  $('.tab').click()
  assert.equal(isShown('.card'), true)
  $('.close').click()
  assert.equal(isShown('.card'), false)
})

test('page button: only on the store, and only once per page', () => {
  const other = new JSDOM('<!doctype html><body></body>', { url: 'https://example.com/checkouts/cn/x', runScripts: 'outside-only' })
  other.window.chrome = { runtime: { id: 'janice-test', sendMessage: async () => {} } }
  loadScripts(other.window, LAUNCHER_SCRIPTS)
  assert.equal(other.window.document.querySelector('janice-coupons-launcher'), null)

  const { window } = openPage('https://sharperimage.com/')
  loadScripts(window, LAUNCHER_SCRIPTS)
  assert.equal(window.document.querySelectorAll('janice-coupons-launcher').length, 1)
})
