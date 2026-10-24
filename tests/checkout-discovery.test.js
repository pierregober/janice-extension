const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const { inspect } = require('../extension/content/checkout-discovery.js')
const NO_DRAWER = { present: false, fieldCount: 0, visibleFieldCount: 0 }

function page(html, url = 'https://sharperimage.com/products/example') {
  const dom = new JSDOM(html, { url })
  return { dom, document: dom.window.document, location: dom.window.location }
}

test('discovery finds label, name, placeholder and ARIA promo hints away from checkout URLs', () => {
  const view = page(`
    <label for="a">Coupon code</label><input id="a">
    <input name="promoCode">
    <input placeholder="Discount code">
    <input aria-label="Voucher">
    <span id="promo-label">Promotional code</span><input aria-labelledby="promo-label">
    <input name="discount_code">
    <input name="promocode">
    <input name="couponcode">
    <input name="promotioncode">
  `)
  assert.deepEqual(inspect(view), { kind: 'promo-field', fieldCount: 9, visibleFieldCount: 9, canApply: false, checkoutHint: false, cartDrawer: NO_DRAWER })
  view.dom.window.close()
})

test('discovery recognizes captured live controls including their disabled Apply button', () => {
  const markup = fs.readFileSync(path.join(__dirname, 'fixtures/live-summary-baseline.html'), 'utf8')
  const view = page(markup, 'https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us')
  assert.deepEqual(inspect(view), { kind: 'promo-field', fieldCount: 1, visibleFieldCount: 1, canApply: true, checkoutHint: true, cartDrawer: NO_DRAWER })
  view.dom.window.close()
})

test('discovery excludes gift-card-only, payment, authentication, contact, search and unusable controls', () => {
  const view = page(`
    <input name="gift_card" placeholder="Gift card code">
    <input type="search" placeholder="Search coupons">
    <input name="coupon-search">
    <input type="email" aria-label="Promo code">
    <input type="password" name="coupon">
    <input name="promo" autocomplete="one-time-code">
    <input name="discount" autocomplete="cc-number">
    <input name="coupon" aria-label="Verification code">
    <input name="coupon" autocomplete="email">
    <input name="discount" aria-label="Credit card number">
    <input name="coupon" aria-label="Shipping address">
    <input name="discount" aria-label="First name">
    <input name="coupon" disabled>
    <fieldset disabled><input name="coupon"></fieldset>
    <input name="coupon" readonly>
    <input name="coupon" type="hidden">
    <input placeholder="Enter code">
    <div data-janice-launcher><input name="coupon"></div>
  `)
  assert.equal(inspect(view).fieldCount, 0)
  view.dom.window.close()
})

test('shared discount/gift card field is detected while collapsed fields stay hidden and unchanged', () => {
  const view = page(`
    <div hidden><input name="reductions" placeholder="Discount code or gift card"></div>
    <details><summary>Order summary</summary><input name="coupon"></details>
    <div style="display:none"><input name="promo"></div>
  `)
  const before = view.document.body.innerHTML
  const discovery = inspect(view)
  assert.equal(discovery.fieldCount, 3)
  assert.equal(discovery.visibleFieldCount, 0)
  assert.equal(view.document.body.innerHTML, before)
  view.dom.window.close()
})

test('checkout URL is a hint and missing controls never become an apply capability', () => {
  const view = page('<form><input name="email"><button>Pay now</button></form>', 'https://sharperimage.com/checkout')
  assert.deepEqual(inspect(view), { kind: 'checkout', fieldCount: 0, visibleFieldCount: 0, canApply: false, checkoutHint: true, cartDrawer: NO_DRAWER })
  view.dom.window.close()
})

test('only a locally associated explicit Apply control counts; payment, generic submit and unrelated buttons do not', () => {
  for (const label of ['Submit', 'Pay now', 'Place order', 'Apply coupon and checkout', 'Continue', 'Complete purchase']) {
    const view = page(`<form><input name="coupon"><button>${label}</button></form><button>Apply coupon</button>`)
    assert.equal(inspect(view).canApply, false, label)
    view.dom.window.close()
  }
  const view = page('<form id="promo"><input name="coupon"></form><button form="promo" aria-label="Apply discount code">Apply</button>')
  assert.equal(inspect(view).canApply, true)
  view.dom.window.close()
})

test('discovery reads no input values, emits no input metadata, and never changes or clicks controls', () => {
  const view = page('<form><input name="coupon" value="PRIVATECODE"><input name="email" value="private@example.com"><button>Apply</button></form>')
  for (const input of view.document.querySelectorAll('input')) {
    Object.defineProperty(input, 'value', { get() { throw new Error('input value must not be read') } })
  }
  let clicked = false
  view.document.querySelector('button').addEventListener('click', () => { clicked = true })
  const before = view.document.documentElement.outerHTML
  const discovery = inspect(view)
  assert.deepEqual(Object.keys(discovery).sort(), ['kind', 'fieldCount', 'visibleFieldCount', 'canApply', 'checkoutHint', 'cartDrawer'].sort())
  assert.equal(JSON.stringify(discovery).includes('PRIVATE'), false)
  assert.equal(view.document.documentElement.outerHTML, before)
  assert.equal(clicked, false)
  view.dom.window.close()
})

