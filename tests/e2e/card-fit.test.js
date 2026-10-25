// The page button's card always shows whole, without scrolling (the owner's call, 2026-10-24), on a stand-in for
// a Sharper Image product page (the Demo fixture in fixtures/product-page, served in place of the real site):
// above the tab when it fits there, below it when the tab sits high up, otherwise beside it, and the tips in two
// columns when one column would be taller than the window. It never covers the tab, and it follows a resized
// window and a price history opened inside it. The coupon card away from product pages fits the same way.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'product-page')
const ORIGIN = 'https://sharperimage.com'
const PRODUCT = `${ORIGIN}/collections/fall-essentials/products/ionic-comfort-quadra-air-purifier`
const daysAgo = offset => {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Where the open card sits once placed: its side, the tips' columns, and whether it shows whole. */
function measure(launcher) {
  return launcher.evaluate(async host => {
    const part = selector => host.shadowRoot.querySelector(selector)
    const card = part('.card')
    await Promise.all(card.getAnimations().map(animation => animation.finished))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const box = card.getBoundingClientRect()
    const tab = part('.tab').getBoundingClientRect()
    const tile = part('.store').hidden ? box : part('.store').getBoundingClientRect()
    const tips = part('.tips')
    return {
      side: card.dataset.side,
      columns: tips ? getComputedStyle(tips).gridTemplateColumns.split(' ').length : null,
      isWhole: Math.min(box.top, tile.top) >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
      scrolls: [card, part('.body'), part('.tips-slot')].some(element => getComputedStyle(element).display !== 'none' && element.scrollHeight > element.clientHeight + 1),
      coversTab: box.left < tab.right && box.right > tab.left && box.top < tab.bottom && box.bottom > tab.top,
      text: card.innerText,
    }
  })
}

test('the card shows whole without scrolling, wherever the button sits and however short the window', async t => {
  const extensionDir = testCopy({ hostPermissions: [`${ORIGIN}/*`] })
  const browser = await launch({ extensionDir })
  t.after(async () => {
    await browser.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  })
  await browser.context.route(`${ORIGIN}/**`, route => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/cart.js') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ currency: 'USD', items: [], item_count: 0, total_price: 0, discount_codes: [] }) })
    if (pathname.startsWith('/cdn/')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(FIXTURE, 'product.svg')) })
    return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(FIXTURE, 'index.html')) })
  })
  // Two earlier visits, so the price trend and the history have something to show.
  await browser.worker.evaluate(entries => chrome.storage.local.set({ 'tips:prices': { 'ionic-comfort-quadra-air-purifier': entries } }), [
    { day: daysAgo(23), priceMinor: 44999, currency: 'USD' },
    { day: daysAgo(12), priceMinor: 42999, currency: 'USD' },
  ])
  const page = await browser.context.newPage()
  const launcher = page.locator('janice-coupons-launcher')

  /** Opens the card on `url` in a window of `size`, with the button at its default spot or at `share` of the edge. */
  async function open(url, size, share = null) {
    await browser.worker.evaluate(value => (value === null ? chrome.storage.local.remove('launcher:position') : chrome.storage.local.set({ 'launcher:position': { share: value } })), share)
    await page.setViewportSize(size)
    await page.goto(url)
    await launcher.locator('.tab').click()
    if (url === PRODUCT) await launcher.locator('.coupon-count').filter({ hasText: '1 coupon' }).waitFor()
    else await launcher.locator('.heading').filter({ hasText: '1 coupon found' }).waitFor()
    return measure(launcher)
  }
  const whole = (placed, label) => {
    assert.equal(placed.isWhole, true, `${label}: inside the window`)
    assert.equal(placed.scrolls, false, `${label}: nothing scrolls`)
    assert.equal(placed.coversTab, false, `${label}: the tab stays clear`)
  }

  const cases = [
    { label: 'tall window', size: { width: 1280, height: 900 }, share: null, side: 'above', columns: 1 },
    { label: 'tall window, button at the top', size: { width: 1280, height: 900 }, share: 0, side: 'below', columns: 1 },
    { label: 'laptop window', size: { width: 1280, height: 700 }, share: null, side: 'beside', columns: 1 },
    { label: 'laptop window, button in the middle', size: { width: 1280, height: 700 }, share: 0.5, side: 'beside', columns: 1 },
    { label: 'short window', size: { width: 1280, height: 560 }, share: null, columns: 2 },
    { label: 'short window, button at the top', size: { width: 1280, height: 560 }, share: 0, columns: 2 },
    { label: 'short narrow window', size: { width: 700, height: 560 }, share: 0.5, columns: 2 },
  ]
  for (const { label, size, share, side, columns } of cases) {
    const placed = await open(PRODUCT, size, share)
    whole(placed, label)
    if (side) assert.equal(placed.side, side, `${label}: ${side} the tab`)
    assert.equal(placed.columns, columns, `${label}: ${columns} column${columns === 1 ? '' : 's'}`)
    assert.doesNotMatch(placed.text, /Rate this tip/, `${label}: no rating`)
  }

  // Opening the price history in a laptop window: the card grows past the window's height, so it takes two
  // columns, still whole. (Only a window too short even for that, under about 580px with three prices, scrolls.)
  assert.equal((await open(PRODUCT, { width: 1280, height: 700 })).columns, 1)
  await launcher.locator('.history-toggle').click()
  await launcher.locator('.price-history tbody tr').nth(2).waitFor()
  const history = await measure(launcher)
  whole(history, 'price history open')
  assert.equal(history.columns, 2)

  // A window made shorter while the card is open: the card moves beside the tab, still whole.
  assert.equal((await open(PRODUCT, { width: 1280, height: 900 })).side, 'above')
  await page.setViewportSize({ width: 1280, height: 640 })
  const resized = await measure(launcher)
  whole(resized, 'resized window')
  assert.equal(resized.side, 'beside')

  // The coupon card away from product pages, with its store tile, fits a short window too.
  whole(await open(`${ORIGIN}/`, { width: 1280, height: 560 }), 'coupon card')
})
