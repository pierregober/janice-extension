// The content-script entry and the popup, with a stand-in for the chrome.*
// APIs. Browser-level wiring is covered again in tests/e2e with the real
// unpacked extension.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const { read, plain, createDemoCheckout, loadScripts, aff15Candidates, waitUntil } = require('./helpers/demo.js')

function withContentMain(checkout) {
  const sent = []
  let listener = null
  checkout.window.chrome = {
    runtime: {
      id: 'janice-test',
      sendMessage: async message => void sent.push(plain(message)),
      onMessage: { addListener: fn => (listener = fn) },
    },
  }
  loadScripts(checkout.window, ['content/main.js'])
  const ask = message => new Promise(resolve => listener(message, { id: 'janice-test' }, reply => resolve(plain(reply))))
  return { sent, ask }
}

test('content: detection only reads; one run per page; a Demo panel with Stop and the outcome', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000 })
  const { sent, ask } = withContentMain(checkout)
  const { document } = checkout.window

  const detection = await ask({ type: 'janice:detect' })
  assert.deepEqual(detection.store, { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: true, page: 'checkout' })
  assert.equal(detection.supported, true)
  assert.equal(detection.preview.total.amountMinor, 20000)
  assert.equal(document.querySelector('janice-coupons-panel'), null, 'opening the popup shows nothing in the page')
  assert.deepEqual(checkout.demo.record.applies, [])

  const candidates = await aff15Candidates()
  const first = await ask({ type: 'janice:start', candidates })
  const second = await ask({ type: 'janice:start', candidates })
  assert.equal(first.ok, true)
  assert.deepEqual([second.ok, second.reason], [false, 'already-running'])

  const panel = document.querySelector('janice-coupons-panel').shadowRoot
  assert.equal(panel.querySelector('.demo').hidden, false, 'the panel says Demo')
  assert.equal(panel.querySelector('.stop').hidden, false, 'Stop is offered while running')
  assert.equal(panel.querySelector('.working').hidden, false, 'progress is shown while running')
  assert.equal(panel.querySelector('[role="region"]').getAttribute('aria-label'), 'Janice Coupons')

  await waitUntil(() => sent.at(-1)?.run?.status === 'done', 15000)
  assert.equal(sent.at(-1).run.result.kind, 'better')
  assert.ok(sent.every(message => message.type === 'janice:run-update'))
  assert.equal(panel.querySelector('.stop').hidden, true)
  assert.equal(panel.querySelector('.close').hidden, false)
  assert.equal(panel.querySelector('.status').textContent, 'Demo result: You save $15.00 with AFF15')
  assert.match(panel.querySelector('.result').textContent, /AFF15 is applied\. Total \$185\.00, was \$200\.00\./)
  assert.equal(panel.querySelector('.figure').textContent, '$15.00saved', 'the verified savings, large')
  assert.equal(panel.querySelector('.working').hidden, true)
  assert.deepEqual(checkout.demo.record.applies, ['AFF15'])
  assert.deepEqual(checkout.demo.record.forbidden, [])

  panel.querySelector('.close').click()
  assert.equal(document.querySelector('janice-coupons-panel'), null)
})

test('content: Stop from the popup reaches the run', async () => {
  const checkout = createDemoCheckout({ spendMinor: 20000, delayMs: 400 })
  const { sent, ask } = withContentMain(checkout)
  await ask({ type: 'janice:start', candidates: await aff15Candidates() })
  await waitUntil(() => checkout.demo.state.busy, 5000)

  assert.deepEqual(await ask({ type: 'janice:stop' }), { ok: true })
  await waitUntil(() => sent.at(-1)?.run?.status === 'done', 15000)
  assert.equal(sent.at(-1).run.result.kind, 'stopped')
  assert.equal(sent.at(-1).run.result.restoration, 'verified')
  assert.deepEqual(checkout.demo.state.codes, [])
})

