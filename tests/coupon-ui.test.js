const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const { read, plain, loadScripts, waitUntil } = require('./helpers/demo.js')

const STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', page: 'checkout', isDemo: false }
const ready = () => ({ ok: true, detection: { store: STORE, supported: true, discovery: { kind: 'promo-field' }, preview: null }, candidates: [{ code: 'AFF15' }], providerError: null, run: null })

function launcher(t, inspect = ready) {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: 'https://sharperimage.com/checkouts/cn/test', runScripts: 'outside-only', pretendToBeVisual: true })
  t.after(() => dom.window.close())
  const sent = []
  dom.window.chrome = { runtime: { sendMessage: async message => {
    sent.push(plain(message))
    return message.type === 'janice:inspect' ? inspect() : { ok: false, reason: 'already-running' }
  } } }
  loadScripts(dom.window, JSON.parse(read('extension/manifest.json')).content_scripts[0].js)
  const host = dom.window.document.querySelector('janice-coupons-launcher')
  const $ = selector => host.shadowRoot.querySelector(selector)
  return { window: dom.window, host, $, sent }
}

test('closed launcher detects dynamically inserted promo fields without runtime requests or opening its card', async t => {
  const { window, host, $, sent } = launcher(t)
  assert.equal(host.dataset.checkout, 'checkout')
  window.document.querySelector('main').innerHTML = '<form><label>Promo code<input name="promo_code" value="private-value"></label><button type="button">Apply coupon</button></form>'
  await waitUntil(() => host.dataset.checkout === 'promo-field')
  assert.match($('.tab').getAttribute('aria-label'), /promo code field detected/)
  assert.equal($('.card').hidden, true)
  assert.deepEqual(sent, [])
  assert.equal(window.document.querySelector('input').value, 'private-value')
})

test('launcher validates shopper codes before start and sends only the entered batch after Try coupons', async t => {
  const { window, $, sent } = launcher(t)
  $('.tab').click()
  await waitUntil(() => !$('.try').hidden)
  assert.equal($('.manual-codes').hidden, false)
  assert.equal($('.manual-codes').firstElementChild.localName, 'summary')
  const input = $('#additional-codes')
  input.value = 'SAVE20, <script>'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal($('.try').disabled, true)
  assert.match($('.codes-error').textContent, /64 letters/)
  $('.try').click()
  assert.deepEqual(sent.map(message => message.type), ['janice:inspect'])

  input.value = 'aff15, SAVE20; SAVE20'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal($('.try').disabled, false)
  assert.equal($('.heading').textContent, '2 coupons found')
  assert.deepEqual([...$('.coupons').querySelectorAll('.ticket')].map(node => node.textContent), ['AFF15', 'SAVE20'])
  assert.match($('.coupons').lastElementChild.querySelector('.offer').textContent, /^Your code/)
  assert.equal(sent.length, 1, 'typing does not start or inspect checkout')
  $('.try').click()
  await waitUntil(() => sent.length === 2)
  assert.deepEqual(sent[1], { type: 'janice:try', additionalCodes: 'aff15, SAVE20; SAVE20' })
})

test('an open launcher refreshes detection after checkout controls change, without moving focus or mutating fields', async t => {
  let hasField = false
  const { window, $, sent } = launcher(t, () => ({ ...ready(), detection: { ...ready().detection, supported: hasField, reason: 'no-discount-field', discovery: { kind: hasField ? 'promo-field' : 'checkout' } } }))
  $('.tab').click()
  await waitUntil(() => sent.length === 1)
  assert.equal($('.try').hidden, true)
  hasField = true
  window.document.querySelector('main').innerHTML = '<form><input aria-label="Promo code"><button type="button">Apply coupon</button></form>'
  const field = window.document.querySelector('input')
  field.focus()
  await waitUntil(() => sent.length === 2 && !$('.try').hidden)
  assert.equal(window.document.activeElement, field)
  assert.equal(field.value, '')
  assert.deepEqual(sent.map(message => message.type), ['janice:inspect', 'janice:inspect'])
})

function popup(t, inspect = ready) {
  const html = read('extension/popup/popup.html')
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(([, src]) => path.posix.join('popup', src))
  const dom = new JSDOM(html.replace(/<script src="[^"]+"><\/script>/g, ''), { url: 'http://localhost/popup/popup.html?tab=9', runScripts: 'outside-only' })
  t.after(() => dom.window.close())
  const sent = []
  dom.window.chrome = {
    runtime: { sendMessage: async message => { sent.push(plain(message)); return message.type === 'janice:inspect' ? inspect() : { ok: false, reason: 'already-running' } } },
    storage: { onChanged: { addListener: () => {} } },
  }
  loadScripts(dom.window, scripts)
  const $ = id => dom.window.document.getElementById(id)
  return { window: dom.window, $, sent }
}

test('popup offers a native codes disclosure, blocks malformed batches and includes valid codes on the explicit start', async t => {
  const { window, $, sent } = popup(t)
  await waitUntil(() => !$('try').hidden)
  assert.equal($('manual-codes').firstElementChild.localName, 'summary')
  assert.match($('hint').textContent, /Promo code field detected/)
  $('additional-codes').value = 'BAD!'
  $('additional-codes').dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal($('try').disabled, true)
  $('try').click()
  assert.deepEqual(sent.map(message => message.type), ['janice:inspect'])

  $('additional-codes').value = 'WELCOME10\nSAVE20'
  $('additional-codes').dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal($('try').disabled, false)
  assert.equal($('status').textContent, 'Ready to try 3 coupons')
  assert.equal($('coupons').lastElementChild.querySelector('.coupon-state').textContent, 'Your code · not tried yet')
  $('try').click()
  await waitUntil(() => sent.length === 2)
  assert.deepEqual(sent[1], { type: 'janice:try', tabId: 9, additionalCodes: 'WELCOME10\nSAVE20' })
})

test('reopened popup restores tried extra codes into the next-run draft and respects later edits', async t => {
  const run = {
    store: STORE,
    status: 'done',
    attempts: ['AFF15', 'Save20', 'NOPE'].map(code => ({ code, outcome: 'rejected' })),
    result: { kind: 'rejected', restoration: 'not-needed', codes: [] },
  }
  const { window, $, sent } = popup(t, () => ({ ...ready(), run }))
  await waitUntil(() => !$('try').hidden)
  assert.equal($('try').textContent, 'Try coupons again')
  assert.equal($('additional-codes').value, 'Save20\nNOPE')
  assert.deepEqual([...$('coupons').querySelectorAll('.ticket')].map(node => node.textContent), ['AFF15', 'Save20', 'NOPE'])
  $('try').click()
  await waitUntil(() => sent.length === 2 && !$('try').disabled)
  assert.deepEqual(sent[1], { type: 'janice:try', tabId: 9, additionalCodes: 'Save20\nNOPE' })

  $('additional-codes').value = 'NEWCODE'
  $('additional-codes').dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.deepEqual([...$('coupons').querySelectorAll('.ticket')].map(node => node.textContent), ['AFF15', 'NEWCODE'])
  $('try').click()
  await waitUntil(() => sent.length === 3)
  assert.deepEqual(sent[2], { type: 'janice:try', tabId: 9, additionalCodes: 'NEWCODE' })
})
