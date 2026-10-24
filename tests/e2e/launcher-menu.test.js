// The page button's gear menu in Chromium, on the stand-in for a Sharper Image product page (the Demo
// fixture in fixtures/product-page, served in place of the real site): the menu opens under the gear and
// Escape closes it alone; Go to settings opens Janice's settings page in a tab; Snooze on this site hides the
// button, also after a reload, until Show again on the settings page brings it back to the open page; Hide on
// this page lasts until the page reloads.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'product-page')
const PRODUCT = 'https://sharperimage.com/products/ionic-comfort-quadra-air-purifier'

// Once its kept spot and snooze are read, the button is shown or snoozed.
const restored = page => page.waitForFunction(() => document.querySelector('janice-coupons-launcher')?.style.visibility === '')
const display = page => page.evaluate(() => document.querySelector('janice-coupons-launcher').style.display)

test('gear menu: under the gear, Escape closes it alone; Go to settings, Snooze on this site and Hide on this page', async t => {
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

  const page = await browser.context.newPage()
  await page.goto(PRODUCT)
  const launcher = page.locator('janice-coupons-launcher')
  const menu = launcher.locator('#menu')
  await launcher.locator('.tab').hover()
  await launcher.locator('.coupon-count').filter({ hasText: '1 coupon' }).waitFor()

  // The menu: a popover under the gear, lined up with its right edge and inside the window.
  await launcher.locator('.gear').click()
  await menu.waitFor()
  assert.equal(await menu.evaluate(element => element.matches(':popover-open')), true)
  assert.equal(await launcher.locator('.gear').getAttribute('aria-expanded'), 'true')
  assert.deepEqual(await menu.locator('button').allInnerTexts(), ['Hide on this page', 'Snooze for 24 hours', 'Snooze on this site', 'Go to settings'])
  const gear = await launcher.locator('.gear').boundingBox()
  const box = await menu.boundingBox()
  assert.ok(box.y >= gear.y + gear.height, 'under the gear')
  assert.ok(Math.abs(box.x + box.width - (gear.x + gear.width)) <= 1, "lined up with the gear's right edge")
  assert.ok(box.x >= 0 && box.y + box.height <= page.viewportSize().height, 'inside the window')

  // Opening the menu keeps the hover-opened card open, and Escape closes the menu alone, back to the gear.
  await page.mouse.move(10, 10)
  await page.waitForTimeout(500)
  assert.equal(await launcher.locator('.card').isVisible(), true, 'the card stays while the menu is open')
  await menu.locator('button').first().focus()
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })
  assert.equal(await launcher.locator('.card').isVisible(), true, 'the card stays open')
  assert.equal(await launcher.locator('.gear').getAttribute('aria-expanded'), 'false')
  assert.equal(await launcher.evaluate(host => host.shadowRoot.activeElement?.className), 'gear')

  // Go to settings opens Janice's settings page in a tab, and the card closes.
  await launcher.locator('.gear').click()
  const [settings] = await Promise.all([browser.context.waitForEvent('page'), menu.getByText('Go to settings').click()])
  await settings.waitForLoadState()
  assert.equal(settings.url(), `chrome-extension://${browser.extensionId}/options/options.html`)
  assert.equal(await settings.title(), 'Janice settings')
  await settings.locator('#everywhere').filter({ hasText: 'Showing' }).waitFor()
  assert.equal(await launcher.locator('.card').isVisible(), false)

  // Snooze on this site: gone at once and after a reload; the settings page lists the store, and Show again
  // brings the button back to the open page.
  await page.bringToFront()
  await launcher.locator('.tab').click()
  await launcher.locator('.gear').click()
  await menu.getByText('Snooze on this site').click()
  await launcher.waitFor({ state: 'hidden' })
  await settings.locator('#snoozed-stores li').filter({ hasText: 'Sharper Image' }).waitFor()
  await page.reload()
  await restored(page)
  assert.equal(await display(page), 'none', 'still snoozed after a reload')
  await settings.getByRole('button', { name: 'Show the page button on Sharper Image again' }).click()
  await launcher.locator('.tab').waitFor()
  assert.equal(await display(page), 'block')

  // Hide on this page: gone, nothing kept, back after a reload.
  await page.bringToFront()
  await launcher.locator('.tab').click()
  await launcher.locator('.gear').click()
  await menu.getByText('Hide on this page').click()
  await launcher.waitFor({ state: 'hidden' })
  assert.deepEqual(await browser.worker.evaluate(() => chrome.storage.local.get('launcher:snooze')), { 'launcher:snooze': { until: null, stores: [] } })
  await page.reload()
  await restored(page)
  assert.equal(await display(page), 'block')
})
