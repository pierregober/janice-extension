// The UI preview page (fixtures/ui-preview/) draws every popup, page button
// and panel screen from the extension's own files; this keeps it in step
// with them.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const { serveFixtures } = require('../../scripts/serve-fixtures.js')

test('the UI preview draws every popup, page button and panel screen, and they run Try coupons and Stop', async () => {
  const server = await serveFixtures({ port: 0 })
  const browser = await chromium.launch({ channel: 'chromium' })
  try {
    const page = await browser.newPage()
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))
    page.on('response', response => response.status() >= 400 && problems.push(`${response.status()} ${response.url()}`))
    await page.goto(`http://127.0.0.1:${server.address().port}/ui-preview/`)

    const popups = page.locator('#popups iframe')
    await page.waitForFunction(() => document.querySelectorAll('#popups iframe').length === 10)
    for (let index = 0; index < 10; index++) {
      await popups.nth(index).contentFrame().locator('#status').filter({ hasNotText: 'Checking this page…' }).waitFor()
    }
    const statuses = await Promise.all([...Array(10).keys()].map(index => popups.nth(index).contentFrame().locator('#status').innerText()))
    assert.deepEqual(statuses, [
      'Ready to try 1 coupon',
      'Trying AFF15 (1 of 1)…',
      'You save $15.00 with AFF15',
      'Code not accepted',
      'Already using the available code',
      'Testing stopped',
      "Result couldn't be confirmed",
      'Go to checkout to try coupons.',
      'This page is not a supported store.',
      "Janice Coupons can't read this page.",
    ])

    const launchers = page.locator('#launchers iframe')
    assert.equal(await launchers.count(), 3)
    const card = index => launchers.nth(index).contentFrame().locator('janice-coupons-launcher')
    await card(0).locator('.heading').filter({ hasText: '1 coupon found' }).waitFor()
    assert.equal(await card(0).getByRole('link', { name: 'Go to checkout' }).isVisible(), true)
    await card(1).locator('.heading').filter({ hasText: '1 coupon found' }).waitFor()
    await card(2).locator('.heading').filter({ hasText: 'You save $15.00 with AFF15' }).waitFor()

    // The button is fixed in its frame, so bring the frame itself into view before clicking.
    await launchers.nth(1).scrollIntoViewIfNeeded()
    await card(1).getByRole('button', { name: 'Try coupons' }).click()
    const runPanel = launchers.nth(1).contentFrame().locator('janice-coupons-panel')
    await runPanel.locator('.status').filter({ hasText: 'You save $15.00 with AFF15' }).waitFor({ timeout: 6000 })
    assert.equal(await card(1).isVisible(), false, 'the button steps aside for the panel')
    await runPanel.getByRole('button', { name: 'Close' }).click()
    await card(1).locator('.tab').waitFor()

    const panels = page.locator('#panels iframe')
    assert.equal(await panels.count(), 4)
    assert.equal(await panels.nth(1).contentFrame().locator('janice-coupons-panel .figure').innerText(), '$15.00\nSAVED')

    const first = popups.first().contentFrame()
    await first.getByRole('button', { name: 'Try coupons' }).click()
    await first.getByText('Trying AFF15 (1 of 1)…').waitFor()
    await first.getByRole('button', { name: 'Stop' }).click()
    await first.getByText('Testing stopped').waitFor({ timeout: 5000 })
    assert.deepEqual(problems, [])
  } finally {
    await browser.close()
    server.close()
  }
})
