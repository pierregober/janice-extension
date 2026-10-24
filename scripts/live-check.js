#!/usr/bin/env node
/*
 * Live validation on the real Sharper Image checkout (US). Each scenario
 * uses a fresh browser profile and a fresh cart, opens the real checkout,
 * starts Janice Coupons from its popup (or, in page-button, from the card of
 * the button on the page), and records what the extension claimed next to
 * an independent read of the checkout's order summary.
 *
 * It never fills contact, delivery or payment fields, never presses Pay now,
 * and never submits an order. It adds items to a cart (a normal shopper
 * action, nothing is bought), closes the store's sign-up dialog if it covers
 * the page button, and, in the restore-existing scenario, enters AFF15
 * itself first to play a shopper who already has a code applied.
 *
 *   npm run check:live                          # the default scenario set
 *   npm run check:live -- apply stop --headed   # chosen scenarios, visible browser
 *   npm run check:live -- --evidence <dir>      # where to write the report
 *   npm run check:live -- --shared-cart         # one cart for every scenario (gentler on the
 *                                               # store's rate limits); a setup step resets the
 *                                               # codes through the store's own controls
 *
 * See tests/e2e/harness.js for how the extension is loaded for automation.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { testCopy, launch, panelState, waitForPanelDone } = require('../tests/e2e/harness.js')

const STORE = 'https://sharperimage.com'
const DATASET = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'data', 'mock-coupons.json'), 'utf8'))
const ITEMS = {
  over: { variantId: 53427141411105, note: 'Glass Topper Cocktail Smoker Set, $159.99 when inspected' },
  under: { variantId: 53069256130849, note: 'Acrylic Poker set with 200 Casino Grade Chips, $149.99 when inspected' },
}
// A made-up code, only in temporary copies of the dataset, to observe a real rejection.
const MADE_UP = {
  id: 'live-check-made-up',
  storeId: 'sharper-image-us',
  code: 'JANICETEST0',
  offerText: 'Made-up code used only by scripts/live-check.js to observe a real rejection',
}

const SCENARIOS = {
  apply: { item: 'over', describe: 'AFF15 on a cart over $150; the best verified result is left applied' },
  'below-minimum': { item: 'under', describe: "AFF15 on a $149.99 cart; the store decides, not the advertised minimum" },
  stop: { item: 'over', describe: 'Stop pressed while the store is applying AFF15', stopWhenBusy: true },
  repeat: { item: 'over', describe: 'Three Try coupons requests at once', repeat: 3 },
  reopen: { item: 'over', describe: 'Popup closed right after Try coupons and reopened', reopen: true },
  narrow: { item: 'over', describe: 'A 390 px wide window, where the order summary starts collapsed', viewport: { width: 390, height: 844 } },
  'two-codes': { item: 'over', describe: 'AFF15 and a made-up code: a real rejection, then the winner re-applied and checked', candidates: ['AFF15', 'JANICETEST0'] },
  'restore-existing': { item: 'over', describe: 'Shopper already applied AFF15; only the made-up code is tried; AFF15 must be put back', candidates: ['JANICETEST0'], preApply: 'AFF15' },
  already: { item: 'over', describe: 'AFF15 already applied by the shopper; nothing new to try', preApply: 'AFF15' },
  'page-button': { item: 'over', describe: "The page button on a store page and at checkout; Try coupons from its card", launcher: true },
}
const DEFAULT_SET = ['apply', 'below-minimum', 'stop', 'repeat', 'reopen', 'narrow', 'two-codes', 'restore-existing', 'already']

function datasetFor(codes) {
  if (!codes) return null
  const coupons = codes.map(code => (code === MADE_UP.code ? MADE_UP : DATASET.coupons.find(coupon => coupon.code === code)))
  return { ...DATASET, coupons }
}

// An independent read of the visible cost summary and applied codes, written apart from the adapter.
function readSummary(page) {
  return page.evaluate(() => {
    const shown = element => Boolean(element) && element.checkVisibility()
    const clean = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const tables = [...document.querySelectorAll('[role="table"]')].filter(element => /^MoneyLine-Heading/.test(element.getAttribute('aria-labelledby') ?? ''))
    const table = tables.find(shown) ?? tables[0]
    const rows = table
      ? [...table.querySelectorAll('[role="row"]')]
          .map(row => [clean(row.querySelector('[role="rowheader"]')), clean(row.querySelector('[role="cell"] [aria-hidden="true"]') ?? row.querySelector('[role="cell"]'))])
          .filter(([header]) => header)
      : []
    const codes = [...new Set([...document.querySelectorAll('#reduction-tags button[aria-label^="Remove "]')].map(button => button.getAttribute('aria-label').slice(7)))]
    return { rows, codes, url: location.pathname.replace(/\/cn\/[^/]+/, '/cn/<token>') }
  })
}

async function buildCart(page, variantId) {
  await page.goto(`${STORE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const cart = await page.evaluate(async id => {
    await fetch('/cart/clear.js', { method: 'POST', headers: { Accept: 'application/json' } })
    const added = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id, quantity: 1 }] }),
    })
    const current = await (await fetch('/cart.js', { headers: { Accept: 'application/json' } })).json()
    return { addStatus: added.status, currency: current.currency, itemCount: current.item_count, totalMinor: current.total_price, titles: current.items.map(item => item.title) }
  }, variantId)
  await page.goto(`${STORE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[name="reductions"]', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(2500)
  return cart
}

// Closes the store's sign-up dialog, as a shopper would, if it is open over the page.
async function dismissSignUp(page) {
  const dialog = page.locator('[role="dialog"][aria-label="POPUP Form"]').filter({ visible: true })
  if ((await dialog.count()) === 0) return false
  await dialog.getByRole('button', { name: /close/i }).first().click()
  await dialog.waitFor({ state: 'hidden', timeout: 10000 })
  return true
}

// Hovers the page button and reads its card once it has loaded.
async function openCard(page) {
  const launcher = page.locator('janice-coupons-launcher')
  await launcher.locator('.tab').waitFor({ timeout: 30000 })
  await dismissSignUp(page)
  await launcher.locator('.tab').hover()
  await launcher.locator('.heading').filter({ hasNotText: 'Looking for coupons…' }).waitFor({ timeout: 20000 })
  return launcher.evaluate(host => {
    const root = host.shadowRoot
    const text = selector => root.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? ''
    const shown = selector => Boolean(root.querySelector(selector)) && !root.querySelector(selector).hidden
    return {
      tab: root.querySelector('.tab').getAttribute('aria-label'),
      heading: text('.heading'),
      sub: shown('.sub') ? text('.sub') : null,
      coupons: [...root.querySelectorAll('.coupon')].map(row => row.textContent.replace(/\s+/g, ' ').trim()),
      text: shown('.text') ? text('.text') : null,
      action: shown('.try') ? text('.try') : shown('.go') ? `${text('.go')} → ${root.querySelector('.go').getAttribute('href')}` : null,
    }
  })
}

// The open card with the button under it, and whatever of the page is behind them. The card's fade-in is
// finished first: a capture mid-animation shows it see-through.
async function cardScreenshot(page, file) {
  const card = await page.locator('janice-coupons-launcher .card').boundingBox()
  const tab = await page.locator('janice-coupons-launcher .tab').boundingBox()
  const x = Math.max(0, card.x - 12)
  const y = Math.max(0, card.y - 40)
  const clip = { x, y, width: page.viewportSize().width - x, height: tab.y + tab.height + 12 - y }
  await page.screenshot({ path: file, clip, animations: 'disabled' })
}

// Plays a shopper entering a code in the store's own field before Janice runs.
async function shopperApplies(page, code) {
  const field = page.locator('input[name="reductions"]').filter({ visible: true }).first()
  await field.fill(code)
  await page.locator('button[aria-label="Apply Discount Code"]').filter({ visible: true }).first().click()
  await page.locator(`#reduction-tags button[aria-label="Remove ${code}"]`).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(2000)
}

// Plays a shopper removing every applied code with the store's own Remove buttons.
async function shopperRemovesCodes(page) {
  for (let guard = 0; guard < 5; guard++) {
    const remove = page.locator('#reduction-tags button[aria-label^="Remove "]').filter({ visible: true }).first()
    if ((await remove.count()) === 0) return
    await remove.click()
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20000 })
    await page.waitForTimeout(2000)
  }
}

// Opens the existing cart's checkout and sets the codes a scenario starts from.
async function prepareSharedCart(page, scenario) {
  await page.goto(`${STORE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[name="reductions"]', { state: 'attached', timeout: 60000 })
  await page.waitForTimeout(2500)
  const applied = await page.evaluate(() => [...document.querySelectorAll('#reduction-tags button[aria-label^="Remove "]')].map(button => button.getAttribute('aria-label').slice(7)))
  if (scenario.preApply && applied.length === 1 && applied[0] === scenario.preApply) return
  if (page.viewportSize().width < 1000) throw new Error('reset codes at desktop width before a narrow scenario')
  await shopperRemovesCodes(page)
  if (scenario.preApply) await shopperApplies(page, scenario.preApply)
}

async function runScenario(name, evidenceDir, sharedProfile) {
  const scenario = SCENARIOS[name]
  const extensionDir = testCopy({ hostPermissions: [`${STORE}/*`], dataset: datasetFor(scenario.candidates) })
  const headless = !process.argv.includes('--headed')
  if (sharedProfile && scenario.viewport) {
    // Reset the codes at desktop width first: the narrow layout hides the Remove buttons.
    const setup = await launch({ extensionDir, headless, profileDir: sharedProfile })
    try {
      await prepareSharedCart(await setup.context.newPage(), { ...scenario, viewport: null })
    } finally {
      await setup.close()
    }
  }
  const browser = await launch({ extensionDir, viewport: scenario.viewport, headless, profileDir: sharedProfile })
  const report = { scenario: name, describe: scenario.describe, startedAt: new Date().toISOString(), browser: `Chrome for Testing ${browser.browserVersion}`, item: ITEMS[scenario.item].note, sharedCart: Boolean(sharedProfile) }

  try {
    const page = await browser.context.newPage()
    if (sharedProfile && fs.existsSync(path.join(sharedProfile, '.janice-cart'))) {
      report.cart = JSON.parse(fs.readFileSync(path.join(sharedProfile, '.janice-cart'), 'utf8'))
      if (!scenario.viewport) await prepareSharedCart(page, scenario)
      else {
        await page.goto(`${STORE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForSelector('input[name="reductions"]', { state: 'attached', timeout: 60000 })
        await page.waitForTimeout(2500)
      }
    } else {
      if (scenario.launcher) {
        await page.goto(`${STORE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.locator('janice-coupons-launcher .tab').waitFor({ timeout: 30000 })
        await dismissSignUp(page)
        await page.screenshot({ path: path.join(evidenceDir, `${name}-store-page.png`), animations: 'disabled' })
        report.storePageCard = await openCard(page)
        await cardScreenshot(page, path.join(evidenceDir, `${name}-store-card.png`))
      }
      report.cart = await buildCart(page, ITEMS[scenario.item].variantId)
      if (sharedProfile) fs.writeFileSync(path.join(sharedProfile, '.janice-cart'), JSON.stringify(report.cart))
      if (scenario.preApply) await shopperApplies(page, scenario.preApply)
    }
    report.before = await readSummary(page)

    const tabId = await browser.tabId(`${STORE}/*`)
    let popup = null
    if (scenario.launcher) {
      await page.screenshot({ path: path.join(evidenceDir, `${name}-checkout-page.png`), animations: 'disabled' })
      report.cardBefore = await openCard(page)
      await cardScreenshot(page, path.join(evidenceDir, `${name}-card-before.png`))
      report.pageUnchangedByCard = JSON.stringify(await readSummary(page)) === JSON.stringify(report.before) && (await panelState(page)) === null
    } else {
      popup = await browser.openPopup(tabId)
      await popup.locator('#status').filter({ hasNotText: 'Checking this page…' }).waitFor({ timeout: 20000 })
      report.popupBefore = {
        status: (await popup.locator('#status').innerText()).trim(),
        store: (await popup.locator('#store-meta').innerText()).trim(),
        coupons: (await popup.locator('#coupons').innerText()).replace(/\s+/g, ' ').trim(),
      }
      await popup.locator('main').screenshot({ path: path.join(evidenceDir, `${name}-popup-before.png`) })
      report.pageUnchangedByPopup = JSON.stringify(await readSummary(page)) === JSON.stringify(report.before) && (await panelState(page)) === null
    }

    if (scenario.launcher) {
      await page.locator('janice-coupons-launcher').getByRole('button', { name: 'Try coupons' }).click()
    } else if (scenario.repeat) {
      report.startReplies = await popup.evaluate(
        ({ id, count }) => Promise.all(Array.from({ length: count }, () => chrome.runtime.sendMessage({ type: 'janice:try', tabId: id }))),
        { id: tabId, count: scenario.repeat },
      )
      report.startReplies = report.startReplies.map(reply => ({ ok: reply.ok, reason: reply.reason ?? null }))
    } else {
      await popup.getByRole('button', { name: /Try coupons/ }).click()
    }
    if (scenario.reopen) {
      await popup.close()
      popup = await browser.openPopup(tabId)
      report.popupReopened = (await popup.locator('#status').innerText()).trim()
    }
    if (scenario.stopWhenBusy) {
      await page.bringToFront()
      await page.waitForSelector('[aria-busy="true"]', { timeout: 20000 })
      await popup.getByRole('button', { name: 'Stop' }).click()
      report.stopPressedAt = new Date().toISOString()
    }

    await page.bringToFront()
    await waitForPanelDone(page, 90000)
    const run = await browser.storedRun(tabId)
    report.panel = await panelState(page)
    report.run = { baseline: run.baseline, attempts: run.attempts, result: run.result }
    await page.waitForTimeout(1500)
    report.after = await readSummary(page)
    await page.locator('janice-coupons-panel').screenshot({ path: path.join(evidenceDir, `${name}-panel.png`) })
    const summary = page.locator('[role="table"][aria-labelledby^="MoneyLine-Heading"]').filter({ visible: true }).first()
    await summary.screenshot({ path: path.join(evidenceDir, `${name}-cost-summary.png`) })

    if (scenario.launcher) {
      report.buttonHiddenDuringPanel = !(await page.locator('janice-coupons-launcher').isVisible())
      await page.locator('janice-coupons-panel').getByRole('button', { name: 'Close' }).click()
      report.cardAfter = await openCard(page)
      await cardScreenshot(page, path.join(evidenceDir, `${name}-card-after.png`))
    }

    const reopened = await browser.openPopup(tabId)
    await reopened.locator('#status').filter({ hasNotText: 'Checking this page…' }).waitFor({ timeout: 20000 })
    report.popupAfter = (await reopened.locator('#status').innerText()).trim()
    await reopened.locator('main').screenshot({ path: path.join(evidenceDir, `${name}-popup-after.png`) })
  } catch (error) {
    report.error = String(error?.stack ?? error)
  } finally {
    report.finishedAt = new Date().toISOString()
    await browser.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  }
  fs.writeFileSync(path.join(evidenceDir, `${name}.json`), JSON.stringify(report, null, 2))
  return report
}

async function main() {
  const args = process.argv.slice(2)
  const evidenceIndex = args.indexOf('--evidence')
  const evidenceDir = path.resolve(evidenceIndex === -1 ? path.join('test-results', 'live') : args[evidenceIndex + 1])
  const chosen = args.filter((arg, index) => !arg.startsWith('--') && index !== evidenceIndex + 1)
  const names = chosen.length ? chosen : DEFAULT_SET
  const unknown = names.filter(name => !SCENARIOS[name])
  if (unknown.length) throw new Error(`unknown scenario(s): ${unknown.join(', ')}; known: ${Object.keys(SCENARIOS).join(', ')}`)

  fs.mkdirSync(evidenceDir, { recursive: true })
  const sharedProfile = args.includes('--shared-cart') ? fs.mkdtempSync(path.join(os.tmpdir(), 'janice-live-cart-')) : null
  if (sharedProfile && new Set(names.map(name => SCENARIOS[name].item)).size > 1) {
    throw new Error('--shared-cart needs scenarios that use the same item (below-minimum uses another)')
  }
  for (const name of names) {
    const report = await runScenario(name, evidenceDir, sharedProfile)
    const result = report.run?.result
    console.log(
      `${name}: ${report.error ? `ERROR ${report.error.split('\n')[0]}` : `${result.kind}${result.reason ? ` (${result.reason})` : ''} · restoration ${result.restoration} · panel “${report.panel.status}” · codes now ${JSON.stringify(report.after.codes)}`}`,
    )
  }
  if (sharedProfile) fs.rmSync(sharedProfile, { recursive: true, force: true })
  console.log(`Evidence: ${evidenceDir}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
