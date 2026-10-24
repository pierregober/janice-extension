const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { loadScripts, waitUntil } = require('./helpers/demo.js')

const total = amountMinor => ({ amountMinor, currency: 'USD', basis: 'cart-total', shippingIncluded: false, taxIncluded: false })
const state = patch => ({
  runId: 'drawer-run', updatedAt: 10, status: 'running', phase: 'testing',
  store: { id: 'sharper-image-us', name: 'Sharper Image', isDemo: false },
  message: 'Trying AFF15 (1 of 2)…', progress: { code: 'AFF15', index: 1, count: 2 },
  baseline: { total: total(20000), codes: [] }, attempts: [], result: null,
  ...patch,
})

function setup(t, callbacks = {}) {
  const dom = new JSDOM('<!doctype html><body><section id="shopify-section-cart-drawer"><form><label>Discount code<input name="discount_code"></label><button type="submit">Apply</button></form></section></body>', {
    url: 'https://sharperimage.com/', pretendToBeVisual: true, runScripts: 'outside-only',
  })
  const { window } = dom
  loadScripts(window, ['shared/money.js', 'shared/messages.js', 'content/inline-coupon.js'])
  const input = window.document.querySelector('input')
  const box = () => ({ left: 100, right: 400, top: 140, bottom: 180, width: 300, height: 40 })
  input.getBoundingClientRect = box
  const control = window.Janice.createInlineCoupon({ window, onTry: async () => ({ ok: true }), onStop: async () => ({ ok: true }), ...callbacks })
  const $ = selector => control.element.shadowRoot.querySelector(selector)
  let inputs = 0
  let submits = 0
  input.addEventListener('input', () => { inputs++ })
  window.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submits++ })
  const sync = (patch = {}) => control.sync({ inputs: [input], candidates: [{ code: 'AFF15' }], ...patch })
  t.after(() => { control.destroy(); window.close() })
  sync()
  return { window, input, control, $, sync, box, seen: () => ({ inputs, submits }) }
}

test('managed Use code hands off once, never fills locally, and keeps newer progress over a late start reply', async t => {
  let resolveStart
  let starts = 0
  const app = setup(t, { onTry: () => { starts++; return new Promise(resolve => { resolveStart = resolve }) } })
  Object.defineProperty(app.input, 'value', { get() { throw new Error('managed view must not read the field value') } })
  app.$('.use-code').click()
  assert.equal(starts, 1)
  assert.equal(app.$('.use-code').textContent, 'Starting…')
  assert.equal(app.$('.use-code').disabled, true)
  app.$('.use-code').click()
  assert.equal(starts, 1)
  app.control.renderRun(state({ attempts: [{ code: 'NOPE', outcome: 'rejected', storeMessage: 'Invalid coupon' }] }))
  assert.equal(app.$('.use-code').textContent, 'Stop')
  assert.equal(app.$('.use-code').disabled, false)
  assert.match(app.$('.coupon-status').textContent, /Trying AFF15.*NOPE: not accepted/)
  app.input.dispatchEvent(new app.window.Event('input', { bubbles: true }))
  assert.equal(app.$('.use-code').textContent, 'Stop', 'adapter entry events do not restore the idle label')
  resolveStart({ ok: true, run: state({ status: 'running', phase: 'checking', message: 'Reading your cart…', attempts: [] }) })
  await waitUntil(() => app.$('.use-code').textContent === 'Stop')
  await new Promise(resolve => app.window.setTimeout(resolve, 0))
  assert.match(app.$('.coupon-status').textContent, /Trying AFF15.*NOPE: not accepted/, 'same-timestamp late checking reply is ignored')
  assert.deepEqual(app.seen(), { inputs: 1, submits: 0 }, 'only the test-dispatched adapter event occurred')
})

test('managed Stop waits for authoritative completion and does not fake a finished result', async t => {
  let resolveStop
  let stops = 0
  const app = setup(t, { onStop: () => { stops++; return new Promise(resolve => { resolveStop = resolve }) } })
  app.control.renderRun(state())
  app.$('.use-code').click()
  assert.equal(stops, 1)
  assert.equal(app.$('.use-code').textContent, 'Stopping…')
  assert.equal(app.$('.use-code').disabled, true)
  app.$('.use-code').click()
  assert.equal(stops, 1)
  resolveStop({ ok: true })
  await new Promise(resolve => app.window.setTimeout(resolve, 0))
  assert.equal(app.$('.use-code').textContent, 'Stopping…', 'an acknowledgement is not a completed restoration')
  app.control.renderRun(state({ updatedAt: 20, status: 'done', result: { kind: 'stopped', restoration: 'verified', codes: [], finalTotal: total(20000) } }))
  assert.equal(app.$('.use-code').textContent, 'Try again')
  assert.equal(app.$('.use-code').disabled, false)
  assert.match(app.$('.coupon-status').textContent, /Testing stopped/)
  app.control.renderRun(state({ updatedAt: 10 }))
  assert.equal(app.$('.use-code').textContent, 'Try again', 'an older run update cannot reactivate the control')
  assert.deepEqual(app.seen(), { inputs: 0, submits: 0 })
})

test('managed progress and honest restoration failures survive a replaced field and new candidate list', t => {
  const app = setup(t)
  app.control.renderRun(state({ message: 'Trying SAVE20 (2 of 2)…', progress: { code: 'SAVE20', index: 2, count: 2 } }))
  const next = app.window.document.createElement('input')
  next.name = 'discount_code'
  next.getBoundingClientRect = app.box
  app.input.replaceWith(next)
  app.control.sync({ inputs: [next], candidates: [{ code: 'ANOTHER' }] })
  assert.equal(app.$('.use-code').textContent, 'Stop')
  assert.match(app.$('.coupon-status').textContent, /Trying SAVE20/)
  app.control.renderRun(state({ updatedAt: 30, status: 'done', attempts: [{ code: 'SAVE20', outcome: 'rejected', storeMessage: 'Does not meet requirements.' }], result: {
    kind: 'error', reason: 'restore-failed', restoration: 'failed', problem: 'original-rejected', codes: [], finalTotal: total(20000), draftRestoration: { ok: false },
  } }))
  assert.equal(app.$('.use-code').textContent, 'Try again')
  assert.match(app.$('.coupon-status').textContent, /SAVE20: not accepted: Does not meet requirements/)
  assert.match(app.$('.coupon-status').textContent, /Couldn't put back your original coupon state/)
  assert.match(app.$('.coupon-status').textContent, /Field text was left as-is/)
  assert.doesNotMatch(app.$('.coupon-status').textContent, /You save/)
  assert.equal(next.value, '')
})

test('refused managed starts explain the refusal without a field mutation or invented run', async t => {
  let starts = 0
  const app = setup(t, { onTry: async () => { starts++; return { ok: false, reason: 'unsupported-checkout' } } })
  app.$('.use-code').click()
  await waitUntil(() => !app.$('.use-code').disabled)
  assert.equal(starts, 1)
  assert.equal(app.$('.use-code').textContent, 'Use code')
  assert.match(app.$('.coupon-status').textContent, /Nothing was changed/)
  assert.equal(app.input.value, '')
  assert.deepEqual(app.seen(), { inputs: 0, submits: 0 })
})
