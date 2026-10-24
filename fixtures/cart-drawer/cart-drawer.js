// Demo fixture only. The browser harness serves cartSnapshot() as /cart.js;
// no requests or outcomes in this fixture reach a real store.
;(function () {
  'use strict'
  const drawer = document.getElementById('shopify-section-cart-drawer')
  const openButton = document.getElementById('open-cart')
  const disclosure = document.querySelector('.discount-disclosure')
  const slot = drawer.querySelector('.field-slot')
  const query = new URLSearchParams(location.search)
  const rules = { AFF15: 1500, SAVE20: 2000 }
  const baseMinor = Number(query.get('spend') ?? 20000)
  const delay = Math.max(20, Number(query.get('delay') ?? 180))
  const renderDelay = Math.max(10, Number(query.get('renderDelay') ?? 65))
  let mode = query.get('mode') ?? 'discount'
  let quantity = 1
  let codes = query.get('existing') ? [{ code: query.get('existing').toUpperCase(), applicable: Boolean(rules[query.get('existing').toUpperCase()]) }] : []
  let rejected = null
  let pending = false
  const record = { applies: 0, applyCodes: [], removes: [], formSubmits: 0, overlapping: 0, inputValues: [] }
  const fields = {
    discount: { name: 'discount_code', label: 'Discount code', type: 'text' },
    coupon: { name: 'coupon', label: 'Coupon code', type: 'text' },
    promo: { name: 'promo_code', label: 'Promo code', type: 'text' },
    gift: { name: 'gift_card', label: 'Gift card code', type: 'text' },
    search: { name: 'coupon_search', label: 'Search coupons', type: 'search' },
  }
  const money = cents => `$${(cents / 100).toFixed(2)}`
  const active = () => codes.filter(entry => entry.applicable)
  const discount = () => active().reduce((amount, entry) => amount + (rules[entry.code] ?? 0), 0)
  const total = () => Math.max(0, baseMinor * quantity - discount())
  const element = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
    node.textContent = text
    return node
  }

  function cartSnapshot() {
    return {
      currency: 'USD', total_price: total(), original_total_price: baseMinor * quantity,
      items_subtotal_price: baseMinor * quantity, total_discount: discount(), item_count: quantity,
      discount_codes: codes.map(entry => ({ ...entry })),
      cart_level_discount_applications: active().map(entry => ({ title: entry.code, type: 'discount_code', value_type: 'fixed_amount', total_allocated_amount: rules[entry.code] })),
      items: [{ variant_id: 53427141411105, quantity, original_line_price: baseMinor * quantity, final_line_price: baseMinor * quantity }],
    }
  }

  // The verified storefront clears busy before fetched section rendering.
  // Keep that gap so stale-error handling cannot pass prematurely.
  function update(operation) {
    if (pending) { record.overlapping++; return }
    pending = true
    drawer.setAttribute('data-is-updating', 'true')
    setTimeout(() => {
      operation()
      drawer.removeAttribute('data-is-updating')
      setTimeout(() => { renderField(); pending = false }, renderDelay)
    }, delay)
  }

  function apply(code) {
    record.applies++
    record.applyCodes.push(code)
    update(() => {
      const applicable = Object.hasOwn(rules, code)
      codes = [{ code, applicable }]
      rejected = applicable ? null : code
    })
  }

  function remove(code) {
    record.removes.push(code)
    update(() => { codes = codes.filter(entry => entry.code !== code); rejected = null })
  }

  function renderField() {
    // Replacing this node is the adapter's fresh-response signal.
    slot.replaceChildren()
    document.querySelector('cart-total').textContent = money(total())
    document.querySelector('.demo-quantity').textContent = String(quantity)
    if (mode === 'none') return
    const field = fields[mode] ?? fields.discount
    const component = element('discount-code-component', { 'data-discount-code': active().map(entry => entry.code).join(',') })
    const group = element('div', { class: 'cart-discount-code' })
    const label = element('label', {}, field.label)
    const input = element('input', { name: field.name, type: field.type, placeholder: field.label, 'data-qa': 'promo-code', class: 'js-cart-discount-code__input' })
    label.append(input)
    input.addEventListener('input', () => record.inputValues.push(input.value))
    const applyButton = element('button', { type: 'button', 'data-qa': 'promo-apply', class: 'js-cart-discount-code__btn' }, 'Apply')
    applyButton.addEventListener('click', () => apply(input.value.trim().toUpperCase()))
    const messages = element('div', { class: 'cart-discount-code__message' })
    if (rejected) {
      const error = element('div', { class: 'cart-discount-code__message__item cart-discount-code__message__item--is-error' })
      error.append(element('p', {}, `Promo code ${rejected} is not valid or does not meet requirements.`))
      messages.append(error)
    }
    for (const [index, entry] of active().entries()) {
      const row = element('div', { class: 'cart-discount-code__message__item' })
      const text = element('p', {}, `${entry.code} applied.`)
      const removeButton = element('button', { type: 'button', 'data-discount-code': entry.code, 'data-qa': `promo-remove-${index}`, class: 'js-cart-discount-code__message__item__remove-button cart-discount-code__message__item__remove-button' }, 'Remove')
      removeButton.addEventListener('click', () => remove(entry.code))
      text.append(removeButton)
      row.append(text)
      messages.append(row)
    }
    group.append(label, applyButton, messages)
    if (active().length) {
      group.append(element('p', { class: 'cart-discount-code__order-discounts__title' }, 'Order discount'))
      const discounts = element('div', { class: 'cart-discount-code__order-discounts' })
      for (const entry of active()) {
        const row = element('div', { class: 'cart-discount-code__order-discounts__item' })
        row.append(element('span', {}, entry.code), element('span', { class: 'money' }, `-${money(rules[entry.code])}`))
        discounts.append(row)
      }
      group.append(discounts)
    }
    component.append(group)
    slot.append(component)
  }

  function open() {
    drawer.removeAttribute('inert')
    drawer.setAttribute('aria-hidden', 'false')
    drawer.classList.add('is-open')
    openButton.setAttribute('aria-expanded', 'true')
  }
  function close() {
    drawer.classList.remove('is-open')
    drawer.setAttribute('aria-hidden', 'true')
    drawer.setAttribute('inert', '')
    openButton.setAttribute('aria-expanded', 'false')
  }
  openButton.addEventListener('click', open)
  document.getElementById('close-cart').addEventListener('click', close)
  disclosure.open = query.get('collapsed') !== '1'
  renderField()
  window.JaniceDrawerDemo = {
    record, open, close, cartSnapshot,
    setMode(next) { mode = next; renderField() }, rerender: renderField,
    setQuantity(next) { quantity = next; renderField() },
    get pending() { return pending },
  }
})()
