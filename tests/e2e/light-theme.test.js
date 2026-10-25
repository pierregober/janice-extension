// Janice stays light when the system is set to dark (the owner's call, 2026-10-24: a light theme app, the best for
// accessibility): the page button and its card on the stand-in for a Sharper Image product page (the Demo fixture
// in fixtures/product-page, served in place of the real site), the toolbar popup and the settings page, in
// Chromium with a dark color-scheme preference.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'product-page')
const PRODUCT = 'https://sharperimage.com/products/ionic-comfort-quadra-air-purifier'
const WHITE = 'rgb(255, 255, 255)'
const TEXT = 'rgb(28, 37, 44)'

test('light only: the page button and its card, the popup and the settings page stay light when the system is dark', async t => {
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
  const darkPage = async url => {
    const page = await browser.context.newPage()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(url)
    assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), true, 'the system is set to dark')
    return page
  }

  const store = await darkPage(PRODUCT)
  const launcher = store.locator('janice-coupons-launcher')
  await launcher.locator('.tab').hover()
  await launcher.locator('.coupon-count').filter({ hasText: '1 coupon' }).waitFor()
  await launcher.locator('.gear').click()
  await launcher.locator('#menu').waitFor()
  const card = await launcher.evaluate(host => {
    const style = selector => getComputedStyle(host.shadowRoot.querySelector(selector))
    return {
      tab: style('.tab').backgroundColor,
      card: [style('.card').backgroundColor, style('.card').color, style('.card').colorScheme],
      menu: style('#menu').backgroundColor,
      price: style('.current-price').color,
      watch: style('.watch').backgroundColor,
      goToCheckout: [style('.tips-go').backgroundColor, style('.tips-go').color],
    }
  })
  assert.deepEqual(card, {
    tab: WHITE,
    card: [WHITE, TEXT, 'light only'],
    menu: WHITE,
    price: TEXT,
    watch: WHITE,
    goToCheckout: ['rgb(37, 87, 214)', WHITE],
  })

  for (const [file, background] of [['popup/popup.html', WHITE], ['options/options.html', 'rgb(245, 246, 248)']]) {
    const page = await darkPage(`chrome-extension://${browser.extensionId}/${file}`)
    const look = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, scheme: getComputedStyle(document.documentElement).colorScheme }))
    assert.deepEqual(look, { background, color: TEXT, scheme: 'light only' }, file)
  }
})
