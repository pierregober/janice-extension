/*
 * Sharper Image's cart drawer, inspected live on 2026-10-24. Only its
 * dedicated promo Apply/Remove buttons are operated. /cart.js is read-only:
 * retain currency, totals, applicable code names and item identity fields;
 * never retain cart tokens, notes, customer attributes or payment data.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') {
    require('../../shared/compare.js')
    require('../dom.js')
  }
  const Janice = root.Janice || (root.Janice = {})
  const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  const SELECTORS = {
    drawer: '#shopify-section-cart-drawer',
    component: 'discount-code-component',
    input: 'input[name="discount_code"]',
    apply: 'button[type="button"][data-qa="promo-apply"]',
    remove: 'button[type="button"][data-discount-code][data-qa^="promo-remove-"]',
    error: '.cart-discount-code__message__item--is-error p',
    busy: '[aria-busy="true"]',
  }

  function createSharperImageDrawerAdapter({ window: win = root, timing = {}, isDemo = false, typeCode } = {}) {
    const doc = win.document
    const dom = Janice.createDom(win)
    const { sameCode, sameCodes } = Janice.compare
    const { pollMs = 100, settleMs = 600, timeoutMs = 20000 } = timing
    let cart = null
    let waiting = null
    let draft = null
    let hasSubmitted = false
    const ownedDrafts = new Set()
    const allowedOrigin = () => win.location.origin === 'https://sharperimage.com' ||
      (isDemo && ['localhost', '127.0.0.1'].includes(win.location.hostname))
    const drawer = () => doc.querySelector(SELECTORS.drawer)
    const component = () => drawer()?.querySelector(SELECTORS.component)
    const input = () => component()?.querySelector(SELECTORS.input)
    const applyButton = () => component()?.querySelector(SELECTORS.apply)

    function shown(element) {
      if (!element?.isConnected) return false
      for (let node = element; node?.nodeType === 1; node = node.parentElement) {
        if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
      }
      return dom.isShown(element)
    }

    function safeControl(button, kind) {
      const owner = component()
      const selector = kind === 'remove' ? SELECTORS.remove : SELECTORS.apply
      return allowedOrigin() && owner && button?.matches(selector) && owner.contains(button) && shown(button) &&
        button.type === 'button' && !/\b(pay|checkout|place order|submit order|buy now)\b/i.test(`${button.getAttribute('aria-label') ?? ''} ${dom.text(button)}`)
    }

    function readableInput(field) {
      return allowedOrigin() && field === input() && field?.type === 'text' && shown(field) &&
        !field.disabled && !field.readOnly && !field.matches(':disabled')
    }

    function domCodes() {
      const codes = []
      for (const button of component()?.querySelectorAll(SELECTORS.remove) ?? []) {
        const code = button.getAttribute('data-discount-code') ?? ''
        if (!codes.some(seen => sameCode(seen, code))) codes.push(code)
      }
      return codes
    }

    function errorFor(code) {
      const errors = [...(component()?.querySelectorAll(SELECTORS.error) ?? [])].map(dom.text)
      return errors.find(message => message.toUpperCase().includes(code.toUpperCase())) ?? null
    }

    function pendingUi() {
      const button = applyButton()
      return drawer()?.getAttribute('data-is-updating') === 'true' || Boolean(drawer()?.querySelector(SELECTORS.busy)) ||
        Boolean(button?.disabled || button?.getAttribute('aria-disabled') === 'true')
    }

    function sanitizeCart(value) {
      if (!value || !/^[A-Z]{3}$/.test(value.currency ?? '') ||
        !Number.isSafeInteger(value.total_price) || value.total_price < 0 ||
        !Array.isArray(value.items) || value.items.length === 0 || !Array.isArray(value.discount_codes)) return null
      const items = value.items.map(item => ({ variant: item.variant_id, quantity: item.quantity, originalLine: item.original_line_price }))
      if (items.some(item => !Number.isSafeInteger(item.variant) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        !Number.isSafeInteger(item.originalLine) || item.originalLine < 0)) return null
      const activeCodes = value.discount_codes.filter(entry => entry?.applicable === true).map(entry => entry.code)
      if (activeCodes.some(code => typeof code !== 'string')) return null
      return {
        currency: value.currency,
        amountMinor: value.total_price,
        subtotalMinor: Number.isSafeInteger(value.items_subtotal_price) ? value.items_subtotal_price : null,
        codes: activeCodes,
        items,
      }
    }

    async function refreshCart(budgetMs = timeoutMs) {
      if (!allowedOrigin()) return { ok: false, reason: 'not-checkout' }
      const abort = new win.AbortController()
      const timer = win.setTimeout(() => abort.abort(), budgetMs)
      try {
        const response = await win.fetch('/cart.js', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: abort.signal,
        })
        if (!response.ok) return { ok: false, reason: response.status === 429 ? 'blocked' : 'cart-unreadable' }
        const next = sanitizeCart(await response.json())
        if (!next) return { ok: false, reason: 'cart-unreadable' }
        cart = next
        return { ok: true }
      } catch {
        return { ok: false, reason: abort.signal.aborted ? 'timeout' : 'cart-unreadable' }
      } finally {
        win.clearTimeout(timer)
      }
    }

    function readState() {
      if (!allowedOrigin()) return { ok: false, reason: 'not-checkout', pending: false }
      if (!shown(drawer()) || !component()) return { ok: false, reason: 'discount-field-hidden', pending: false }
      if (!cart) return { ok: false, reason: 'cart-unreadable', pending: Boolean(waiting) || pendingUi() }
      const tags = domCodes()
      if (!sameCodes(tags, cart.codes)) return { ok: false, reason: 'cart-unreadable', pending: Boolean(waiting) || pendingUi() }
      const unrecognized = [...cart.codes, ...tags].filter(code => !CODE.test(code))
      return {
        ok: true,
        pending: Boolean(waiting) || pendingUi(),
        total: { amountMinor: cart.amountMinor, currency: cart.currency, basis: 'cart-total', shippingIncluded: false, taxIncluded: false },
        subtotalMinor: cart.subtotalMinor,
        appliedCodes: [...cart.codes],
        unrestorable: [...new Set(unrecognized)],
        cartIdentity: JSON.stringify(cart.items.map(item => [item.variant, item.quantity, item.originalLine]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))),
        errorText: [...(component()?.querySelectorAll(SELECTORS.error) ?? [])].map(dom.text).join(' ') || null,
        page: win.location.origin + win.location.pathname,
      }
    }

    function detect() {
      if (!allowedOrigin()) return { supported: false, reason: 'not-checkout' }
      if (!shown(drawer()) || !shown(input())) return { supported: false, reason: 'discount-field-hidden' }
      if (!readableInput(input()) || !safeControl(applyButton(), 'apply')) return { supported: false, reason: 'no-discount-field' }
      const state = readState()
      return { supported: true, layout: 'cart-drawer', state: state.ok ? state : null }
    }

    const uiFingerprint = () => JSON.stringify([Boolean(component()), domCodes(), dom.text(component()?.querySelector('.cart-discount-code__message')), pendingUi()])
    function classifyWaiting() {
      if (!waiting) return null
      // The store clears BUSY before its async section render can finish.
      // Its verified successful update replaces this component/input; READY
      // or a stale same-code error on the previous node is not completion.
      if (!component() || component() === waiting.componentBefore) return null
      if (waiting.kind === 'remove') return domCodes().some(code => sameCode(code, waiting.code)) ? null : 'removed'
      if (domCodes().some(code => sameCode(code, waiting.code))) return 'accepted'
      // Both observed responses clear the field. Old errors remain during a
      // subsequent request, so require this request's code and cleared input.
      return input()?.value === '' && errorFor(waiting.code) ? 'rejected' : null
    }

    function cartConfirms(kind) {
      if (!waiting || !cart) return false
      if (!sameCodes(domCodes(), cart.codes)) return false
      const present = cart.codes.some(code => sameCode(code, waiting.code))
      return kind === 'accepted' ? present : !present
    }

    async function stableUi(deadline) {
      let last = null
      let since = Date.now()
      while (Date.now() < deadline) {
        if (!shown(drawer()) || !component()) return { ok: false, reason: 'discount-field-hidden' }
        const key = uiFingerprint()
        if (pendingUi() || key !== last || (waiting && !classifyWaiting())) {
          last = key
          since = Date.now()
        } else if (Date.now() - since >= settleMs) return { ok: true }
        await dom.sleep(pollMs)
      }
      return { ok: false, reason: 'checkout-busy' }
    }

    async function readSettledState() {
      const deadline = Date.now() + timeoutMs
      const ui = await stableUi(deadline)
      if (!ui.ok) return { ok: false, reason: ui.reason, pending: Boolean(waiting) || pendingUi() }
      // One server read after the UI settles, not a request on every DOM poll.
      const fresh = await refreshCart(Math.max(1, deadline - Date.now()))
      if (!fresh.ok) return { ok: false, reason: fresh.reason, pending: Boolean(waiting) || pendingUi() }
      if (waiting) {
        const outcome = classifyWaiting()
        if (!outcome || !cartConfirms(outcome)) return { ok: false, reason: 'checkout-busy', pending: true }
        waiting = null
      }
      const state = readState()
      if (!state.ok || state.pending) return { ok: false, reason: state.reason ?? 'checkout-busy', pending: state.pending }
      return state
    }

    async function prepare() {
      const result = detect()
      if (!result.supported) return { ok: false, reason: result.reason }
      if (draft === null) draft = input().value
      return { ok: true }
    }

    async function applyCode(code, { isCancelled = () => false } = {}) {
      const field = input()
      if (typeof code !== 'string' || !CODE.test(code) || !readableInput(field)) return { status: 'unsupported', reason: 'no-discount-field', state: readState() }
      if (!safeControl(applyButton(), 'apply')) return { status: 'unsupported', reason: 'apply-disabled', state: readState() }
      if (isCancelled()) return { status: 'canceled', reason: 'stopped', state: readState() }
      if (hasSubmitted && field.value !== '') return { status: 'unverified', reason: 'codes-changed', state: readState() }
      const before = cart ? readState() : await readSettledState()
      if (!before.ok || before.pending) return { status: 'unverified', reason: before.reason ?? 'checkout-busy', state: before }
      const typed = typeCode
        ? await typeCode(field, code, { isCancelled, isEligibleInput: candidate => readableInput(candidate) })
        : (dom.setNativeValue(field, code), { ok: true })
      if (!typed?.ok || isCancelled()) {
        if ((typed?.reason === 'stopped' || isCancelled()) && readableInput(field) && code.startsWith(field.value)) ownedDrafts.add(field.value)
        return { status: typed?.reason === 'stopped' || isCancelled() ? 'canceled' : 'unverified', reason: typed?.reason ?? 'stopped', state: readState() }
      }
      ownedDrafts.add(code)
      if (!readableInput(field) || field !== input() || field.value !== code) return { status: 'unverified', reason: 'codes-changed', state: readState() }
      // Entering the code yields to the page. Re-read server identity
      // and active codes before the irreversible Apply request, not only
      // after it, so a cart/discount edit during that interval is preserved.
      const fresh = await refreshCart()
      if (!fresh.ok) return { status: 'unverified', reason: fresh.reason, state: { ok: false, reason: fresh.reason, pending: false } }
      if (!sameCodes(cart.codes, before.appliedCodes) || !sameCodes(domCodes(), cart.codes)) {
        return { status: 'unverified', reason: 'codes-changed', state: readState() }
      }
      const current = readState()
      if (!current.ok || current.pending) return { status: 'unverified', reason: current.reason ?? 'checkout-busy', state: current }
      if (current.page !== before.page) return { status: 'unverified', reason: 'page-changed', state: current }
      if (current.cartIdentity !== before.cartIdentity) return { status: 'unverified', reason: 'cart-changed', state: current }
      if (!readableInput(field) || field !== input() || field.value !== code) return { status: 'unverified', reason: 'codes-changed', state: readState() }
      const button = applyButton()
      if (!safeControl(button, 'apply') || button.disabled || button.getAttribute('aria-disabled') === 'true') return { status: 'unsupported', reason: 'apply-disabled', state: readState() }
      if (isCancelled()) return { status: 'canceled', reason: 'stopped', state: readState() }
      waiting = { kind: 'apply', code, componentBefore: component() }
      hasSubmitted = true
      button.click()
      const state = await readSettledState()
      if (!state.ok) return { status: 'unverified', reason: state.reason, state }
      const accepted = state.appliedCodes.some(applied => sameCode(applied, code))
      return { status: accepted ? 'accepted' : 'rejected', message: accepted ? `${code} is applied in the cart.` : errorFor(code), state }
    }

    async function removeCode(code) {
      const button = [...(component()?.querySelectorAll(SELECTORS.remove) ?? [])].find(control => sameCode(control.getAttribute('data-discount-code'), code))
      if (!safeControl(button, 'remove') || button.disabled) return { status: 'unsupported', reason: 'no-remove-button', state: readState() }
      waiting = { kind: 'remove', code, componentBefore: component() }
      button.click()
      const state = await readSettledState()
      return state.ok ? { status: 'removed', state } : { status: 'unverified', reason: state.reason, state }
    }

    function restoreDraft() {
      const field = input()
      if (draft === null) return { ok: true }
      if (!readableInput(field)) return { ok: false, reason: 'discount-field-hidden' }
      if (field.value !== '' && field.value !== draft && !ownedDrafts.has(field.value)) return { ok: false, reason: 'codes-changed' }
      if (field.value !== draft) dom.setNativeValue(field, draft)
      return { ok: field.value === draft }
    }

    return { id: 'sharper-image-drawer', isDemo, detect, prepare, readState, readSettledState, applyCode, removeCode, restoreDraft }
  }

  Janice.createSharperImageDrawerAdapter = createSharperImageDrawerAdapter
  if (typeof module === 'object' && module.exports) module.exports = { createSharperImageDrawerAdapter, SELECTORS }
})(typeof globalThis === 'object' ? globalThis : this)
