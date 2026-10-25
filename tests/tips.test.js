// Tips on product pages: the product from the page's schema.org data, the
// prices Janice keeps on this device, and the tips view in the page button's
// card. tests/e2e/tips.test.js draws it in Chromium.
const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

const { read, plain, loadScripts, waitUntil } = require('./helpers/demo.js')

const LAUNCHER_SCRIPTS = JSON.parse(read('extension/manifest.json')).content_scripts[0].js
const URL = 'https://sharperimage.com/products/ionic-comfort-quadra-air-purifier'
const NOW = new Date('2026-10-24T12:00:00').getTime()
// The shape observed on sharperimage.com product pages: a JSON-LD array, then the Product with its offers.
const PRODUCT_HEAD = `
  <script type="application/ld+json">[{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}]</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Ionic Comfort Quadra Air Purifier","sku":"203520","image":"https://sharperimage.com/cdn/shop/files/quadra.jpg?v=17","offers":[{"@type":"Offer","price":419.99,"priceCurrency":"USD","availability":"https://schema.org/InStock"}]}</script>
  <meta property="og:title" content="Ionic Comfort Quadra | Clean Air"><meta property="og:price:amount" content="419.99"><meta property="og:price:currency" content="USD">`

function page(url = URL, head = PRODUCT_HEAD) {
  const { window } = new JSDOM(`<!doctype html><html lang="en-US"><head>${head}</head><body><main><h1>Product</h1></main></body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true })
  return window
}

/** chrome.storage.local in memory, starting with `entries`. */
function memoryStorage(entries = {}) {
  const stored = structuredClone(entries)
  return {
    stored,
    get: async keys => Object.fromEntries([keys].flat().filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
    set: async items => { for (const [key, value] of Object.entries(items)) stored[key] = structuredClone(value) },
  }
}

const { KEYS, readProduct, recordPrice, createTipsView } = (() => {
  const window = page()
  loadScripts(window, ['shared/money.js', 'shared/icons.js', 'content/tips.js'])
  return window.Janice.tips
})()

const QUADRA = { key: 'ionic-comfort-quadra-air-purifier', title: 'Ionic Comfort Quadra Air Purifier', image: 'https://sharperimage.com/cdn/shop/files/quadra.jpg?v=17', priceMinor: 41999, currency: 'USD', url: URL }

test('tips: the product comes from the page’s schema.org Product, with og tags as the fallback', () => {
  const window = page()
  assert.deepEqual(plain(readProduct(window.document, window.location)), QUADRA)

  const ogOnly = page(URL, '<meta property="og:title" content="Quadra"><meta property="og:price:amount" content="419.99"><meta property="og:price:currency" content="USD"><meta property="og:image" content="javascript:alert(1)">')
  assert.deepEqual(plain(readProduct(ogOnly.document, ogOnly.location)), { ...QUADRA, title: 'Quadra', image: null }, 'only https images are used')

  // Most of the store's own links open a product inside a collection: the same product, the same key and address.
  const inCollection = page('https://sharperimage.com/collections/fall-essentials/products/ionic-comfort-quadra-air-purifier?variant=1')
  assert.deepEqual(plain(readProduct(inCollection.document, inCollection.location)), QUADRA)

  const home = page('https://sharperimage.com/')
  assert.equal(readProduct(home.document, home.location), null, 'not a product page')
  const collection = page('https://sharperimage.com/collections/fall-essentials')
  assert.equal(readProduct(collection.document, collection.location), null, 'a collection is not a product page')
  const noPrice = page(URL, '<meta property="og:title" content="Quadra">')
  assert.equal(readProduct(noPrice.document, noPrice.location), null, 'no price, no tips')
})

test('tips: one price per day is kept on this device, for 90 days and 200 products, unless the shopper turns it off', async () => {
  const storage = memoryStorage({ [KEYS.prices]: { 'old-product': [{ day: '2026-01-01', priceMinor: 100, currency: 'USD' }], [QUADRA.key]: [{ day: '2026-07-01', priceMinor: 45999, currency: 'USD' }, { day: '2026-10-01', priceMinor: 44999, currency: 'USD' }] } })
  await recordPrice(storage, QUADRA, NOW)
  await recordPrice(storage, { ...QUADRA, priceMinor: 40999 }, NOW)
  assert.deepEqual(storage.stored[KEYS.prices][QUADRA.key], [
    { day: '2026-10-01', priceMinor: 44999, currency: 'USD' },
    { day: '2026-10-24', priceMinor: 40999, currency: 'USD' },
  ], 'older than 90 days dropped; the same day updated')

  const many = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`product-${index}`, [{ day: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`, priceMinor: 100, currency: 'USD' }]]))
  const full = memoryStorage({ [KEYS.prices]: many })
  await recordPrice(full, QUADRA, NOW)
  assert.equal(Object.keys(full.stored[KEYS.prices]).length, 200)
  assert.ok(full.stored[KEYS.prices][QUADRA.key], 'the product just seen is kept')

  const off = memoryStorage({ [KEYS.settings]: { rememberPrices: false } })
  await recordPrice(off, QUADRA, NOW)
  assert.equal(off.stored[KEYS.prices], undefined)
})