test('a later inspection discovers dynamically inserted controls and forgets removed ones', () => {
  const view = page('<main></main>')
  assert.equal(inspect(view).kind, 'none')
  view.document.querySelector('main').innerHTML = '<form><input placeholder="Promo code"><button>Apply</button></form>'
  assert.equal(inspect(view).kind, 'promo-field')
  assert.equal(inspect(view).canApply, true)
  view.document.querySelector('form').remove()
  assert.equal(inspect(view).kind, 'none')
  view.dom.window.close()
})

test('Shopify cart drawers report coupon, promo and discount fields separately from page fields', () => {
  const view = page(`
    <section id="shopify-section-cart-drawer">
      <form><label>Discount code<input name="discount_code"></label><button type="button">Apply</button></form>
      <input placeholder="Promo code"><input aria-label="Coupon code">
      <input name="gift_card" placeholder="Gift card code"><input name="email">
    </section>
    <input name="coupon">
  `)
  const before = view.document.body.innerHTML
  assert.deepEqual(inspect(view).cartDrawer, { present: true, fieldCount: 3, visibleFieldCount: 3 })
  assert.equal(inspect(view).fieldCount, 4, 'the separate page field remains discoverable')
  assert.equal(view.document.body.innerHTML, before)
  view.dom.window.close()
})

test('Shopify section name variants identify drawers, but an empty drawer is not a coupon opportunity', () => {
  for (const attributes of ['id="shopify-section-template--123__cart-drawer"', 'id="shopify-section-cart-drawer-123"', 'id="template--123__shopify-section-cart-drawer"', 'class="shopify-section-cart-drawer"']) {
    const view = page(`<section ${attributes}><input name="coupon"></section>`)
    assert.deepEqual(inspect(view).cartDrawer, { present: true, fieldCount: 1, visibleFieldCount: 1 }, attributes)
    view.dom.window.close()
  }
  const view = page('<section id="shopify-section-cart-drawer"><input name="gift_card"><input name="email"><button>Checkout</button></section>')
  assert.deepEqual(inspect(view).cartDrawer, { present: true, fieldCount: 0, visibleFieldCount: 0 })
  view.dom.window.close()
})

test('a drawer promo becomes visible when opened or dynamically inserted without reading its value', () => {
  const view = page('<main></main>')
  assert.deepEqual(inspect(view).cartDrawer, NO_DRAWER)
  view.document.querySelector('main').innerHTML = '<section id="shopify-section-cart-drawer" hidden><input name="discount_code" value="SECRET"></section>'
  const drawer = view.document.querySelector('section')
  const input = drawer.querySelector('input')
  Object.defineProperty(input, 'value', { get() { throw new Error('drawer input value must not be read') } })
  assert.deepEqual(inspect(view).cartDrawer, { present: true, fieldCount: 1, visibleFieldCount: 0 })
  drawer.hidden = false
  assert.deepEqual(inspect(view).cartDrawer, { present: true, fieldCount: 1, visibleFieldCount: 1 })
  for (const [name, value] of [['inert', ''], ['aria-hidden', 'true']]) {
    drawer.setAttribute(name, value)
    assert.equal(inspect(view).cartDrawer.visibleFieldCount, 0, name)
    drawer.removeAttribute(name)
  }
  assert.equal(JSON.stringify(inspect(view)).includes('SECRET'), false)
  drawer.remove()
  assert.deepEqual(inspect(view).cartDrawer, NO_DRAWER)
  view.dom.window.close()
})

test('a rendered off-canvas cart drawer does not count as visible until its promo field enters the viewport', () => {
  const view = page('<section id="shopify-section-cart-drawer"><input name="coupon"></section>')
  const input = view.document.querySelector('input')
  input.checkVisibility = () => true
  let left = view.dom.window.innerWidth + 100
  input.getBoundingClientRect = () => ({ left, right: left + 120, top: 100, bottom: 132, width: 120, height: 32 })
  assert.equal(inspect(view).cartDrawer.fieldCount, 1)
  assert.equal(inspect(view).cartDrawer.visibleFieldCount, 0)
  left = 100
  assert.equal(inspect(view).cartDrawer.visibleFieldCount, 1)
  view.document.querySelector('section').setAttribute('aria-hidden', 'true')
  assert.equal(inspect(view).cartDrawer.visibleFieldCount, 0, 'semantic hidden state wins even if native box visibility passes')
  view.dom.window.close()
})