// `stored` gives the popup chrome.storage.local, in memory.
function openPopup(responses, { stored = null } = {}) {
  const source = read('extension/popup/popup.html')
  // The popup's own script list, so these tests load exactly what the popup does.
  const scripts = [...source.matchAll(/<script src="([^"]+)"><\/script>/g)].map(([, src]) => path.posix.join('popup', src))
  const dom = new JSDOM(source.replace(/<script src="[^"]+"><\/script>/g, ''), { url: 'http://localhost/popup/popup.html?tab=7', runScripts: 'outside-only' })
  const sent = []
  let onStorage = null
  let settingsOpened = 0
  const local = stored && {
    get: async keys => Object.fromEntries([keys].flat().filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
    async set(items) {
      const changes = {}
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: stored[key], newValue: structuredClone(value) }
        stored[key] = structuredClone(value)
      }
      onStorage?.(changes, 'local')
    },
  }
  dom.window.chrome = {
    runtime: { sendMessage: async message => (sent.push(plain(message)), responses[message.type]?.(message)), openOptionsPage: async () => { settingsOpened++ } },
    tabs: { query: async () => [{ id: 7 }] },
    storage: { ...(local && { local }), onChanged: { addListener: fn => (onStorage = fn) } },
  }
  loadScripts(dom.window, scripts)
  const { document } = dom.window
  const text = id => document.getElementById(id).textContent
  const shown = id => !document.getElementById(id).hidden
  const cards = () =>
    [...document.querySelectorAll('#coupons .coupon')].map(card => ({
      code: card.querySelector('.ticket').textContent,
      offer: card.querySelector('.offer').textContent,
      state: card.querySelector('.coupon-state').textContent,
      kind: card.className.replace('coupon is-', ''),
    }))
  const settle = async count => {
    await waitUntil(() => sent.length === count)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  return { dom, document, sent, text, shown, cards, settle, stored, settingsOpened: () => settingsOpened, pushRun: run => onStorage({ 'run:7': { newValue: run } }, 'session') }
}

const CHECKOUT = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'checkout' }
const TOTAL = { amountMinor: 31998, currency: 'USD', basis: 'order-total', shippingIncluded: false, taxIncluded: false }
const AFF15 = {
  code: 'AFF15',
  offerText: 'Receive $15 Off Your Order when You Spend $150 or More.',
  advertisedDiscount: { type: 'fixed-order-discount', amountMinor: 1500, currency: 'USD' },
  advertisedMinimumSpend: { amountMinor: 15000, currency: 'USD', inclusive: true, basis: null },
}
const ready = run => ({
  ok: true,
  detection: { store: CHECKOUT, supported: true, preview: { total: TOTAL, codes: [] }, run },
  candidates: [AFF15],
  providerError: null,
  run,
})
const finished = (attempts, result) => ({ runId: 'r9', store: CHECKOUT, status: 'done', baseline: { total: TOTAL, codes: [] }, attempts, result })

test('popup: shows the store, the coupon and Try coupons, and changes nothing before the click', async () => {
  const popup = openPopup({
    'janice:inspect': () => ready(null),
    'janice:try': () => ({
      ok: true,
      run: { runId: 'r1', store: CHECKOUT, status: 'running', phase: 'testing', progress: { index: 1, count: 1, code: 'AFF15' }, message: 'Trying AFF15 (1 of 1)…', baseline: { total: TOTAL, codes: [] }, attempts: [] },
    }),
  })
  await popup.settle(1)

  assert.equal(popup.text('store-name'), 'Sharper Image')
  assert.equal(popup.text('store-meta'), 'Checkout · total $319.98')
  assert.equal(popup.text('count'), '1 coupon')
  assert.equal(popup.text('status'), 'Ready to try 1 coupon')
  assert.match(popup.text('sub'), /keeps it only if your total goes down/)
  assert.deepEqual(popup.cards(), [{ code: 'AFF15', offer: '$15 off orders of $150 or more', state: 'Advertised · not tried yet', kind: 'idle' }])
  assert.equal(popup.text('hint'), 'Nothing changes until you click Try coupons.')
  assert.equal(popup.text('try'), 'Try coupons')
  assert.equal(popup.shown('try'), true)
  assert.equal(popup.shown('demo'), false)
  assert.equal(popup.document.querySelector('#logo img') !== null, true, 'the Janice favicon is shown')
  assert.deepEqual(popup.sent.map(message => message.type), ['janice:inspect'])

  popup.document.getElementById('try').click()
  await popup.settle(2)
  assert.deepEqual(popup.sent[1], { type: 'janice:try', tabId: 7 })
  assert.equal(popup.text('kicker'), 'Testing coupons')
  assert.equal(popup.text('status'), 'Trying AFF15 (1 of 1)…')
  const bar = popup.document.getElementById('progress')
  assert.equal(bar.tagName, 'PROGRESS', 'a native progress bar')
  assert.equal(bar.getAttribute('aria-valuetext'), 'Trying code 1 of 1')
  assert.equal(bar.position, 0.5, 'halfway through the one code')
  assert.equal(popup.cards()[0].state, 'Trying in your checkout…')
  assert.match(popup.text('details'), /Before testing: no code · total \$319\.98/)
  assert.equal(popup.shown('stop'), true)
  assert.equal(popup.shown('try'), false)

  popup.pushRun(
    finished([{ code: 'AFF15', outcome: 'accepted', total: { ...TOTAL, amountMinor: 30498 } }], {
      kind: 'better',
      code: 'AFF15',
      codes: ['AFF15'],
      baselineTotal: TOTAL,
      finalTotal: { ...TOTAL, amountMinor: 30498 },
      savingsMinor: 1500,
      restoration: 'not-needed',
    }),
  )
  assert.equal(popup.text('status'), 'You save $15.00 with AFF15')
  assert.equal(popup.text('figure'), '$15.00saved')
  assert.equal(popup.text('store-meta'), 'Checkout · total $304.98 with AFF15')
  assert.equal(popup.shown('count'), false, 'the count belongs to the screens that offer coupons')
  assert.deepEqual(popup.cards().map(card => [card.state, card.kind]), [['Applied · saves $15.00', 'applied']])
  assert.match(popup.text('details'), /Compared on the order total before shipping and taxes are calculated\./)
  assert.equal(popup.text('try'), 'Try coupons again')
  assert.equal(popup.shown('stop'), false)
})

