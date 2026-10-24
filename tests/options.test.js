// Janice's settings page (options/options.html) in jsdom, with chrome.storage.local in memory: the page
// button's snoozes, each with its way back, and remembering or clearing prices for tips.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const { read, loadScripts, waitUntil } = require('./helpers/demo.js')

function openSettings(t, entries = {}) {
  const source = read('extension/options/options.html')
  // The page's own script list, so these tests load exactly what it does.
  const scripts = [...source.matchAll(/<script src="([^"]+)"><\/script>/g)].map(([, src]) => path.posix.join('options', src))
  const dom = new JSDOM(source.replace(/<script src="[^"]+"><\/script>/g, ''), { url: 'http://localhost/options/options.html', runScripts: 'outside-only' })
  t.after(() => dom.window.close())
  const stored = structuredClone(entries)
  const listeners = new Set()
  const local = {
    get: async keys => Object.fromEntries([keys].flat().filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
    async set(items) {
      const changes = {}
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: stored[key], newValue: structuredClone(value) }
        stored[key] = structuredClone(value)
      }
      for (const listener of listeners) listener(changes, 'local')
    },
  }
  dom.window.chrome = { storage: { local, onChanged: { addListener: listener => listeners.add(listener) } } }
  loadScripts(dom.window, scripts)
  const { document } = dom.window
  const $ = selector => document.querySelector(selector)
  return {
    document,
    $,
    stored,
    local,
    text: id => document.getElementById(id).textContent,
    shown: id => !document.getElementById(id).hidden,
    stores: () => [...document.querySelectorAll('#snoozed-stores li span')].map(name => name.textContent),
  }
}

test('settings page: the page button snoozed everywhere and on a store, each with its way back, following store tabs', async t => {
  const until = Date.now() + 5 * 60 * 60 * 1000
  const page = openSettings(t, { 'launcher:snooze': { until, stores: [{ id: 'sharper-image-us', name: 'Sharper Image' }] } })
  await waitUntil(() => page.text('everywhere') !== 'Showing')
  assert.equal(page.document.title, 'Janice settings')
  assert.match(page.text('everywhere'), /^Snoozed until \w{3}, \w{3} \d{1,2}, \d{1,2}:\d{2}\s(AM|PM)$/)
  assert.equal(page.shown('wake-everywhere'), true)
  assert.deepEqual(page.stores(), ['Sharper Image'])
  assert.equal(page.$('#snoozed-stores button').getAttribute('aria-label'), 'Show the page button on Sharper Image again')
  assert.equal(page.shown('no-stores'), false)

  page.$('#snoozed-stores button').click()
  await waitUntil(() => page.shown('no-stores'))
  assert.deepEqual(page.stored['launcher:snooze'].stores, [])
  assert.equal(page.text('status'), 'The page button shows on Sharper Image again.')
  assert.equal(page.document.activeElement.id, 'button-title', 'focus stays in the section as the button goes')

  page.$('#wake-everywhere').click()
  await waitUntil(() => page.text('everywhere') === 'Showing')
  assert.deepEqual(page.stored['launcher:snooze'], { until: null, stores: [] })
  assert.equal(page.shown('wake-everywhere'), false)
  assert.equal(page.text('status'), 'The page button shows on every store again.')

  // Snoozed in a store tab while the settings are open.
  await page.local.set({ 'launcher:snooze': { until: null, stores: [{ id: 'sharper-image-us', name: 'Sharper Image' }] } })
  await waitUntil(() => page.stores().length === 1)
})

test('settings page: Remember prices of products I view, a native switch, and Clear price history', async t => {
  const page = openSettings(t, { 'tips:prices': { quadra: [{ day: '2026-10-24', priceMinor: 41999, currency: 'USD' }], other: [] } })
  await waitUntil(() => page.text('prices') === 'Prices kept for 2 products')
  const remember = page.$('#remember')
  assert.equal(remember.checked, true, 'on unless turned off')
  assert.equal(remember.hasAttribute('switch'), true)
  assert.equal(page.$('label[for="remember"]').textContent, 'Remember prices of products I view')

  remember.click()
  await waitUntil(() => page.stored['tips:settings']?.rememberPrices === false)
  assert.equal(page.text('status'), "Janice won't remember new prices.")
  page.$('#clear-prices').click()
  await waitUntil(() => page.text('prices') === 'No prices kept')
  assert.deepEqual(page.stored['tips:prices'], {})
  assert.equal(page.text('status'), 'Price history cleared.')

  // Turned off, it stays off when the page opens again.
  const later = openSettings(t, { 'tips:settings': { rememberPrices: false } })
  await waitUntil(() => later.$('#remember').checked === false)
})
