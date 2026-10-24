const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { enterCouponCode } = require('../extension/content/coupon-entry.js')

function page(t) {
  const dom = new JSDOM('<!doctype html><body><button id="focus">Keep shopping</button><form><label>Promo code<input name="discount_code"></label><button type="submit">Apply</button></form></body>', { pretendToBeVisual: true, runScripts: 'outside-only' })
  const { window } = dom
  const input = window.document.querySelector('input')
  const entries = []
  let changes = 0
  let applies = 0
  let submits = 0
  input.addEventListener('input', event => entries.push({ value: input.value, data: event.data, inputType: event.inputType }))
  input.addEventListener('change', () => { changes++ })
  window.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submits++ })
  window.document.querySelector('button[type="submit"]').addEventListener('click', () => { applies++ })
  window.document.getElementById('focus').focus()
  t.after(() => window.close())
  return {
    window, input, entries,
    seen: () => ({ changes, applies, submits }),
    enter: (options = {}) => enterCouponCode({ window, input, code: 'AFF15', ...options }),
  }
}

test('coupon entry puts the whole code in at once, with one input and one change, without touching Apply or focus', async t => {
  const app = page(t)
  app.input.value = 'PREVIOUS'
  const pending = app.enter()
  assert.equal(app.input.value, 'AFF15', 'in the field at once, not letter by letter')
  assert.deepEqual(await pending, { ok: true })
  assert.deepEqual(app.entries, [{ value: 'AFF15', data: 'AFF15', inputType: 'insertText' }])
  assert.deepEqual(app.seen(), { changes: 1, applies: 0, submits: 0 })
  assert.equal(app.window.document.activeElement.id, 'focus')
})

test('a code already in the field is left as it is', async t => {
  const app = page(t)
  app.input.value = 'aff15'
  assert.deepEqual(await app.enter(), { ok: true })
  assert.deepEqual(app.entries, [])
  assert.equal(app.seen().changes, 0)
})

test('detached, hidden, read-only, disabled or ineligible fields, a hidden page and a stopped run get nothing', async t => {
  for (const reason of ['removed', 'hidden', 'readonly', 'disabled', 'ineligible', 'page-hidden', 'stopped']) {
    await t.test(reason, async sub => {
      const app = page(sub)
      if (reason === 'removed') app.input.remove()
      if (reason === 'hidden') app.input.hidden = true
      if (reason === 'readonly') app.input.readOnly = true
      if (reason === 'disabled') app.input.disabled = true
      if (reason === 'page-hidden') Object.defineProperty(app.window.document, 'hidden', { value: true })
      const expected = { ineligible: 'codes-changed', stopped: 'stopped' }[reason] ?? 'page-changed'
      const result = await app.enter({ isEligibleInput: () => reason !== 'ineligible', isCancelled: () => reason === 'stopped' })
      assert.deepEqual(result, { ok: false, reason: expected })
      assert.equal(app.input.value, '')
      assert.deepEqual(app.entries, [])
      assert.equal(app.seen().changes, 0)
    })
  }
})

test('a store field that rewrites or replaces itself during the input event is not reported as entered', async t => {
  for (const action of ['remove', 'rewrite']) {
    await t.test(action, async sub => {
      const app = page(sub)
      app.input.addEventListener('input', () => {
        if (action === 'remove') app.input.remove()
        else app.input.value = 'STORE VALUE'
      }, { once: true })
      assert.deepEqual(await app.enter(), { ok: false, reason: action === 'remove' ? 'page-changed' : 'codes-changed' })
      assert.equal(app.entries.length, 1)
      assert.equal(app.seen().changes, 0, 'no change event for a code the field did not keep')
    })
  }
})

test('invalid, canceled or ineligible input is refused before its value is read', async t => {
  const app = page(t)
  Object.defineProperty(app.input, 'value', { get() { throw new Error('must not read') } })
  assert.deepEqual(await app.enter({ code: '<script>' }), { ok: false, reason: 'invalid-code' })
  assert.deepEqual(await app.enter({ isCancelled: () => true }), { ok: false, reason: 'stopped' })
  assert.deepEqual(await app.enter({ isEligibleInput: () => false }), { ok: false, reason: 'codes-changed' })
  assert.deepEqual(app.entries, [])
})
