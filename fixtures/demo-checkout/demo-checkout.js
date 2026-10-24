/*
 * Demo checkout: a deterministic, simulated stand-in for the Shopify
 * one-page checkout, built on the structure observed on the live Sharper
 * Image checkout (docs/CHECKOUT_NOTES.md), so Janice's real adapter runs on
 * it unchanged. It is test infrastructure, not evidence of live behavior:
 * the page shows a DEMO banner and Janice labels its results Demo.
 *
 * Fixture rules (docs/ACCEPTANCE.md): USD, an explicit eligible spend, zero
 * shipping and tax, integer cents. AFF15 takes $15 off at $150.00 or more.
 * One discount code at a time, so a run that tried to stack codes fails.
 *
 * Configure with URL parameters (spend, existing, mode, delay, layout,
 * shipping, failures) or, before this script runs, window.JANICE_DEMO_CONFIG.
 */
;(function () {
  'use strict'

  const CODE_RULES = {
    AFF15: { amountMinor: 1500, minimumMinor: 15000 },
    SAVE20: { amountMinor: 2000 },
    TAKE15: { amountMinor: 1500 },
  }
  const INVALID = 'Enter a valid discount code or gift card'

  const params = new URLSearchParams(window.location.search)
  const list = value => (value ? String(value).split(',').map(item => item.trim()).filter(Boolean) : [])
  const config = {
    spendMinor: 20000,
    existing: [],
    mode: 'normal',
    delayMs: 700,
    rollerLagMs: 400,
    dropAfterMs: 1500,
    layout: 'sidebar',
    shipping: 'zero',
    failures: [],
    ...(window.JANICE_DEMO_CONFIG || {}),
  }
  if (params.has('spend')) config.spendMinor = Number(params.get('spend'))
  if (params.has('existing')) config.existing = list(params.get('existing'))
  if (params.has('mode')) config.mode = params.get('mode')
  if (params.has('delay')) config.delayMs = Number(params.get('delay'))
  if (params.has('layout')) config.layout = params.get('layout')
  if (params.has('shipping')) config.shipping = params.get('shipping')
  if (params.has('failures')) config.failures = list(params.get('failures'))
  config.existing = list(config.existing).map(code => code.toUpperCase())

  const fails = name => config.failures.includes(name)

  const state = {
    quantity: 1,
    codes: [...config.existing],
    giftCards: fails('gift-card') ? ['Gift card ending 4242'] : [],
    busy: false,
    error: null,
    removedOriginals: [],
    expanded: config.layout !== 'collapsed',
    shownTotalMinor: null,
    rollerMinor: null,
    hungApply: false,
  }

  // What the page did, for tests: Janice must never press Pay now or edit contact fields.
  const record = { applies: [], removes: [], forbidden: [] }

  const money = minor => `$${(minor / 100).toFixed(2)}`
  const subtotal = () => config.spendMinor * state.quantity
  const discount = () => state.codes.reduce((sum, code) => sum + (CODE_RULES[code]?.amountMinor ?? 0), 0)
  const total = () => Math.max(0, subtotal() - discount())

  function announce(message) {
    const live = document.getElementById('demo-live')
    live.textContent = ''
    live.append(Object.assign(document.createElement('p'), { textContent: message }))
    live.append(Object.assign(document.createElement('p'), { textContent: `Updated total price: ${(total() / 100).toFixed(2)} US dollars` }))
  }

  function el(tag, attributes = {}, ...children) {
    const element = document.createElement(tag)
    for (const [name, value] of Object.entries(attributes)) {
      if (value === false || value === null || value === undefined) continue
      element.setAttribute(name, value === true ? '' : value)
    }
    element.append(...children)
    return element
  }

  function cartSection() {
    return el(
      'section',
      { 'aria-label': 'Shopping cart' },
      el('h3', { id: 'ResourceList-demo' }, 'Shopping cart'),
      el(
        'div',
        { role: 'table', 'aria-labelledby': 'ResourceList-demo' },
        el('div', { role: 'rowgroup' }, el('div', { role: 'row' }, ...['Product image', 'Description', 'Quantity', 'Price'].map(h => el('div', { role: 'columnheader' }, h)))),
        el(
          'div',
          { role: 'rowgroup' },
          el(
            'div',
            { role: 'row' },
            el('div', { 'aria-hidden': 'true' }, '▣'),
            el('div', { role: 'cell' }, el('span', { class: 'visually-hidden' }, 'Quantity'), String(state.quantity)),
            el('div', { role: 'cell' }, el('p', {}, 'Demo Desk Lamp'), el('span', {}, 'Simulated item')),
            el('div', { role: 'cell' }, el('span', { class: 'visually-hidden' }, String(state.quantity))),
            el('div', { role: 'cell' }, el('span', {}, money(subtotal()))),
          ),
        ),
      ),
    )
  }

  function discountSection() {
    if (fails('missing-controls')) return el('p', { class: 'hint' }, 'Discounts are not available on this demo checkout.')

    const input = el('input', {
      id: 'ReductionsInput-demo',
      name: 'reductions',
      type: 'text',
      placeholder: 'Discount code or gift card',
      'aria-labelledby': 'ReductionsInput-demo-label',
      autocomplete: 'off',
      'aria-invalid': state.error ? 'true' : null,
      'aria-describedby': state.error ? 'ReductionsError-demo' : null,
    })
    input.value = pendingValue
    const apply = el('button', { type: 'submit', 'aria-label': 'Apply Discount Code', 'aria-busy': String(state.busy), disabled: !pendingValue.trim() || state.busy }, el('span', {}, 'Apply'))
    input.addEventListener('input', () => {
      pendingValue = input.value
      apply.disabled = !pendingValue.trim() || state.busy
    })
    const form = el(
      'form',
      { id: 'Form-reductions-demo', novalidate: true },
      el('label', { id: 'ReductionsInput-demo-label', for: 'ReductionsInput-demo' }, el('span', { class: 'visually-hidden' }, 'Discount code or gift card')),
      input,
      apply,
      el('button', { type: 'submit', 'aria-hidden': 'true', tabindex: '-1', class: 'visually-hidden' }, 'Submit'),
    )
    form.addEventListener('submit', event => {
      event.preventDefault()
      const code = pendingValue.trim()
      if (code && !state.busy) process('apply', code)
    })

    const tags = [...state.codes, ...state.giftCards].map((label, index) => {
      const remove = el('button', { type: 'button', 'aria-label': `Remove ${label}` }, '×')
      remove.addEventListener('click', () => !state.busy && process('remove', label))
      return el('li', {}, el('div', { role: 'group', id: `tag-${index}` }, el('span', { 'aria-hidden': 'true' }, label), el('span', { class: 'visually-hidden' }, label), remove))
    })

    return el(
      'div',
      { id: 'gift-card-field' },
      el(
        'section',
        {},
        el('h3', { id: 'ReductionsHeading-demo' }, 'Discount code or gift card'),
        form,
        state.error ? el('p', { id: 'ReductionsError-demo', class: 'error' }, state.error) : '',
        el('div', { id: 'reduction-tags' }, el('ul', { role: 'list', 'aria-label': 'Discount code or gift card' }, ...tags)),
      ),
    )
  }

  function totalCell() {
    if (fails('unreadable-total')) return el('div', { role: 'cell' }, el('span', {}, 'Calculating…'))
    const roller = state.rollerMinor
    return el(
      'div',
      { role: 'cell' },
      el('span', {}, fails('non-usd') ? 'CAD' : 'USD'),
      el('span', { 'aria-hidden': 'true' }, el('span', {}, money(state.shownTotalMinor))),
      el('span', { class: 'roller' }, el('span', { 'aria-label': money(roller) }, ...[...money(roller)].map(ch => el('span', {}, ch)))),
    )
  }

  function costSection() {
    const rows = [el('div', { role: 'row' }, el('div', { role: 'rowheader' }, el('span', {}, 'Subtotal')), el('div', { role: 'cell' }, el('span', {}, money(subtotal()))))]
    if (state.codes.length) {
      rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, el('span', {}, 'Order discount'))))
      for (const code of state.codes) {
        rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, el('span', {}, el('span', {}, code))), el('div', { role: 'cell' }, el('span', { translate: 'no' }, `− ${money(CODE_RULES[code]?.amountMinor ?? 0)}`))))
      }
    }
    const shipping = config.shipping === 'pending' ? 'Enter shipping address' : '$0.00'
    rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, el('span', {}, 'Shipping')), el('div', { role: 'cell' }, el('span', { 'aria-hidden': 'true' }, shipping), el('span', { class: 'visually-hidden' }, shipping))))
    if (config.shipping !== 'pending') {
      rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, el('span', {}, 'Estimated taxes')), el('div', { role: 'cell' }, el('span', {}, '$0.00'))))
    }
    rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, 'Total'), totalCell()))
    if (discount() > 0) {
      rows.push(el('div', { role: 'row' }, el('div', { role: 'rowheader' }, 'TOTAL SAVINGS', el('strong', { translate: 'no' }, money(discount()))), el('div', { role: 'cell' })))
    }
    return el(
      'section',
      { 'aria-busy': state.busy ? 'true' : null },
      el('h3', { id: 'MoneyLine-Heading-demo' }, 'Cost summary'),
      el('div', { role: 'table', 'aria-labelledby': 'MoneyLine-Heading-demo' }, el('div', { role: 'rowgroup' }, el('div', { role: 'row' }, el('div', { role: 'columnheader' }, 'Item'), el('div', { role: 'columnheader' }, 'Value'))), el('div', { role: 'rowgroup' }, ...rows)),
    )
  }

  let pendingValue = ''

  function render() {
    const focused = document.activeElement?.id
    const summary = el('aside', {}, el('section', {}, el('h2', {}, 'Order summary'), cartSection(), discountSection(), costSection()))
    const root = document.getElementById('demo-summary-root')
    if (config.layout === 'collapsed') {
      const toggle = el('button', { type: 'button', class: 'summary-toggle', 'aria-expanded': String(state.expanded), 'aria-controls': 'demo-summary-panel' }, 'Order summary ', el('span', {}, `Total price ${money(total())}`))
      toggle.addEventListener('click', () => {
        state.expanded = !state.expanded
        render()
      })
      root.replaceChildren(toggle, el('div', { id: 'demo-summary-panel', hidden: !state.expanded }, summary))
    } else {
      root.replaceChildren(summary)
    }
    if (focused) document.getElementById(focused)?.focus()
  }

  // Shows a new total at once in the aria-hidden copy; the animated roller catches up later.
  function updateTotals() {
    state.shownTotalMinor = total()
    if (fails('stalled-roller')) return
    window.setTimeout(() => {
      state.rollerMinor = total()
      render()
    }, config.rollerLagMs)
  }

  function process(kind, code) {
    state.busy = true
    render()
    if ((kind === 'apply' && fails('never-settle-apply') && code.toUpperCase() === 'AFF15') || (kind === 'remove' && fails('remove-hangs'))) {
      state.hungApply = true
      return
    }
    window.setTimeout(() => {
      if (kind === 'apply') applyCode(code)
      else removeCode(code)
      state.busy = false
      updateTotals()
      render()
    }, config.delayMs)
  }

  function reject(message) {
    state.error = message
  }

  function applyCode(raw) {
    const code = raw.toUpperCase()
    record.applies.push(code)
    const rule = CODE_RULES[code]
    if (fails('blocked')) return reject('Too many attempts. Try again later.')
    if (state.codes.length > 0) return reject('Only one discount code can be used. Remove the current code first.')
    if (!rule) return reject(INVALID)
    if (code === 'AFF15' && config.mode === 'reject-all') return reject("AFF15 can't be used right now.")
    if (rule.minimumMinor && subtotal() < rule.minimumMinor) return reject(`${code} requires a minimum purchase of ${money(rule.minimumMinor)}.`)
    if (fails('restore-rejected') && state.removedOriginals.includes(code)) return reject(`${code} can no longer be used.`)

    state.error = null
    state.codes.push(code)
    pendingValue = ''
    if (code === 'AFF15' && fails('cart-change-on-apply')) state.quantity += 1
    if (code === 'AFF15' && fails('drop-winner')) {
      window.setTimeout(() => {
        state.codes = state.codes.filter(applied => applied !== 'AFF15')
        updateTotals()
        render()
      }, config.dropAfterMs)
    }
    announce(`Discount code ${code} has been applied`)
  }

  function removeCode(label) {
    record.removes.push(label)
    state.giftCards = state.giftCards.filter(card => card !== label)
    if (state.codes.includes(label)) {
      state.codes = state.codes.filter(code => code !== label)
      if (config.existing.includes(label)) state.removedOriginals.push(label)
    }
    state.error = null
    announce(`Discount code ${label} has been removed`)
  }

  document.getElementById('demo-main-form').addEventListener('submit', event => {
    event.preventDefault()
    record.forbidden.push('pay-now')
  })
  document.getElementById('email').addEventListener('input', () => record.forbidden.push('email'))

  // Both copies start at the opening total; afterwards the roller only catches up late (or never).
  state.shownTotalMinor = total()
  state.rollerMinor = total()

  window.JaniceDemo = {
    config,
    state,
    record,
    total,
    // Simulates the shopper editing the cart in another tab.
    setQuantity(quantity) {
      state.quantity = quantity
      updateTotals()
      render()
    },
  }

  render()
})()
