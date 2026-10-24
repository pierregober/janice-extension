// Recognizing a Shopify checkout from the page itself, on any host: the shop
// record Shopify puts in meta[name="serialized-shop"], next to another checkout
// marker, matched to a store by its Shopify shop ID. On shop.app, where coupon
// testing isn't verified yet, the checkout is recognized and read, never run.
const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

const { read, plain, loadScripts, aff15Candidates, waitUntil } = require('./helpers/demo.js')

const INJECTED = JSON.parse(/CONTENT_SCRIPTS = (\[[\s\S]*?\])/.exec(read('extension/service-worker.js'))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'))
const LAUNCHER_SCRIPTS = JSON.parse(read('extension/manifest.json')).content_scripts[0].js
const SHOP_APP = 'https://shop.app/checkout/85659779361/cn/TESTTOKEN/en-us/shoppay'
// The record as observed on sharperimage.com and shop.app, without its feature flags.
const SHARPER_IMAGE = {
  id: 'gid://shopify/Shop/85659779361',
  name: 'Sharper Image',
  domain: 'sharperimage.com',
  myshopifyDomain: '30786c.myshopify.com',
  origins: ['https://30786c.myshopify.com', 'https://30786c.account.myshopify.com', 'https://sharperimage.com', 'https://www.sharperimage.com'],
}
const SHOP_APP_STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'checkout', checkoutHost: 'shop.app', isTestingVerified: false }

const attribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** A page at url with the shop record (an object, raw text, or null for none), the named markers, and body markup. */
function checkoutPage(url, { shop = SHARPER_IMAGE, markers = ['generator', 'main'], body = '' } = {}) {
  const head = [
    shop === null ? '' : `<meta name="serialized-shop" content="${attribute(typeof shop === 'string' ? shop : JSON.stringify(shop))}">`,
    markers.includes('generator') ? '<meta name="generator" content="Shopify">' : '',
    markers.includes('script') ? '<script type="module" src="https://cdn.shopify.com/cdn/shopifycloud/checkout-web/assets/c1/app.js"></script>' : '',
  ].join('')
  const main = markers.includes('main') ? `<div id="checkout-main">${body}</div>` : body
  return new JSDOM(`<!doctype html><html lang="en-US"><head>${head}</head><body>${main}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true })
}

test('Shopify checkout: the shop record counts next to another checkout marker; nothing else is taken from the page', () => {
  const { recognize } = require('../extension/content/shopify.js')
  const doc = options => checkoutPage(SHOP_APP, options).window.document
  const { id, ...rest } = SHARPER_IMAGE
  for (const markers of [['generator'], ['main'], ['script']]) {
    assert.deepEqual(recognize(doc({ markers })), { id: '85659779361', ...rest }, markers.join())
  }
  assert.equal(recognize(doc({ markers: [] })), null, 'the record alone is not enough')
  assert.equal(recognize(doc({ shop: null })), null, 'no record')
  assert.equal(recognize(doc({ shop: '{"id":' })), null, 'unreadable JSON')
  assert.equal(recognize(doc({ shop: { ...SHARPER_IMAGE, id: 'gid://shopify/Product/85659779361' } })), null, 'not a shop')
  assert.deepEqual(recognize(doc({ shop: { id: SHARPER_IMAGE.id, name: 7, origins: 'x' } })), { id: '85659779361', name: null, domain: null, myshopifyDomain: null, origins: [] }, 'odd fields are dropped')
})

test("Shopify checkout: on shop.app the store is matched by its shop ID, and the address's ID must agree", () => {
  const { detect } = require('../extension/content/stores.js')
  const at = (url, options) => {
    const { window } = checkoutPage(url, options)
    return detect(window.location, window.document)
  }
  assert.deepEqual(at(SHOP_APP), SHOP_APP_STORE)
  assert.deepEqual(at('https://shop.app/checkout/85659779361/c/TESTTOKEN'), SHOP_APP_STORE, 'the older checkout address')
  assert.equal(at('https://shop.app/checkout/123456/cn/TESTTOKEN/en-us/shoppay'), null, 'the address names another shop')
  const other = { ...SHARPER_IMAGE, id: 'gid://shopify/Shop/123456', name: 'Another Store' }
  assert.equal(at('https://shop.app/checkout/123456/cn/TESTTOKEN/en-us/shoppay', { shop: other }), null, 'a Shopify store Janice does not support')
  assert.equal(at('https://shop.app/account/orders'), null, 'not a checkout address')
  assert.equal(at(SHOP_APP, { markers: [] }), null, 'no checkout marker')

  // The store's own host keeps its address rules, with nothing added.
  assert.deepEqual(at('https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us'), { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'checkout' })
})

test('Shopify checkout on shop.app: the checkout is read, Try coupons is refused, and nothing on the page changes', async () => {
  const { window } = checkoutPage(SHOP_APP, { body: `<aside>${read('tests/fixtures/live-summary-baseline.html')}</aside>` })
  let listener = null
  window.chrome = { runtime: { id: 'janice-test', sendMessage: async () => {}, onMessage: { addListener: fn => (listener = fn) } } }
  loadScripts(window, INJECTED)
  const ask = message => new Promise(resolve => listener(message, { id: 'janice-test' }, reply => resolve(plain(reply))))
  const field = window.document.querySelector('input[name="reductions"]')

  const detection = await ask({ type: 'janice:detect' })
  assert.deepEqual(detection.store, SHOP_APP_STORE)
  assert.deepEqual([detection.supported, detection.reason], [false, 'unverified-checkout'])
  assert.equal(detection.preview.total.amountMinor, 31998, 'the total is read, as on sharperimage.com')

  const reply = await ask({ type: 'janice:start', candidates: await aff15Candidates() })
  assert.deepEqual([reply.ok, reply.reason], [false, 'unverified-checkout'])
  assert.equal(window.document.querySelector('janice-coupons-panel'), null, 'no run panel')
  assert.equal(field.value, '', 'the discount field is untouched')
})

test("Shopify checkout on shop.app: the page button shows only for a supported store's checkout, and says testing isn't verified there", async () => {
  const open = options => {
    const { window } = checkoutPage(options.url ?? SHOP_APP, options)
    window.chrome = {
      runtime: {
        id: 'janice-test',
        sendMessage: async message =>
          message.type === 'janice:inspect'
            ? {
                ok: true,
                detection: { store: SHOP_APP_STORE, discovery: { kind: 'promo-field' }, supported: false, reason: 'unverified-checkout', preview: null, run: null },
                candidates: (await aff15Candidates()).map(({ code, offerText }) => ({ code, offerText })),
                providerError: null,
                run: null,
              }
            : undefined,
      },
    }
    loadScripts(window, LAUNCHER_SCRIPTS)
    return window
  }

  const other = open({ url: 'https://shop.app/checkout/123456/cn/TESTTOKEN/en-us/shoppay', shop: { ...SHARPER_IMAGE, id: 'gid://shopify/Shop/123456' } })
  assert.equal(other.document.querySelector('janice-coupons-launcher'), null, "no button on another shop's checkout")

  const window = open({})
  const launcher = window.document.querySelector('janice-coupons-launcher').shadowRoot
  launcher.querySelector('.tab').dispatchEvent(new window.PointerEvent('pointerenter', { pointerType: 'mouse' }))
  await waitUntil(() => launcher.querySelector('.heading').textContent === '1 coupon found')
  assert.equal(
    launcher.querySelector('.text').textContent,
    "Janice recognized the Sharper Image checkout on shop.app, but coupon testing hasn't been verified there yet. Nothing was changed.",
  )
  assert.equal(launcher.querySelector('.try').hidden, true, 'no Try coupons')
})