test('tips view: the trend from the prices Janice saw, the coupon count, and Save and Watch on this device; no rating', async () => {
  const window = page()
  const storage = memoryStorage({ [KEYS.prices]: { [QUADRA.key]: [{ day: '2026-10-01', priceMinor: 44999, currency: 'USD' }, { day: '2026-10-12', priceMinor: 42999, currency: 'USD' }] } })
  const view = createTipsView({ window, storage, product: QUADRA, storeName: 'Sharper Image', checkoutUrl: 'https://sharperimage.com/checkout', now: () => NOW })
  window.document.body.append(view.element)
  const $ = selector => view.element.querySelector(selector)
  const text = selector => $(selector).textContent.replace(/\s+/g, ' ').trim()

  await view.update({ couponCount: null })
  assert.equal(text('.coupon-count'), 'Checking coupons…')
  await view.update({ couponCount: 1 })
  assert.equal(text('.product-title'), 'Ionic Comfort Quadra Air Purifier')
  assert.equal(text('.product-store'), 'Sharper Image')
  assert.equal($('.thumb').getAttribute('src'), QUADRA.image)
  assert.equal(text('.coupon-count'), '1 coupon')
  assert.equal(text('.later .offer-value'), 'Not available yet', 'no rewards are claimed')
  assert.equal($('.tips-go').getAttribute('href'), 'https://sharperimage.com/checkout')
  assert.equal(text('.price-note'), 'This price dropped $30.00 since Oct 1.')
  assert.equal(text('.current-price'), '$419.99')
  assert.equal(text('.trend-summary'), 'Down $30.00 since Oct 1')
  assert.equal($('.chart').querySelectorAll('circle').length, 3)
  assert.equal($('.chart').querySelectorAll('.series').length, 1)
  assert.match($('.chart').getAttribute('aria-label'), /Oct 1 \$449\.99, Oct 12 \$429\.99, Oct 24 \$419\.99/)

  // The chart's readout follows the keys, as it follows the pointer; the history table holds the same prices.
  $('.chart').dispatchEvent(new window.FocusEvent('focus'))
  assert.equal(text('.readout'), '$419.99Today')
  $('.chart').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  assert.equal(text('.readout'), '$429.99Oct 12')
  $('.history-toggle').click()
  assert.equal($('.price-history').hidden, false)
  assert.deepEqual([...$('.price-history tbody').rows].map(row => row.textContent), ['Today$419.99', 'Oct 12$429.99', 'Oct 1$449.99'])

  $('.save').click()
  await waitUntil(() => $('.save').getAttribute('aria-pressed') === 'true')
  assert.ok(storage.stored[KEYS.saved][QUADRA.key])
  assert.equal($('.save').getAttribute('aria-pressed'), 'true')
  assert.equal(text('.save-label'), 'Saved')

  $('.watch').click()
  await waitUntil(() => $('.watch').getAttribute('aria-pressed') === 'true')
  assert.deepEqual(storage.stored[KEYS.watch][QUADRA.key], { day: '2026-10-24', priceMinor: 41999, currency: 'USD' })
  assert.equal(text('.watch-label'), 'Watching for price drops')
  assert.equal(text('.watch-note'), 'Since Oct 24 at $419.99. Janice compares when you visit this page.')

  // Rate this tip was removed (owner request, 2026-10-24): nothing asks for a rating, and none is kept.
  assert.doesNotMatch($('.tips').textContent, /rate|helpful/i)
  assert.equal(view.element.querySelectorAll('button').length, 3, 'Save, See price history and Watch for price drops')
  assert.equal(KEYS.ratings, undefined)
  assert.deepEqual(Object.keys(storage.stored).sort(), [KEYS.prices, KEYS.saved, KEYS.watch].sort())
})

test('tips view: a lower price than when watching started says so first', async () => {
  const window = page()
  const storage = memoryStorage({ [KEYS.watch]: { [QUADRA.key]: { day: '2026-10-10', priceMinor: 44999, currency: 'USD' } } })
  const view = createTipsView({ window, storage, product: QUADRA, storeName: 'Sharper Image', now: () => NOW })
  await view.update({ couponCount: 0 })
  assert.equal(view.element.querySelector('.price-note').textContent, 'Down $30.00 since you started watching on Oct 10.')
  assert.equal(view.element.querySelector('.coupon-count').textContent, 'No coupons yet')
  assert.equal(view.element.querySelector('.tips-go').hidden, true, 'no checkout link without one')
})

test("page button on a product page: its card shows tips, with Janice's coupon count and today's price kept", async () => {
  const window = page()
  const storage = memoryStorage()
  window.chrome = {
    runtime: {
      id: 'janice-test',
      sendMessage: async message =>
        message.type === 'janice:inspect'
          ? { ok: true, detection: { store: { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'store' }, supported: false, reason: 'not-checkout', run: null }, candidates: [{ code: 'AFF15', offerText: '$15 off orders of $150 or more' }], providerError: null, run: null }
          : undefined,
    },
    storage: { local: storage, onChanged: { addListener() {}, removeListener() {} } },
  }
  loadScripts(window, LAUNCHER_SCRIPTS)
  const launcher = window.document.querySelector('janice-coupons-launcher').shadowRoot
  const $ = selector => launcher.querySelector(selector)
  await waitUntil(() => storage.stored[KEYS.prices]?.[QUADRA.key])
  assert.equal(storage.stored[KEYS.prices][QUADRA.key].at(-1).priceMinor, 41999, "today's price is kept as the page loads")

  $('.tab').dispatchEvent(new window.PointerEvent('pointerenter', { pointerType: 'mouse' }))
  await waitUntil(() => $('.coupon-count')?.textContent === '1 coupon')
  assert.equal($('.card').getAttribute('aria-label'), 'Janice tips')
  assert.deepEqual(['.tips-label', '.gear', '.tips-slot'].map(selector => $(selector).hidden), [false, false, false])
  assert.equal($('.gear').getAttribute('popovertarget'), 'menu', 'the gear opens its menu (tests/launcher-menu.test.js)')
  assert.deepEqual(['.body', '.store'].map(selector => $(selector).hidden), [true, true])
  assert.equal($('.product-title').textContent, 'Ionic Comfort Quadra Air Purifier')
  assert.equal($('.trend-summary').textContent, 'First price seen')
})
