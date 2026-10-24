// The animated outline on a deterministic Demo drawer. Store requests are
// routed to fixture files; animation/radius checks never enter or apply codes.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { testCopy, launch } = require('./harness.js')

const FIXTURE = path.join(__dirname, '../../fixtures/cart-drawer')

async function fixture(t) {
  const extensionDir = testCopy({ hostPermissions: ['https://sharperimage.com/*'] })
  const browser = await launch({ extensionDir })
  t.after(async () => {
    await browser.close()
    fs.rmSync(extensionDir, { recursive: true, force: true })
  })
  await browser.context.route('https://sharperimage.com/**', route => {
    const pathname = new URL(route.request().url()).pathname
    const name = pathname.endsWith('.css') ? 'cart-drawer.css' : pathname.endsWith('.js') ? 'cart-drawer.js' : 'index.html'
    return route.fulfill({ status: 200, contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html', body: fs.readFileSync(path.join(FIXTURE, name)) })
  })
  const page = await browser.context.newPage()
  await page.goto('https://sharperimage.com/rainbow-outline-fixture')
  const field = page.getByLabel('Discount code', { exact: true })
  await field.evaluate(input => {
    input.style.cssText = 'width:240px;height:40px;min-height:0;padding:0;box-sizing:border-box;border:1px solid #81748f;border-radius:0'
    window.rainbowInputEvents = 0
    for (const type of ['input', 'change']) input.addEventListener(type, () => { window.rainbowInputEvents++ })
  })
  await page.getByRole('button', { name: 'Open cart', exact: true }).click()
  const outline = page.locator('janice-inline-coupon .coupon-outline')
  await outline.waitFor()
  // Let the fixture's 260ms drawer-opening transform finish before comparing
  // fixed geometry with the independently animated gradient layer.
  await page.waitForTimeout(350)
  return { page, field, outline }
}

function pseudoState(outline) {
  return outline.evaluate(element => {
    const style = getComputedStyle(element, '::before')
    return { animationName: style.animationName, transform: style.transform, display: style.display }
  })
}

async function quietCheckout(page, field) {
  assert.equal(await field.inputValue(), '')
  assert.equal(await page.evaluate(() => window.rainbowInputEvents), 0)
  assert.equal(await page.evaluate(() => window.JaniceDrawerDemo.record.applies), 0)
}

test('Demo outline: rainbow travels around a stationary field and respects reduced motion and forced colors', async t => {
  const { page, field, outline } = await fixture(t)
  const beforeBox = await outline.boundingBox()
  const before = await pseudoState(outline)
  assert.notEqual(before.animationName, 'none', 'the gradient layer has an animation')
  const screenshots = path.join(__dirname, '../../test-results/rainbow-outline')
  fs.mkdirSync(screenshots, { recursive: true })
  const inputBox = await field.boundingBox()
  const clip = { x: inputBox.x - 8, y: inputBox.y - 8, width: inputBox.width + 16, height: inputBox.height + 16 }
  await page.screenshot({ path: path.join(screenshots, 'animation-first.png'), clip })
  await page.waitForTimeout(350)
  const after = await pseudoState(outline)
  assert.notEqual(after.transform, before.transform, 'the rainbow gradient advances around the border')
  assert.deepEqual(await outline.boundingBox(), beforeBox, 'the outline shape does not rotate or move')
  await page.screenshot({ path: path.join(screenshots, 'animation-second.png'), clip })
  await quietCheckout(page, field)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(40)
  const reduced = await pseudoState(outline)
  assert.equal(reduced.animationName, 'none', 'reduced motion keeps a static rainbow')
  await page.waitForTimeout(180)
  assert.equal((await pseudoState(outline)).transform, reduced.transform)

  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' })
  await page.waitForTimeout(40)
  const forced = await pseudoState(outline)
  assert.ok(forced.display === 'none' || forced.animationName === 'none', 'forced colors uses a static system-color outline')
  await quietCheckout(page, field)
})

test('Demo outline: corners match sharp, pill, asymmetric elliptical and CSS-normalized input radii', async t => {
  const { page, field, outline } = await fixture(t)
  const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
  const cases = [
    { radius: '0px', expected: [[0, 0], [0, 0], [0, 0], [0, 0]] },
    { radius: '50%', expected: [[123, 23], [123, 23], [123, 23], [123, 23]] },
    { radius: '4px 12px 20px 0 / 8px 16px 24px 0', expected: [[7, 11], [15, 19], [23, 27], [0, 0]] },
    { radius: '80px', expected: [[23, 23], [23, 23], [23, 23], [23, 23]] },
  ]
  for (const { radius, expected } of cases) {
    await field.evaluate((input, value) => { input.style.borderRadius = value }, radius)
    await page.waitForFunction(({ corners, expected }) => {
      const ring = document.querySelector('janice-inline-coupon')?.shadowRoot.querySelector('.coupon-outline')
      if (!ring) return false
      return corners.every((corner, index) => {
        const values = getComputedStyle(ring)[corner].split(/\s+/).map(Number.parseFloat)
        const x = values[0]
        const y = values[1] ?? x
        return Math.abs(x - expected[index][0]) < 0.1 && Math.abs(y - expected[index][1]) < 0.1
      })
    }, { corners, expected }, { timeout: 3000 })
    const inputBox = await field.boundingBox()
    const ringBox = await outline.boundingBox()
    assert.equal(ringBox.width, inputBox.width + 6, radius)
    assert.equal(ringBox.height, inputBox.height + 6, radius)
  }
  await quietCheckout(page, field)
})
