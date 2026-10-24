// Moving the page button in Chromium, on the Demo checkout: a drag slides it
// along the right edge and the spot survives a reload; the arrow keys move it
// too; high up, its card opens below it.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { serveFixtures } = require('../../scripts/serve-fixtures.js')
const { testCopy, launch } = require('./harness.js')

test('the page button slides along the right edge when dragged, keeps its spot after a reload, and moves with the arrow keys', async () => {
  const server = await serveFixtures({ port: 0 })
  const extensionDir = testCopy({ hostPermissions: ['http://127.0.0.1/*'], launcherMatches: ['http://127.0.0.1/*'] })
  const browser = await launch({ extensionDir })
  try {
    const page = await browser.context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/demo-checkout/?spend=20000`)
    const launcher = page.locator('janice-coupons-launcher')
    const tab = launcher.locator('.tab')
    const card = launcher.locator('.card')
    const shown = () => page.waitForFunction(() => getComputedStyle(document.querySelector('janice-coupons-launcher')).visibility === 'visible')
    await tab.waitFor()
    await shown()
    const { width, height } = page.viewportSize()
    const start = await tab.boundingBox()
    assert.ok(Math.abs(start.x + start.width - width) < 1, 'on the right edge')

    // Grab the tab 10px below its top and drag it up and well to the left: it stays on the edge, 200px down.
    await page.mouse.move(start.x + start.width / 2, start.y + 10)
    await page.mouse.down()
    await page.mouse.move(start.x - 300, 500, { steps: 8 })
    await page.mouse.move(start.x - 300, 210, { steps: 4 })
    await page.mouse.up()
    const dropped = await tab.boundingBox()
    assert.ok(Math.abs(dropped.y - 200) < 1.5, `200px from the top, not ${dropped.y}`)
    assert.ok(Math.abs(dropped.x + dropped.width - width) < 1, 'still on the right edge')
    assert.equal(await card.isVisible(), false, 'the drag leaves the card closed')

    // Dragged past the top, it stops at the window's edge.
    await page.mouse.move(dropped.x + dropped.width / 2, dropped.y + 10)
    await page.mouse.down()
    await page.mouse.move(dropped.x + dropped.width / 2, -50, { steps: 6 })
    await page.mouse.up()
    assert.ok(Math.abs((await tab.boundingBox()).y - 8) < 1.5, 'stops 8px from the top')
    await page.mouse.move(dropped.x - 400, 400)

    await page.reload()
    await tab.waitFor()
    await shown()
    const restored = await tab.boundingBox()
    assert.ok(Math.abs(restored.y - 8) < 1.5, `the spot is kept, not ${restored.y}`)

    await tab.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const keyed = await tab.boundingBox()
    assert.ok(Math.abs(keyed.y - (restored.y + 30)) < 1.5, 'two presses move it 30px')

    // High up, the card opens below the tab and fits in the window.
    await tab.click()
    await launcher.locator('.heading').filter({ hasText: '1 coupon found' }).waitFor()
    const cardBox = await card.boundingBox()
    assert.ok(cardBox.y > keyed.y + keyed.height, 'below the tab')
    assert.ok(cardBox.y + cardBox.height <= height, 'inside the window')
  } finally {
    await browser.close()
    server.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  }
})
