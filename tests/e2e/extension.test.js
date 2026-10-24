// The unpacked extension in Chromium against the Demo checkout fixture:
// popup or page button → service worker → injected content scripts → panel.
// The page button runs on the Demo host too, as it does on the store. Every
// result here is a Demo (fixture) result, not live-store evidence.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { serveFixtures } = require('../../scripts/serve-fixtures.js')
const { testCopy, launch, panelState, waitForPanelDone } = require('./harness.js')

let server
let otherServer
let origin
let otherOrigin
let extensionDir

before(async () => {
  server = await serveFixtures({ port: 0 })
  origin = `http://127.0.0.1:${server.address().port}`
  // The same files on another host ([::1]), standing in for an unrelated site.
  otherServer = await serveFixtures({ port: 0, host: '::1' })
  otherOrigin = `http://[::1]:${otherServer.address().port}`
  extensionDir = testCopy({ hostPermissions: ['http://127.0.0.1/*', 'http://[::1]/*'], launcherMatches: ['http://127.0.0.1/*'] })
})

after(() => {
  server?.close()
  otherServer?.close()
  if (extensionDir) fs.rmSync(extensionDir, { recursive: true, force: true })
})

async function demoCheckout(query) {
  const browser = await launch({ extensionDir })
  const page = await browser.context.newPage()
  await page.goto(`${origin}/demo-checkout/?${query}`)
  const tabId = await browser.tabId('http://127.0.0.1/*')
  return { browser, page, tabId, record: () => page.evaluate(() => JSON.parse(JSON.stringify(window.JaniceDemo.record))) }
}

test('Try coupons in the popup runs on the checkout; the panel says Demo; a reopened popup shows the result', async () => {
  const { browser, page, tabId, record } = await demoCheckout('spend=20000&delay=600')
  try {
    const popup = await browser.openPopup(tabId)
    await popup.getByText('Ready to try 1 coupon').waitFor()
    assert.equal(await popup.locator('#demo').isVisible(), true)
    assert.equal(await popup.locator('#coupons .ticket').innerText(), 'AFF15')
    assert.equal(await popup.locator('#coupons .offer').innerText(), '$15 off orders of $150 or more')
    assert.equal(await panelState(page), null, 'opening the popup changes nothing on the page')
    assert.deepEqual((await record()).applies, [])

    await popup.getByRole('button', { name: 'Try coupons' }).click()
    await page.bringToFront()
    await waitForPanelDone(page)

    const panel = await panelState(page)
    assert.equal(panel.isDemo, true)
    assert.equal(panel.status, 'Demo result: You save $15.00 with AFF15')
    assert.match(panel.result, /AFF15 is applied\. Total \$185\.00, was \$200\.00\./)
    assert.deepEqual(await record(), { applies: ['AFF15'], removes: [], forbidden: [] })

    await popup.close()
    const reopened = await browser.openPopup(tabId)
    await reopened.getByText('Demo result: You save $15.00 with AFF15').waitFor()
    assert.equal((await browser.storedRun(tabId)).result.kind, 'better')
  } finally {
    await browser.close()
  }
})

test('the page button: hovering shows the coupon count; its Try coupons runs Janice; it steps aside for the panel and returns with the result', async () => {
  const { browser, page, tabId, record } = await demoCheckout('spend=20000&delay=300')
  try {
    const launcher = page.locator('janice-coupons-launcher')
    await launcher.locator('.tab').hover()
    await launcher.locator('.heading').filter({ hasText: '1 coupon found' }).waitFor()
    assert.equal(await launcher.locator('.demo').isVisible(), true)
    assert.equal(await launcher.locator('.coupon .ticket').innerText(), 'AFF15')
    assert.deepEqual((await record()).applies, [], 'opening the card changes nothing on the checkout')
    assert.equal(await panelState(page), null)

    await launcher.getByRole('button', { name: 'Try coupons' }).click()
    await waitForPanelDone(page)
    assert.equal((await panelState(page)).status, 'Demo result: You save $15.00 with AFF15')
    assert.equal(await launcher.isVisible(), false, 'the button steps aside for the panel')
    assert.deepEqual(await record(), { applies: ['AFF15'], removes: [], forbidden: [] })
    assert.equal((await browser.storedRun(tabId)).result.kind, 'better')

    await page.locator('janice-coupons-panel').getByRole('button', { name: 'Close' }).click()
    await launcher.locator('.tab').hover()
    await launcher.locator('.heading').filter({ hasText: 'You save $15.00 with AFF15' }).waitFor()
    assert.equal(await launcher.getByRole('button', { name: 'Try coupons again' }).isVisible(), true)
  } finally {
    await browser.close()
  }
})