test('popup: away from checkout, on other sites and on unreadable pages it explains and offers no Try', async () => {
  const cases = [
    [{ ok: true, detection: { store: { ...CHECKOUT, page: 'store' }, supported: false, reason: 'not-checkout', run: null }, candidates: [AFF15], run: null }, /Go to checkout/],
    [{ ok: true, detection: { store: null, run: null }, candidates: [], run: null }, /not a supported store/],
    [{ ok: false, reason: 'no-access', run: null }, /can't read this page/],
    [{ ok: true, detection: { store: CHECKOUT, supported: false, reason: 'no-discount-field', run: null }, candidates: [AFF15], run: null }, /discount code field wasn't found\. Nothing was changed\./],
  ]
  const views = []
  for (const [inspection, expected] of cases) {
    const popup = openPopup({ 'janice:inspect': () => inspection })
    await popup.settle(1)
    assert.match(popup.text('status'), expected)
    assert.equal(popup.shown('try'), false)
    views.push(popup)
  }
  const [storePage, otherSite] = views
  assert.deepEqual(storePage.cards().map(card => card.code), ['AFF15'], 'the store page lists its coupons')
  assert.equal(otherSite.shown('shop'), true)
  assert.equal(otherSite.document.getElementById('shop').getAttribute('href'), 'https://sharperimage.com/')
  assert.equal(otherSite.shown('store'), false)
})

test('popup: reopening during a run shows its progress and Stop; a Demo run says Demo', async () => {
  const run = { runId: 'r2', store: { ...CHECKOUT, isDemo: true }, status: 'running', phase: 'checking', message: 'Reading your checkout…', baseline: { total: TOTAL, codes: [] }, attempts: [] }
  const popup = openPopup({
    'janice:inspect': () => ({ ok: true, detection: { store: { ...CHECKOUT, isDemo: true }, supported: true, preview: null, run }, candidates: [AFF15], run }),
    'janice:stop': () => ({ ok: true }),
  })
  await popup.settle(1)
  assert.equal(popup.shown('demo'), true)
  assert.equal(popup.text('kicker'), 'Getting ready')
  assert.equal(popup.text('status'), 'Reading your checkout…')
  assert.equal(popup.document.getElementById('progress').hasAttribute('value'), false, 'no value: indeterminate')
  assert.match(popup.text('details'), /Before testing: no code · total \$319\.98/)
  assert.equal(popup.cards()[0].state, 'Up next')
  assert.equal(popup.shown('stop'), true)

  popup.document.getElementById('stop').click()
  await popup.settle(2)
  assert.deepEqual(popup.sent[1], { type: 'janice:stop', tabId: 7 })
  assert.equal(popup.document.getElementById('stop').disabled, true)
})

test('popup: each coupon card says what happened to its code', async () => {
  const rejected = { code: 'AFF15', outcome: 'rejected', storeMessage: 'Enter a valid discount code or gift card' }
  const restored = { restoration: 'verified', codes: [], finalTotal: TOTAL }
  const cases = [
    [finished([rejected], { kind: 'rejected', ...restored }), 'Code not accepted', ['Not accepted', 'rejected']],
    [finished([{ code: 'AFF15', outcome: 'accepted', total: TOTAL }], { kind: 'no-improvement', ...restored }), 'No better price found', ['Accepted ($319.98), then removed', 'accepted']],
    [finished([], { kind: 'no-improvement', reason: 'already-applied', codes: ['AFF15'], finalTotal: TOTAL, restoration: 'not-needed' }), 'Already using the available code', ['Already applied', 'applied']],
    [{ ...finished([], { kind: 'interrupted', reason: 'page-changed', restoration: 'unverified' }), progress: { index: 1, count: 1, code: 'AFF15' } }, 'Testing was interrupted', ['May still be applied', 'unverified']],
    [finished([], { kind: 'cart-changed', reason: 'cart-changed', restoration: 'skipped' }), 'Testing stopped: checkout changed', ['Result discarded', 'idle']],
  ]
  for (const [run, title, card] of cases) {
    const popup = openPopup({ 'janice:inspect': () => ready(run) })
    await popup.settle(1)
    assert.equal(popup.text('status'), title)
    assert.deepEqual([popup.cards()[0].state, popup.cards()[0].kind], card, title)
    assert.notEqual(popup.document.querySelector('#figure svg'), null, `${title}: an icon, not a savings amount`)
  }
})

test('popup: Copy puts the code on the clipboard and says so', async () => {
  const popup = openPopup({ 'janice:inspect': () => ready(null) })
  await popup.settle(1)
  const copied = []
  Object.defineProperty(popup.dom.window.navigator, 'clipboard', { value: { writeText: async text => void copied.push(text) } })

  const copy = popup.document.querySelector('#coupons .copy')
  assert.equal(copy.getAttribute('aria-label'), 'Copy code AFF15')
  copy.click()
  await waitUntil(() => popup.text('announce') !== '')
  assert.deepEqual(copied, ['AFF15'])
  assert.equal(popup.text('announce'), 'Copied AFF15.')
  assert.deepEqual(popup.sent.map(message => message.type), ['janice:inspect'], 'copying changes nothing in the checkout')
})

test('popup reopened mid-batch learns later attempts for its retry draft', async () => {
  const active = { runId: 'batch', store: CHECKOUT, status: 'running', phase: 'testing', progress: { code: 'AFF15', index: 1, count: 3 }, attempts: [] }
  const popup = openPopup({ 'janice:inspect': () => ready(active) })
  await popup.settle(1)
  assert.equal(popup.document.getElementById('additional-codes').value, '')
  popup.pushRun(finished(['AFF15', 'SAVE20', 'NOPE'].map(code => ({ code, outcome: 'rejected' })), { kind: 'rejected', restoration: 'not-needed', codes: [] }))
  assert.equal(popup.document.getElementById('additional-codes').value, 'SAVE20\nNOPE')
  assert.deepEqual(popup.cards().map(card => card.code), ['AFF15', 'SAVE20', 'NOPE'])
})

test('popup: says when the page button is snoozed on this store, Show it again brings it back, and the gear opens settings', async () => {
  const snoozed = { until: null, stores: [{ id: 'sharper-image-us', name: 'Sharper Image' }] }
  const popup = openPopup({ 'janice:inspect': () => ready(null) }, { stored: { 'launcher:snooze': snoozed } })
  await popup.settle(1)
  await waitUntil(() => popup.shown('snoozed'))
  assert.equal(popup.text('snoozed-text'), 'The page button is snoozed on Sharper Image.')
  assert.equal(popup.text('status'), 'Ready to try 1 coupon', 'the popup works as usual')

  popup.document.getElementById('wake').click()
  await waitUntil(() => !popup.shown('snoozed'))
  assert.deepEqual(popup.stored['launcher:snooze'], { until: null, stores: [] })
  assert.equal(popup.text('announce'), 'The page button is back.')

  // Snoozed on every store, from another tab while the popup is open.
  const until = Date.now() + 60 * 60 * 1000
  await popup.dom.window.Janice.snooze.snoozeEverywhere(popup.dom.window.chrome.storage.local, until - 24 * 60 * 60 * 1000)
  await waitUntil(() => popup.shown('snoozed'))
  assert.match(popup.text('snoozed-text'), /^The page button is snoozed until \w{3} \d{1,2}:\d{2} (AM|PM)\.$/)

  popup.document.getElementById('settings').click()
  await waitUntil(() => popup.settingsOpened() === 1)
  assert.equal(popup.document.getElementById('settings').getAttribute('aria-label'), 'Settings')
  assert.deepEqual(popup.sent.map(message => message.type), ['janice:inspect'], 'none of this asks the page anything')
})

test('popup: no snooze notice when the page button shows, or away from a store', async () => {
  const popup = openPopup({ 'janice:inspect': () => ready(null) }, { stored: {} })
  await popup.settle(1)
  assert.equal(popup.shown('snoozed'), false)
  const elsewhere = openPopup({ 'janice:inspect': () => ({ ok: true, detection: { store: null }, candidates: [], providerError: null, run: null }) }, { stored: { 'launcher:snooze': { until: Date.now() + 1000, stores: [] } } })
  await elsewhere.settle(1)
  assert.equal(elsewhere.shown('snoozed'), false)
})
