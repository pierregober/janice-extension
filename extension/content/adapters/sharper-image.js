/*
 * Sharper Image store adapter: the Shopify one-page checkout served at
 * https://sharperimage.com/checkouts/cn/<token>/en-us, as inspected live on
 * 2026-10-23 (see docs/CHECKOUT_NOTES.md for the evidence). Shoppers signed
 * in to Shop get the same checkout at
 * https://shop.app/checkout/<shopId>/cn/<token>/en-us/shoppay, with the same
 * controls (read-only inspection, 2026-10-24); runs stay off there until the
 * store's responses are verified (content/stores.js).
 *
 * It reads the order summary and operates only the discount-code form, the
 * applied codes' Remove buttons and, in the narrow layout, the "Order
 * summary" disclosure. It never touches contact, delivery or payment
 * fields and never submits the order.
 *
 * Observed signals it relies on:
 * - `input[name="reductions"]` in its own form, with the submit button
 *   `button[aria-label="Apply Discount Code"]` (disabled while empty).
 * - Applied codes as `#reduction-tags` items, each with
 *   `button[aria-label="Remove <CODE>"]`.
 * - An element with `aria-busy="true"` while the checkout recalculates.
 * - Rejection: `aria-invalid="true"` on the input, the message in the
 *   element its `aria-describedby` names.
 * - The cost summary: `[role=table]` labelled by `MoneyLine-Heading…`, rows
 *   of rowheader/cell. The Total cell holds the currency code ("USD"), an
 *   `aria-hidden` copy of the new amount, and an animated digit roller that
 *   lags behind (and stalls in background tabs), so the copy is read.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') {
    require('../../shared/money.js')
    require('../../shared/compare.js')
    require('../dom.js')
  }

  const Janice = root.Janice || (root.Janice = {})

  const SELECTORS = {
    reductionInput: 'input[name="reductions"]',
    applyButton: 'button[aria-label="Apply Discount Code"]',
    removeButton: '#reduction-tags button[aria-label^="Remove "]',
    moneyTable: '[role="table"][aria-labelledby^="MoneyLine-Heading"]',
    cartTable: 'section[aria-label="Shopping cart"] [role="table"]',
    collapsedToggle: 'button[aria-expanded="false"]',
    busy: '[aria-busy="true"]',
    status: '[role="status"]',
    // Fields that mark a form as the main checkout form, which this adapter never submits.
    checkoutFields: 'input[name="email"], input[name="address1"], input[name="basic"], iframe',
  }

  // Controls this adapter must never press, whatever matched them.
  const FORBIDDEN_LABEL = /\b(pay now|complete order|place order|submit order|buy now|pay with)\b/i
  // A restorable discount code; anything else (a gift card) cannot be re-entered.
  const CODE_LIKE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  // /checkouts/cn/<token>/… on the store's host, /checkout/<shopId>/cn/<token>/… on shop.app.
  const CHECKOUT_PATH = /^\/(?:checkouts|checkout\/\d+)\/[^/]+\/([^/?#]+)/

  function createSharperImageAdapter({ window: win = root, timing = {}, isDemo = false } = {}) {
    const { pollMs = 100, settleMs = 600, timeoutMs = 20000, enableMs = 2500, expandMs = 3000 } = timing
    const doc = win.document
    const dom = Janice.createDom(win)
    const { parseAmount } = Janice.money
    const { sameCode } = Janice.compare

    const all = selector => [...doc.querySelectorAll(selector)]
    const shownOrFirst = selector => all(selector).find(dom.isShown) ?? all(selector)[0] ?? null
    const visibleInput = () => all(SELECTORS.reductionInput).find(dom.isShown) ?? null
    const codeOf = button => button.getAttribute('aria-label').replace(/^Remove\s+/i, '').trim()

    function checkoutKey() {
      const match = CHECKOUT_PATH.exec(win.location.pathname)
      return match ? match[1] : win.location.pathname
    }

    function isPending() {
      return all(SELECTORS.busy).length > 0
    }

    function moneyRows(table) {
      return [...table.querySelectorAll('[role="row"]')]
        .map(row => ({
          header: dom.text(row.querySelector('[role="rowheader"]')),
          cell: row.querySelector('[role="cell"]'),
        }))
        .filter(row => row.header !== '')
    }

    // The amount shown in a cell: its aria-hidden copy, then labelled copies, then its text.
    function cellAmount(cell) {
      if (!cell) return null
      const copies = [
        ...[...cell.querySelectorAll('[aria-hidden="true"]')].map(dom.text),
        ...[...cell.querySelectorAll('[aria-label]')].map(element => element.getAttribute('aria-label')),
        dom.text(cell),
      ]
      for (const copy of copies) {
        const amountMinor = parseAmount(copy)
        if (amountMinor !== null) return amountMinor
      }
      return null
    }

    function cellCurrency(cell) {
      const leaf = [...cell.querySelectorAll('*')].find(
        element => element.children.length === 0 && /^[A-Z]{3}$/.test(dom.text(element)),
      )
      return leaf ? dom.text(leaf) : null
    }

    function readCodes() {
      const labels = []
      for (const button of all(SELECTORS.removeButton)) {
        const label = codeOf(button)
        if (!labels.some(seen => sameCode(seen, label))) labels.push(label)
      }
      return {
        appliedCodes: labels.filter(label => CODE_LIKE.test(label)),
        unrestorable: labels.filter(label => !CODE_LIKE.test(label)),
      }
    }

    // Which items, in what quantities: changes when the shopper edits the cart, not when a discount applies.
    function readCartIdentity() {
      const table = shownOrFirst(SELECTORS.cartTable)
      if (!table) return null
      const lines = [...table.querySelectorAll('[role="row"]')]
        .filter(row => !row.querySelector('[role="columnheader"]'))
        .map(row => {
          const cells = [...row.querySelectorAll('[role="cell"]')]
          const title = dom.text(row.querySelector('[role="cell"] p')) || dom.text(cells[1])
          const quantityCell = cells.find(cell => /quantity/i.test(dom.text(cell))) ?? cells[0]
          const quantity = (dom.text(quantityCell).match(/\d+/) || ['?'])[0]
          return `${quantity}×${title}`
        })
      return `${checkoutKey()}#${lines.sort().join('|')}`
    }

    function readError(input) {
      if (!input || input.getAttribute('aria-invalid') !== 'true') return null
      const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      const message = ids.map(id => dom.text(doc.getElementById(id))).filter(Boolean).join(' ')
      return message || 'The store marked the code as invalid.'
    }

    // The checkout's latest announcement about the code (the region keeps earlier ones), parts joined with spaces.
    function statusMessage(code) {
      for (const region of all(SELECTORS.status)) {
        const parts = [...region.querySelectorAll('*')].filter(child => child.children.length === 0).map(dom.text).filter(Boolean)
        if (parts.length === 0) parts.push(dom.text(region))
        const latest = parts.findLastIndex(part => part.includes(code))
        if (latest !== -1) return parts.slice(latest).join(' ')
      }
      return null
    }

    /** A synchronous read of the order summary and the discount form. */
    function readState() {
      const pending = isPending()
      const table = shownOrFirst(SELECTORS.moneyTable)
      if (!table) return { ok: false, reason: 'no-order-summary', pending }

      const rows = moneyRows(table)
      const totalRow = rows.find(row => row.header.toLowerCase() === 'total')
      if (!totalRow?.cell) return { ok: false, reason: 'no-total', pending }

      const amountMinor = cellAmount(totalRow.cell)
      if (amountMinor === null) return { ok: false, reason: 'unreadable-total', pending }
      const currency = cellCurrency(totalRow.cell)
      if (!currency) return { ok: false, reason: 'unreadable-currency', pending }

      const shipping = rows.find(row => row.header.toLowerCase() === 'shipping')
      const shippingCopy = shipping?.cell?.querySelector('[aria-hidden="true"]') ?? shipping?.cell
      const shippingText = dom.text(shippingCopy)
      const taxes = rows.find(row => /\btax/i.test(row.header))
      const subtotal = rows.find(row => row.header.toLowerCase() === 'subtotal')
      const input = visibleInput() ?? all(SELECTORS.reductionInput)[0] ?? null

      return {
        ok: true,
        pending,
        total: {
          amountMinor,
          currency,
          basis: 'order-total',
          shippingIncluded: Boolean(shipping) && (parseAmount(shippingText) !== null || /^free$/i.test(shippingText)),
          taxIncluded: Boolean(taxes) && cellAmount(taxes.cell) !== null,
        },
        subtotalMinor: subtotal ? cellAmount(subtotal.cell) : null,
        ...readCodes(),
        cartIdentity: readCartIdentity(),
        errorText: readError(input),
        page: checkoutKey(),
      }
    }

    function fingerprint(state) {
      return JSON.stringify([state.ok, state.reason, state.total, state.appliedCodes, state.unrestorable, state.errorText, state.cartIdentity])
    }

    /** Reads once the checkout has stopped recalculating and held still for `settleMs`. */
    async function readSettledState() {
      const deadline = Date.now() + timeoutMs
      let last = null
      let since = 0
      while (Date.now() < deadline) {
        const state = readState()
        if (state.pending) {
          last = null
        } else if (fingerprint(state) !== last) {
          last = fingerprint(state)
          since = Date.now()
        } else if (Date.now() - since >= settleMs) {
          return state
        }
        await dom.sleep(pollMs)
      }
      const state = readState()
      return state.pending ? { ok: false, reason: 'checkout-busy', pending: true } : state
    }

    /**
     * Waits until `classify` names an outcome that holds for `settleMs` with
     * nothing pending; `unverified` when the checkout never settles.
     */
    async function settle(classify) {
      const deadline = Date.now() + timeoutMs
      let sawPending = false
      let last = null
      let since = 0
      while (Date.now() < deadline) {
        await dom.sleep(pollMs)
        const state = readState()
        if (state.pending) {
          sawPending = true
          last = null
          continue
        }
        const outcome = state.ok ? classify(state, sawPending) : null
        const key = outcome && outcome + fingerprint(state)
        if (!key || key !== last) {
          last = key
          since = Date.now()
        } else if (Date.now() - since >= settleMs) {
          return { status: outcome, state }
        }
      }
      return { status: 'unverified', reason: 'timeout', state: readState() }
    }

    // Refuses anything that could submit or affect payment.
    function guard(control) {
      const label = `${control.getAttribute('aria-label') ?? ''} ${dom.text(control)}`
      const form = control.closest('form')
      if (FORBIDDEN_LABEL.test(label) || (form && !isDiscountForm(form))) {
        throw Object.assign(new Error('refused-unsafe-control'), { reason: 'refused-unsafe-control' })
      }
    }

    function isDiscountForm(form) {
      return Boolean(form?.querySelector(SELECTORS.reductionInput)) && !form.querySelector(SELECTORS.checkoutFields)
    }

    /** Read-only: whether this page can be tested, for the popup. */
    function detect() {
      if (!isDemo && !CHECKOUT_PATH.test(win.location.pathname)) return { supported: false, reason: 'not-checkout' }
      if (all(SELECTORS.reductionInput).length === 0) return { supported: false, reason: 'no-discount-field' }
      const state = readState()
      if (!state.ok) return { supported: false, reason: state.reason }
      return { supported: true, layout: visibleInput() ? 'visible' : 'collapsed', state }
    }

    /** Opens the collapsed order summary (narrow layout) so the discount field shows. */
    async function prepare() {
      if (visibleInput()) return { ok: true }
      const toggle = all(SELECTORS.collapsedToggle)
        .filter(dom.isShown)
        .find(button => /^order summary/i.test(dom.text(button)))
      if (!toggle) {
        return { ok: false, reason: all(SELECTORS.reductionInput).length ? 'discount-field-hidden' : 'no-discount-field' }
      }
      guard(toggle)
      toggle.click()
      return (await dom.waitFor(visibleInput, expandMs, pollMs))
        ? { ok: true, expanded: true }
        : { ok: false, reason: 'discount-field-hidden' }
    }

    async function applyCode(code) {
      const input = visibleInput()
      if (!input || !isDiscountForm(input.form)) {
        return { status: 'unsupported', reason: 'no-discount-field', state: readState() }
      }
      const errorBefore = readError(input)
      dom.setNativeValue(input, code)

      // The labelled Apply button, else the discount form's one visible submit button
      // (the form was checked above to hold no checkout fields).
      const findApply = () =>
        input.form?.querySelector(SELECTORS.applyButton) ??
        [...(input.form?.querySelectorAll('button[type="submit"]') ?? [])].find(
          button => button.getAttribute('aria-hidden') !== 'true' && dom.isShown(button),
        )
      const button = await dom.waitFor(
        () => {
          const candidate = findApply()
          return candidate && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true' ? candidate : null
        },
        enableMs,
        pollMs,
      )
      if (!button) return { status: 'unsupported', reason: 'apply-disabled', state: readState() }

      guard(button)
      button.click()
      const outcome = await settle((state, sawPending) => {
        if (state.appliedCodes.some(applied => sameCode(applied, code))) return 'accepted'
        if (state.errorText && (sawPending || state.errorText !== errorBefore)) return 'rejected'
        return null
      })

      return {
        ...outcome,
        message: outcome.status === 'rejected' ? outcome.state.errorText : outcome.status === 'accepted' ? statusMessage(code) : null,
      }
    }

    async function removeCode(code) {
      const buttons = all(SELECTORS.removeButton).filter(button => sameCode(codeOf(button), code))
      const button = buttons.find(dom.isShown) ?? buttons[0]
      if (!button) return { status: 'unsupported', reason: 'no-remove-button', state: readState() }

      guard(button)
      button.click()
      return settle(state => (state.appliedCodes.some(applied => sameCode(applied, code)) ? null : 'removed'))
    }

    return {
      id: 'sharper-image',
      isDemo,
      detect,
      prepare,
      readState,
      readSettledState,
      applyCode,
      removeCode,
    }
  }

  Janice.createSharperImageAdapter = createSharperImageAdapter
  Janice.sharperImageSelectors = SELECTORS

  if (typeof module === 'object' && module.exports) module.exports = { createSharperImageAdapter, SELECTORS }
})(typeof globalThis === 'object' ? globalThis : this)
