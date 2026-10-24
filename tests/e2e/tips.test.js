// Tips in Chromium on a stand-in for a Sharper Image product page (the Demo
// fixture in fixtures/product-page, served in place of the real site): the
// card shows the product, the coupon count and the price trend from prices
// kept on this device, and Watch for price drops is kept across a reload.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'product-page')
const PRODUCT = 'https://sharperimage.com/products/ionic-comfort-quadra-air-purifier'
const daysAgo = offset => {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('tips on a product page: the product, coupons and price trend in the card; Watch for price drops is kept', async t => {
  const extensionDir = testCopy({ hostPermissions: ['https://sharperimage.com/*'] })
  const browser = await launch({ extensionDir })
  t.after(async () => {
    await browser.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  })
  await browser.context.route('https://sharperimage.com/**', route => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/cart.js') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currency: 'USD', items: [], item_count: 0, total_price: 0, discount_codes: [] }) })
    if (pathname.startsWith('/cdn/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(FIXTURE, 'product.svg')) })
    return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(FIXTURE, 'index.html')) })
  })
  // Two earlier visits, as if the shopper had seen the price 23 and 12 days ago.
  await browser.worker.evaluate(entries => chrome.storage.local.set({ 'tips:prices': { 'ionic-comfort-quadra-air-purifier': entries } }), [
    { day: daysAgo(23), priceMinor: 44999, currency: 'USD' },
    { day: daysAgo(12), priceMinor: 42999, currency: 'USD' },
  ])

  const page = await browser.context.newPage()
  await page.goto(PRODUCT)
  const launcher = page.locator('janice-coupons-launcher')
  await launcher.locator('.tab').hover()
  await launcher.locator('.coupon-count').filter({ hasText: '1 coupon' }).waitFor()
  assert.equal(await launcher.locator('.tips-label').innerText(), 'tips')
  assert.equal(await launcher.locator('.product-title').innerText(), 'Ionic Comfort Quadra Air Purifier')
  assert.equal(await launcher.locator('.current-price').innerText(), '$419.99')
  assert.match(await launcher.locator('.trend-summary').innerText(), /^Down \$30\.00 since /)
  assert.equal(await launcher.locator('.chart circle').count(), 3)
  assert.equal(await launcher.locator('.thumb').evaluate(image => image.complete && image.naturalWidth > 0), true, 'the product image loads')
  const card = await launcher.locator('.card').boundingBox()
  assert.ok(card.y >= 0 && card.y + card.height <= page.viewportSize().height, 'the card fits in the window')

  await launcher.locator('.watch').click()
  await launcher.locator('.watch[aria-pressed="true"]').waitFor()
  await page.reload()
  await launcher.locator('.tab').hover()
  await launcher.locator('.watch-label').filter({ hasText: 'Watching for price drops' }).waitFor()
})
