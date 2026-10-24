const test = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')
const { read, waitUntil } = require('./helpers/demo.js')

function setup(t, { reducedMotion = false, ...options } = {}) {
  const dom = new JSDOM('<!doctype html><body><main><button id="focus">Keep shopping</button></main><section id="shopify-section-cart-drawer"><form><label>Discount code<input name="discount_code"></label><button type="submit" id="apply">Apply</button></form></section></body>', { url: 'https://sharperimage.com/', pretendToBeVisual: true, runScripts: 'outside-only' })
  const { window } = dom
  window.matchMedia = query => ({ matches: reducedMotion, media: query, addEventListener() {}, removeEventListener() {} })
  window.eval(read('extension/content/inline-coupon.js'))
  const control = window.Janice.createInlineCoupon({ window, ...options })
  const input = window.document.querySelector('input')
  let top = 140
  input.getBoundingClientRect = () => ({ left: 100, right: 400, top, bottom: top + 40, width: 300, height: 40 })
  const events = []
  const entries = []
  let submits = 0
  let clicks = 0
  for (const type of ['input', 'change']) input.addEventListener(type, () => events.push(type))
  input.addEventListener('input', event => entries.push({ value: input.value, data: event.data, inputType: event.inputType }))
  window.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submits++ })
  window.document.getElementById('apply').addEventListener('click', () => { clicks++ })
  const part = selector => control.element.shadowRoot.querySelector(selector)
  const sync = () => control.sync({ inputs: [input], candidates: [{ code: 'AFF15' }] })
  t.after(() => { control.destroy(); window.close() })
  return { window, control, input, part, sync, events, entries, move: value => { top = value }, mutations: () => ({ submits, clicks }) }
}

test('inline coupon decoration reads no field value, preserves merchant controls, and keeps focus', t => {
  const { window, control, input, part, sync, events, mutations } = setup(t)
  const before = window.document.querySelector('section').outerHTML
  Object.defineProperty(input, 'value', { get() { throw new Error('decoration must not read values') } })
  window.document.getElementById('focus').focus()
  assert.equal(control.element.isConnected, false, 'no DOM host until a target is available')
  sync()
  assert.equal(control.element.hidden, false)
  assert.equal(window.document.activeElement.id, 'focus')
  const merchant = window.document.querySelector('section').cloneNode(true)
  merchant.querySelector('janice-inline-coupon').remove()
  assert.equal(merchant.outerHTML, before, 'only the extension-owned fixed host is added')
  assert.equal(control.element.previousElementSibling, input.closest('label'), 'helper is reachable after the field inside the merchant modal tree')
  assert.equal(part('.coupon-outline').style.left, '97px')
  assert.equal(part('.coupon-outline').style.width, '306px')
  assert.equal(part('.use-code').textContent, 'Use code')
  assert.equal(part('.coupon-status').hidden, true)
  assert.deepEqual(events, [])
  assert.deepEqual(mutations(), { submits: 0, clicks: 0 })
})

test('Use code puts the whole coupon in the field at once and commits it once, without submitting', t => {
  const { window, control, input, part, sync, events, entries, mutations } = setup(t)
  sync()
  part('.use-code').click()
  assert.equal(input.value, 'AFF15', 'entered at once, not letter by letter')
  assert.deepEqual(entries, [{ value: 'AFF15', data: 'AFF15', inputType: 'insertText' }])
  assert.deepEqual(events, ['input', 'change'])
  assert.deepEqual(mutations(), { submits: 0, clicks: 0 })
  assert.equal(part('.use-code').disabled, false)
  assert.notEqual(part('.use-code').getAttribute('aria-busy'), 'true')
  assert.equal(part('.use-code').textContent, 'Code entered')
  assert.equal(part('.coupon-status').textContent, 'AFF15 entered. Select Apply to check the discount.')
  sync()
  assert.equal(part('.use-code').textContent, 'Code entered', 'routine sync preserves the result and button node')
  input.value = 'SHOPPER'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(part('.use-code').textContent, 'Use code', 'shopper edits reset the action without reading values')
  assert.equal(part('.coupon-status').hidden, true)
  control.hide()
  assert.equal(control.element.hidden, true)
})

