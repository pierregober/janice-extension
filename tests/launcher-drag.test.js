// Moving the page button along the right edge: dragging its tab, or the arrow
// keys while it has focus, and the spot it keeps in chrome.storage.local.
// jsdom lays nothing out, so the button's box is worked out here from its
// `top`; tests/e2e/launcher-drag.test.js drags the real one in Chromium.
const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

const { read, loadScripts, waitUntil } = require('./helpers/demo.js')

const LAUNCHER_SCRIPTS = JSON.parse(read('extension/manifest.json')).content_scripts[0].js
const KEY = 'launcher:position'
const WINDOW = 768 // jsdom's innerHeight
const TAB = 48
const HOME = WINDOW - 88 - TAB // the default spot, 88px above the bottom
const LOWEST = WINDOW - 8 - TAB
const shareOf = top => (top - 8) / (WINDOW - TAB - 16)

/** A store page with the page button, its storage in memory (starting with `kept`), and its box from its top. */
function openPage(kept = {}) {
  const { window } = new JSDOM('<!doctype html><html lang="en-US"><body><main><h1>Sharper Image</h1></main></body></html>', {
    url: 'https://sharperimage.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const stored = structuredClone(kept)
  const listeners = new Set()
  window.chrome = {
    runtime: {
      id: 'janice-test',
      sendMessage: async () => ({
        ok: true,
        detection: { store: { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'store' }, supported: false, reason: 'not-checkout', run: null },
        candidates: [],
        providerError: null,
        run: null,
      }),
    },
    storage: {
      local: {
        get: async keys => Object.fromEntries([keys].flat().filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
        async set(items) {
          for (const [key, value] of Object.entries(items)) stored[key] = structuredClone(value)
        },
      },
      onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
    },
  }
  loadScripts(window, LAUNCHER_SCRIPTS)

  const host = window.document.querySelector('janice-coupons-launcher')
  const $ = selector => host.shadowRoot.querySelector(selector)
  const top = () => {
    const value = Number.parseFloat(host.style.getPropertyValue('top'))
    return Number.isNaN(value) ? HOME : value
  }
  const box = () => ({ top: top(), bottom: top() + TAB, height: TAB })
  host.getBoundingClientRect = box
  $('.tab').getBoundingClientRect = box
  const pointer = (type, clientY, init = {}) =>
    $('.tab').dispatchEvent(new window.PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientY, bubbles: true, composed: true, ...init }))
  const key = name => $('.tab').dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, composed: true }))
  const isShown = () => host.style.getPropertyValue('visibility') === ''
  return { window, host, $, top, stored, listeners, pointer, key, isShown, isOpen: () => !$('.card').hidden }
}

test('page button: dragging its tab slides it along the right edge, inside the window, and keeps the spot', async () => {
  const page = openPage()
  const { $, top, pointer } = page
  await waitUntil(page.isShown)
  assert.equal(top(), HOME, 'nothing kept: the default spot')
  const right = page.host.style.getPropertyValue('right')

  // Hovering opens the card; pressing and moving a couple of pixels is still a click.
  $('.tab').dispatchEvent(new page.window.PointerEvent('pointerenter', { pointerType: 'mouse' }))
  assert.equal(page.isOpen(), true)
  pointer('pointerdown', HOME + 10)
  pointer('pointermove', HOME + 12)
  assert.equal(top(), HOME)
  assert.equal(page.isOpen(), true)

  // Further, it is a drag: the card closes and the button follows the pointer, held where it was grabbed.
  pointer('pointermove', 300)
  assert.equal(page.isOpen(), false)
  assert.equal($('.tab').classList.contains('dragging'), true)
  assert.equal(top(), 290)
  pointer('pointermove', -200)
  assert.equal(top(), 8, 'never above the window')
  pointer('pointermove', 5000)
  assert.equal(top(), LOWEST, 'never below it')
  pointer('pointermove', 410)
  assert.equal(top(), 400)
  assert.equal(page.host.style.getPropertyValue('right'), right, 'still on the right edge')
  pointer('pointerup', 410)
  assert.equal($('.tab').classList.contains('dragging'), false)
  await waitUntil(() => page.stored[KEY])
  assert.deepEqual(page.stored[KEY], { share: shareOf(400) })

  // The click that ends the drag leaves the card closed; the next click opens it.
  $('.tab').click()
  assert.equal(page.isOpen(), false)
  await new Promise(resolve => page.window.setTimeout(resolve, 0))
  $('.tab').click()
  assert.equal(page.isOpen(), true)

  // Another mouse button does not drag it.
  pointer('pointerdown', 410, { button: 2 })
  pointer('pointermove', 100, { button: 2 })
  assert.equal(top(), 400)
})

test('page button: the arrow keys move it too; a kept spot is applied before it shows; a move in another tab follows', async () => {
  const page = openPage({ [KEY]: { share: 0 } })
  const { $, top, key } = page
  assert.equal(page.isShown(), false, 'out of sight until placed')
  await waitUntil(page.isShown)
  assert.equal(top(), 8)
  const hint = page.host.shadowRoot.getElementById($('.tab').getAttribute('aria-describedby'))
  assert.equal(hint.textContent, 'Drag it, or use the up and down arrow keys, to move it along the edge of the window.')

  // High up, the card opens below the tab, leaving room for its store tile. jsdom lays nothing out, so the card
  // has no height here; tests/e2e/card-fit.test.js checks in Chromium that it always shows whole.
  $('.tab').click()
  assert.equal(page.isOpen(), true)
  assert.equal($('.card').dataset.side, 'below')
  assert.equal($('.card').style.getPropertyValue('--tile'), '28px')
  assert.equal($('.card').style.getPropertyValue('--room'), '', 'not capped')

  assert.equal(key('ArrowDown'), false, 'the key is handled')
  assert.equal(top(), 23)
  await waitUntil(() => page.stored[KEY]?.share === shareOf(23))
  key('ArrowUp')
  key('ArrowUp')
  assert.equal(top(), 8, 'still inside the window')
  assert.equal(key('ArrowLeft'), true, 'other keys are left alone')
  assert.equal(top(), 8)

  // Moved to the bottom in another tab: this one follows, and its card goes back above the tab.
  for (const listener of page.listeners) listener({ [KEY]: { newValue: { share: 1 } } }, 'local')
  assert.equal(top(), LOWEST)
  assert.equal($('.card').dataset.side, 'above')
})
