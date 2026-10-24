// The page button's gear menu: Hide on this page, Snooze for 24 hours, Snooze on this site (shared/snooze.js)
// and Go to settings. jsdom has no popovers, so these tests choose the menu's buttons directly;
// tests/e2e/launcher-menu.test.js opens the menu in Chromium.
const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

const { read, plain, loadScripts, waitUntil } = require('./helpers/demo.js')
const snooze = require('../extension/shared/snooze.js')

const LAUNCHER_SCRIPTS = JSON.parse(read('extension/manifest.json')).content_scripts[0].js
const DAY = 24 * 60 * 60 * 1000
const PRODUCT = 'https://sharperimage.com/products/ionic-comfort-quadra-air-purifier'
const PRODUCT_HEAD = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Ionic Comfort Quadra Air Purifier","offers":{"@type":"Offer","price":"419.99","priceCurrency":"USD"}}</script>'
const SHARPER_IMAGE = { id: 'sharper-image-us', name: 'Sharper Image' }
const inspection = () => ({
  ok: true,
  detection: { store: { ...SHARPER_IMAGE, currency: 'USD', isDemo: false, page: 'store' }, supported: false, reason: 'not-checkout', run: null },
  candidates: [{ code: 'AFF15' }],
  providerError: null,
  run: null,
})

/** chrome.storage.local in memory, shared by the pages given it, which hear its changes as tabs do. */
function sharedStorage(entries = {}) {
  const stored = structuredClone(entries)
  const listeners = new Set()
  return {
    stored,
    local: {
      get: async keys => Object.fromEntries([keys].flat().filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
      async set(items) {
        const changes = {}
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: stored[key], newValue: structuredClone(value) }
          stored[key] = structuredClone(value)
        }
        for (const listener of listeners) listener(structuredClone(changes), 'local')
      },
    },
    onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
  }
}