test('the run continues after the popup closes; reopening shows its progress and Stop', async () => {
  const { browser, page, tabId } = await demoCheckout('spend=20000&delay=3000')
  try {
    const popup = await browser.openPopup(tabId)
    await popup.getByRole('button', { name: 'Try coupons' }).click()
    await popup.close()
    await page.bringToFront()
    await page.waitForFunction(() => window.JaniceDemo.state.busy)

    const reopened = await browser.openPopup(tabId)
    await reopened.getByText(/Trying AFF15 \(1 of 1\)|Removing|Reading your checkout/).waitFor()
    assert.equal(await reopened.getByRole('button', { name: 'Stop' }).isVisible(), true)

    await page.bringToFront()
    await waitForPanelDone(page)
    await reopened.getByText('Demo result: You save $15.00 with AFF15').waitFor({ timeout: 10000 })
  } finally {
    await browser.close()
  }
})

test('repeated Try coupons requests start one run with one baseline', async () => {
  const { browser, page, tabId, record } = await demoCheckout('spend=20000&delay=600')
  try {
    const popup = await browser.openPopup(tabId)
    await popup.getByText('Ready to try 1 coupon').waitFor()
    const replies = await popup.evaluate(
      id => Promise.all([1, 2, 3].map(() => chrome.runtime.sendMessage({ type: 'janice:try', tabId: id }))),
      tabId,
    )
    assert.equal(replies.filter(reply => reply.ok).length, 1)
    assert.ok(replies.filter(reply => !reply.ok).every(reply => ['already-starting', 'already-running'].includes(reply.reason)))

    await page.bringToFront()
    await waitForPanelDone(page)
    assert.deepEqual((await record()).applies, ['AFF15'])
  } finally {
    await browser.close()
  }
})

test('Stop while the store is updating: the update settles, then the original code is put back and checked', async () => {
  const { browser, page, tabId, record } = await demoCheckout('spend=20000&existing=SAVE20&delay=1500')
  try {
    const popup = await browser.openPopup(tabId)
    await popup.getByRole('button', { name: 'Try coupons' }).click()
    await page.bringToFront()
    await page.waitForFunction(() => window.JaniceDemo.state.busy)
    await popup.getByRole('button', { name: 'Stop' }).click()

    await page.bringToFront()
    await waitForPanelDone(page)
    const panel = await panelState(page)
    assert.equal(panel.status, 'Demo result: Testing stopped')
    assert.match(panel.result, /Your original coupon state is back: SAVE20 · total \$180\.00 \(checked\)\./)
    assert.deepEqual(await page.evaluate(() => window.JaniceDemo.state.codes), ['SAVE20'])
    assert.ok(!(await record()).applies.slice(1).includes('AFF15'), 'no attempt started after Stop')
  } finally {
    await browser.close()
  }
})

test('reloading the checkout mid-run is reported as interrupted', async () => {
  const { browser, page, tabId } = await demoCheckout('spend=20000&delay=4000')
  try {
    const popup = await browser.openPopup(tabId)
    await popup.getByRole('button', { name: 'Try coupons' }).click()
    await popup.close()
    await page.bringToFront()
    await page.waitForFunction(() => window.JaniceDemo.state.busy)
    await page.reload()

    const reopened = await browser.openPopup(tabId)
    await reopened.getByText('Demo result: Testing was interrupted').waitFor()
    await reopened.getByText(/AFF15 may still be applied\. Check the order summary before paying\./).waitFor()
  } finally {
    await browser.close()
  }
})

test('pages that are not a supported checkout get an explanation and no Try button', async () => {
  const browser = await launch({ extensionDir })
  try {
    const page = await browser.context.newPage()
    await page.goto(`${origin}/not-a-store`)
    const popup = await browser.openPopup(await browser.tabId('http://127.0.0.1/*'))
    await popup.getByText(/This page is not a supported store/).waitFor()
    assert.equal(await popup.getByRole('button', { name: 'Try coupons' }).isVisible(), false)
    assert.equal(await page.locator('janice-coupons-launcher').count(), 0, 'no page button where no store is detected')
  } finally {
    await browser.close()
  }
})

test('an unrelated site is never injected into, even the Demo page served from another host', async () => {
  const browser = await launch({ extensionDir })
  try {
    const page = await browser.context.newPage()
    await page.goto(`${otherOrigin}/demo-checkout/?spend=20000`)
    const tabId = await browser.tabId('http://[::1]/*')
    const popup = await browser.openPopup(tabId)
    await popup.getByText(/This page is not a supported store/).waitFor()

    const answered = await browser.worker.evaluate(
      id => chrome.tabs.sendMessage(id, { type: 'janice:ping' }).then(() => true, () => false),
      tabId,
    )
    assert.equal(answered, false, 'no Janice script runs in that page')
  } finally {
    await browser.close()
  }
})