test('Use code preserves a shopper draft and refuses hidden or detached targets', t => {
  const { input, part, sync, control, events, mutations } = setup(t)
  sync()
  input.value = 'SHOPPER'
  part('.use-code').click()
  assert.equal(input.value, 'SHOPPER')
  assert.equal(part('.coupon-status').textContent, 'Clear the field to use AFF15.')
  assert.deepEqual(events, [])
  input.hidden = true
  part('.use-code').click()
  assert.equal(control.element.hidden, true)
  assert.equal(input.value, 'SHOPPER')
  input.hidden = false
  sync()
  input.remove()
  part('.use-code').click()
  assert.equal(control.element.hidden, true)
  assert.deepEqual(mutations(), { submits: 0, clicks: 0 })
})

test('inline position follows scroll, hides without valid candidates, and cannot revive after destroy', async t => {
  const { window, control, input, part, sync, move } = setup(t)
  sync()
  move(220)
  window.document.dispatchEvent(new window.Event('scroll', { bubbles: true }))
  await waitUntil(() => part('.coupon-outline').style.top === '217px')
  control.sync({ inputs: [input], candidates: [{ code: 123 }] })
  assert.equal(control.element.hidden, true, 'numeric provider data is not coerced into a coupon code')
  sync()
  control.destroy()
  sync()
  assert.equal(control.element.isConnected, false)
  assert.equal(control.element.hidden, true)
})

test('status feedback avoids the promo field and merchant Apply when the button flips above', async t => {
  const { window, input, part, sync } = setup(t)
  window.document.getElementById('apply').getBoundingClientRect = () => ({ left: 100, right: 400, top: 190, bottom: 230, width: 300, height: 40 })
  part('.coupon-status').getBoundingClientRect = () => ({ width: 260, height: 40 })
  sync()
  assert.equal(part('.use-code').style.top, '106px', 'the native Apply button keeps the control above the field')
  part('.use-code').click()
  await waitUntil(() => part('.use-code').textContent === 'Code entered')
  await waitUntil(() => part('.coupon-status').style.top !== '')
  const feedback = { top: Number.parseFloat(part('.coupon-status').style.top), bottom: Number.parseFloat(part('.coupon-status').style.top) + 40 }
  const field = input.getBoundingClientRect()
  assert.ok(feedback.bottom <= field.top || feedback.top >= field.bottom, 'feedback leaves the entered coupon visible')
  assert.ok(feedback.bottom <= 190 || feedback.top >= 230, 'feedback leaves native Apply visible')
})

test('a fresh eligibility guard refuses a field repurposed before the next page scan', t => {
  let eligible = true
  const { input, part, sync, control, events } = setup(t, { isEligibleInput: () => eligible })
  sync()
  eligible = false
  Object.defineProperty(input, 'value', { get() { throw new Error('ineligible field must not be read') } })
  part('.use-code').click()
  assert.equal(control.element.hidden, true)
  assert.deepEqual(events, [])
})

test('a store field that rewrites, replaces or repurposes itself while the code goes in is not reported as entered', async t => {
  for (const action of ['rewrite', 'remove', 'repurpose']) {
    await t.test(action, sub => {
      let eligible = true
      const { input, part, sync, events } = setup(sub, { isEligibleInput: () => eligible })
      sync()
      input.addEventListener('input', () => {
        if (action === 'rewrite') input.value = 'STORE VALUE'
        if (action === 'remove') input.remove()
        if (action === 'repurpose') eligible = false
      }, { once: true })
      part('.use-code').click()
      assert.deepEqual(events, ['input'], 'no change event for a code the field did not keep')
      assert.equal(part('.use-code').textContent, 'Use code')
      assert.equal(part('.coupon-status').hidden, true)
    })
  }
})