/** A Sharper Image page with the page button, as the manifest loads it. */
async function openPage(t, storage, { url = PRODUCT, body = '<main><h1>Sharper Image</h1></main>', setup = () => {} } = {}) {
  const { window } = new JSDOM(`<!doctype html><html lang="en-US"><head>${url === PRODUCT ? PRODUCT_HEAD : ''}</head><body>${body}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true })
  t.after(() => window.close())
  const sent = []
  window.chrome = {
    runtime: { id: 'janice-test', sendMessage: async message => (sent.push(plain(message)), message.type === 'janice:inspect' ? inspection() : { ok: true }) },
    storage: { local: storage.local, onChanged: storage.onChanged },
  }
  setup(window)
  loadScripts(window, LAUNCHER_SCRIPTS)
  const host = window.document.querySelector('janice-coupons-launcher')
  // The button is hidden while its kept spot and snooze are read.
  await waitUntil(() => host.style.getPropertyValue('visibility') === '')
  const $ = selector => host.shadowRoot.querySelector(selector)
  return {
    window,
    $,
    sent,
    isShown: () => host.style.getPropertyValue('display') === 'block',
    /** Opens the card, as a click on the tab does, and picks a menu button. */
    choose(action) {
      if ($('.card').hidden) $('.tab').click()
      $(`.menu-item[data-action="${action}"]`).click()
    },
  }
}

test('snooze: every store for 24 hours, or one store until it is turned back on', async () => {
  const storage = sharedStorage()
  const now = Date.parse('2026-10-24T12:00:00Z')
  assert.equal(snooze.hiddenBy(undefined, SHARPER_IMAGE.id, now), null)

  await snooze.snoozeEverywhere(storage.local, now)
  assert.deepEqual(storage.stored[snooze.KEY], { until: now + DAY, stores: [] })
  assert.equal(snooze.hiddenBy(storage.stored[snooze.KEY], SHARPER_IMAGE.id, now + DAY - 1), 'everywhere')
  assert.equal(snooze.hiddenBy(storage.stored[snooze.KEY], SHARPER_IMAGE.id, now + DAY), null, 'over after 24 hours')

  await snooze.snoozeStore(storage.local, { ...SHARPER_IMAGE, currency: 'USD', page: 'store' })
  await snooze.snoozeStore(storage.local, SHARPER_IMAGE)
  assert.deepEqual(storage.stored[snooze.KEY].stores, [SHARPER_IMAGE], 'once per store, with its name for the settings page')
  assert.equal(snooze.hiddenBy(storage.stored[snooze.KEY], SHARPER_IMAGE.id, now + 30 * DAY), 'store', 'until turned back on')
  assert.equal(snooze.hiddenBy(storage.stored[snooze.KEY], 'another-store', now + 30 * DAY), null)

  await snooze.wake(storage.local, { storeId: SHARPER_IMAGE.id })
  assert.deepEqual(storage.stored[snooze.KEY], { until: now + DAY, stores: [] })
  await snooze.wake(storage.local, { everywhere: true })
  assert.deepEqual(storage.stored[snooze.KEY], { until: null, stores: [] })
  assert.deepEqual(snooze.normalize({ until: 'soon', stores: [{ id: 1 }, null, { id: 'a', name: 'A' }] }), { until: null, stores: [{ id: 'a', name: 'A' }] }, 'malformed entries are ignored')
})

test('gear menu: the gear opens a popover of four plain buttons, on every page with the button', async t => {
  for (const url of [PRODUCT, 'https://sharperimage.com/']) {
    const { $ } = await openPage(t, sharedStorage(), { url })
    assert.equal($('.gear').hidden, false, url)
    assert.equal($('.gear').getAttribute('popovertarget'), 'menu')
    assert.equal($('.gear').getAttribute('aria-label'), 'Settings')
    assert.equal($('.gear').getAttribute('aria-expanded'), 'false')
    assert.equal($('#menu').getAttribute('popover'), '', 'an auto popover: it closes on a click outside or Escape')
    assert.deepEqual([...$('#menu').querySelectorAll('button')].map(button => [button.textContent.trim(), button.hidden]), [
      ['Hide on this page', false],
      ['Snooze for 24 hours', false],
      ['Snooze on this site', false],
      ['Go to settings', false],
    ])
    assert.equal($('#menu').getAttribute('role'), null, 'a group of buttons, not an ARIA menu')
  }
})

test('Hide on this page: the button leaves this page only, and nothing is kept', async t => {
  const storage = sharedStorage()
  const page = await openPage(t, storage)
  assert.equal(page.isShown(), true)
  page.choose('hide-page')
  assert.equal(page.isShown(), false)
  assert.equal(page.$('.card').hidden, true)
  assert.equal(storage.stored[snooze.KEY], undefined, 'nothing kept')

  const next = await openPage(t, storage)
  assert.equal(next.isShown(), true, 'the next page shows it again')
})

test('Snooze for 24 hours: hidden on every store and in other tabs, and no price is kept while snoozed', async t => {
  const storage = sharedStorage()
  const page = await openPage(t, storage)
  const other = await openPage(t, storage, { url: 'https://sharperimage.com/collections/air-purifiers' })
  await waitUntil(() => storage.stored['tips:prices'], 'the product page keeps its price as usual')

  const before = Date.now()
  page.choose('snooze-day')
  assert.equal(page.isShown(), false)
  await waitUntil(() => storage.stored[snooze.KEY])
  const { until, stores } = storage.stored[snooze.KEY]
  assert.ok(until >= before + DAY && until <= Date.now() + DAY, '24 hours from now')
  assert.deepEqual(stores, [])
  assert.equal(other.isShown(), false, 'the other tab follows')

  delete storage.stored['tips:prices']
  const next = await openPage(t, storage)
  assert.equal(next.isShown(), false, 'still snoozed on the next page')
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(storage.stored['tips:prices'], undefined, 'no price kept while snoozed')

  // Turned back on, from the popup or the settings page: open pages show the button again, and the price is kept.
  await snooze.wake(storage.local, { everywhere: true })
  assert.deepEqual([page.isShown(), other.isShown(), next.isShown()], [true, true, true])
  await waitUntil(() => storage.stored['tips:prices']?.['ionic-comfort-quadra-air-purifier'])
})

test('Snooze on this site: hidden on this store until turned back on; Go to settings asks for the settings page', async t => {
  const storage = sharedStorage()
  const page = await openPage(t, storage)
  page.choose('snooze-site')
  assert.equal(page.isShown(), false)
  await waitUntil(() => storage.stored[snooze.KEY])
  assert.deepEqual(storage.stored[snooze.KEY], { until: null, stores: [SHARPER_IMAGE] })

  const next = await openPage(t, storage, { url: 'https://sharperimage.com/' })
  assert.equal(next.isShown(), false)
  await snooze.wake(storage.local, { storeId: SHARPER_IMAGE.id })
  assert.equal(next.isShown(), true)

  next.choose('settings')
  await waitUntil(() => next.sent.some(message => message.type === 'janice:open-settings'))
  assert.equal(next.$('.card').hidden, true, 'the card closes as the settings open')
  assert.equal(next.isShown(), true)
})

test('snoozed: no Use code control on a cart drawer either, and nothing is asked, until the button is back', async t => {
  const storage = sharedStorage({ [snooze.KEY]: { until: null, stores: [SHARPER_IMAGE] } })
  const drawer = '<section id="shopify-section-cart-drawer"><form><input name="discount_code"><button type="submit">Apply</button></form></section>'
  const page = await openPage(t, storage, {
    url: 'https://sharperimage.com/collections/air-purifiers',
    body: drawer,
    setup(window) {
      window.HTMLElement.prototype.showPopover = () => {}
      window.HTMLElement.prototype.hidePopover = () => {}
      window.document.querySelector('input').getBoundingClientRect = () => ({ x: 100, y: 200, left: 100, top: 200, right: 340, bottom: 240, width: 240, height: 40 })
    },
  })
  const control = () => page.window.document.querySelector('janice-inline-coupon')
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(page.isShown(), false)
  assert.equal(control()?.hidden ?? true, true, 'no Use code control')
  assert.deepEqual(page.sent, [], 'nothing asked while snoozed')

  await snooze.wake(storage.local, { storeId: SHARPER_IMAGE.id })
  await waitUntil(() => control() && !control().hidden)
  assert.equal(page.isShown(), true)
})

test('menu open: the hovered card stays open and Escape leaves it; closing hands focus back; placed by hand without anchor positioning', async t => {
  const page = await openPage(t, sharedStorage(), { url: 'https://sharperimage.com/' })
  const { window, $ } = page
  // As in Chrome before 129, which has popovers but no position-area.
  Object.defineProperty(window, 'CSS', { value: { supports: () => false }, configurable: true })
  const toggle = newState => $('#menu').dispatchEvent(Object.assign(new window.Event('beforetoggle'), { newState }))
  const escape = target => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))

  $('.tab').dispatchEvent(new window.PointerEvent('pointerenter', { pointerType: 'mouse' }))
  assert.equal($('.card').hidden, false)
  $('.gear').getBoundingClientRect = () => ({ x: 966, y: 400, left: 966, top: 400, right: 1000, bottom: 434, width: 34, height: 34 })
  toggle('open')
  assert.equal($('.gear').getAttribute('aria-expanded'), 'true')
  assert.deepEqual([$('#menu').style.top, $('#menu').style.right], ['440px', `${window.innerWidth - 1000}px`], 'under the gear, lined up with its right edge')

  $('.card').dispatchEvent(new window.PointerEvent('pointerleave'))
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.equal($('.card').hidden, false, 'the card stays when the pointer leaves')
  $('.menu-item').focus()
  escape($('.menu-item'))
  assert.equal($('.card').hidden, false, 'Escape closes the menu (the popover does), not the card')

  toggle('closed')
  assert.equal($('.gear').getAttribute('aria-expanded'), 'false')
  assert.equal($('.gear').getRootNode().activeElement, $('.gear'), 'focus goes back to the gear')
  escape($('.gear'))
  assert.equal($('.card').hidden, true, 'with the menu closed, Escape closes the card')
})
