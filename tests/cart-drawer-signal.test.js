const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { read, plain, loadScripts, waitUntil } = require('./helpers/demo.js')

const STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'store' }
const available = () => ({
  ok: true,
  detection: { store: STORE, supported: false, reason: 'not-checkout', run: null },
  candidates: [{ code: 'AFF15' }],
  providerError: null,
  run: null,
})

// Keep provider inspection pending while the page or launcher lifecycle
// changes. Loading without launcher-main lets this test destroy the instance.
function drawer(t) {
  const dom = new JSDOM('<!doctype html><body><section id="shopify-section-cart-drawer"><form><input name="discount_code"><button type="submit">Apply</button></form></section></body>', {
    url: 'https://sharperimage.com/products/example', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  t.after(() => dom.window.close())
  const { window } = dom
  const requests = []
  let shown = 0
  window.HTMLElement.prototype.showPopover = () => { shown++ }
  window.HTMLElement.prototype.hidePopover = () => {}
  let checkoutMutations = 0
  window.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); checkoutMutations++ })
  window.document.querySelector('button').addEventListener('click', () => { checkoutMutations++ })
  const input = window.document.querySelector('input')
  input.getBoundingClientRect = () => ({ x: 100, y: 200, left: 100, top: 200, right: 340, bottom: 240, width: 240, height: 40 })
  Object.defineProperty(input, 'value', { get() { throw new Error('store field value must not be read') } })
  window.chrome = { runtime: { sendMessage: message => new Promise(resolve => requests.push({ message: plain(message), resolve })) } }
  const files = JSON.parse(read('extension/manifest.json')).content_scripts[0].js.filter(file => file !== 'content/launcher-main.js')
  loadScripts(window, files)
  const launcher = window.Janice.createLauncher({ window })
  launcher.mount()
  const control = () => window.document.querySelector('janice-inline-coupon')
  const isShown = () => Boolean(control() && !control().hidden)
  return { window, launcher, control, isShown, requests, shown: () => shown, mutations: () => checkoutMutations, section: window.document.querySelector('section') }
}

// Drain the pending async inspection before the 180ms mutation debounce can
// rescan the page. This catches stale-discovery races without timing guesses.
async function settleProvider(request) {
  request.resolve(available())
  for (let index = 0; index < 5; index++) await Promise.resolve()
}

test('inline coupon control stays hidden when the drawer closes during provider inspection, then follows reopening', async t => {
  const page = drawer(t)
  assert.equal(page.requests.length, 1)
  page.section.hidden = true
  await settleProvider(page.requests[0])
  assert.equal(page.isShown(), false, 'fresh drawer visibility wins before the observer debounce')
  assert.equal(page.shown(), 0)
  assert.equal(page.mutations(), 0)

  page.section.hidden = false
  await waitUntil(page.isShown)
  assert.equal(page.isShown(), true, 'cached candidate availability can decorate the input when the drawer reopens')
  assert.equal(page.shown(), 1)
  assert.deepEqual(page.requests.map(request => request.message), [{ type: 'janice:inspect' }])
  assert.equal(page.mutations(), 0)
  page.launcher.destroy()
})

test('destroying a launcher during provider inspection cannot show an inline coupon control after the reply', async t => {
  const page = drawer(t)
  assert.equal(page.requests.length, 1)
  page.launcher.destroy()
  await settleProvider(page.requests[0])
  assert.equal(page.launcher.element.isConnected, false)
  assert.equal(page.window.document.querySelector('janice-coupons-launcher'), null)
  assert.equal(page.isShown(), false)
  assert.equal(page.control(), null)
  assert.equal(page.shown(), 0, 'no native popover operation runs after destruction')
  assert.deepEqual(page.requests.map(request => request.message), [{ type: 'janice:inspect' }])
  assert.equal(page.mutations(), 0)
})
