/*
 * Read-only checkout discovery. A matching field is a hint, never an adapter
 * compatibility claim. inspect() returns only counts/booleans: it does not
 * read field values, payment data, or the document's body text, and never
 * opens a disclosure, focuses an input, or clicks an Apply control.
 *
 * canApply describes the presence of an explicitly labelled, locally
 * associated coupon Apply control. It does not authorize or perform a run.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})
  const EXCLUDED_TYPES = new Set(['hidden', 'password', 'search', 'email', 'tel', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'file', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'range', 'color'])
  const PROMO = /\b(?:coupons?(?:\s*codes?)?|promo(?:tion(?:al)?)?(?:\s*codes?)?|discount(?:\s*codes?)?|vouchers?(?:\s*codes?)?|reductions?)\b/
  const PRIVATE = /\b(?:password|passcode|one\s+time|otp|verification|security|cvv|cvc|csc|card\s*(?:number|holder)|credit\s+card|email|e\s+mail|phone|telephone|(?:first|last|full)\s+name|address|postal|zip|city|country|search|login|log\s+in|sign\s+in)\b/
  const PAYMENT_ACTION = /\b(?:pay(?:ment)?|checkout|check\s+out|order|purchase|buy|continue|proceed|complete)\b/
  const OWN_UI = '[data-janice-launcher], [data-janice-panel], [data-janice-inline], janice-coupons-launcher, janice-coupons-panel, janice-inline-coupon'
  const CART_DRAWER = '[id*="shopify-section-cart-drawer"], .shopify-section-cart-drawer, [id^="shopify-section-"][id$="__cart-drawer"]'

  const normalize = value => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim()
  const attribute = (element, name) => element.getAttribute(name) ?? ''

  function fieldMetadata(input, document) {
    const labelledBy = attribute(input, 'aria-labelledby').split(/\s+/).filter(Boolean)
    return normalize([
      attribute(input, 'name'), attribute(input, 'id'), attribute(input, 'placeholder'),
      attribute(input, 'aria-label'),
      ...Array.from(input.labels ?? [], label => label.textContent ?? ''),
      ...labelledBy.map(id => document.getElementById(id)?.textContent ?? ''),
    ].join(' '))
  }

  function isPromoInput(input, document) {
    if (EXCLUDED_TYPES.has(input.type) || input.disabled || input.readOnly || input.matches(':disabled') || input.closest(OWN_UI)) return false
    const autocomplete = normalize(attribute(input, 'autocomplete'))
    if (/\b(?:cc\s|one\s+time\s+code|email|tel|name|address|postal\s+code|username|password)/.test(autocomplete)) return false
    const metadata = fieldMetadata(input, document)
    // A shared "Discount code or gift card" control is a promo field;
    // gift-card-only controls have none of the required promo terms.
    return PROMO.test(metadata) && !PRIVATE.test(metadata)
  }

  function isVisible(input, window) {
    // checkVisibility() describes rendered CSS boxes; aria-hidden and inert
    // also matter when a drawer remains rendered while it is closed.
    for (let node = input; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
      if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return false
      const style = window?.getComputedStyle(node)
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false
    }
    if (typeof input.checkVisibility === 'function') {
      return input.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
    }
    return true
  }

  function isVisibleDrawerField(input, window) {
    if (!isVisible(input, window)) return false
    // Off-canvas drawers can be rendered and pass checkVisibility(). Only
    // signal a drawer field once its box intersects the shopper's viewport.
    const rect = input.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return typeof input.checkVisibility !== 'function'
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight
  }

  function hasApply(input) {
    // Explicit form association also supports controls using form="…".
    // Without a form, only inspect a narrow input wrapper/group, not the page.
    const container = input.form ?? input.closest('fieldset, [role="group"]') ?? input.parentElement
    if (!container) return false
    const controls = input.form
      ? Array.from(input.form.elements)
      : Array.from(container.querySelectorAll('button, input[type="button"], input[type="submit"]'))
    return controls.some(control => {
      if (control.tagName !== 'BUTTON' && !(control.tagName === 'INPUT' && ['button', 'submit'].includes(control.type))) return false
      if (control.getAttribute('aria-hidden') === 'true' || control.closest(OWN_UI)) return false
      const label = normalize([attribute(control, 'aria-label'), control.tagName === 'INPUT' ? attribute(control, 'value') : control.textContent].join(' '))
      if (PAYMENT_ACTION.test(label)) return false
      // A disabled Apply button still identifies the control: many checkout
      // forms enable it only after a code is entered. "Submit" alone never does.
      return /^(?:apply|redeem|use)(?:\s|$)/.test(label)
    })
  }

  // DOM references stay local to the content script. inspect() continues to
  // send only counts/booleans across the extension message boundary.
  function findVisibleDrawerInputs({ document } = {}) {
    if (!document) return []
    return Array.from(document.querySelectorAll('input')).filter(input =>
      input.closest(CART_DRAWER) && isPromoInput(input, document) && isVisibleDrawerField(input, document.defaultView),
    )
  }

  /**
   * Returns {kind, fieldCount, visibleFieldCount, canApply, checkoutHint,
   * cartDrawer:{present,fieldCount,visibleFieldCount}}.
   * `kind` is promo-field when at least one likely field is present, checkout
   * for a checkout route without a field, otherwise none. Hidden/collapsed
   * fields count but do not contribute to visibleFieldCount. Call again when
   * page controls change; the function holds no state or observers.
   */
  function inspect({ document, location = document?.location } = {}) {
    const checkoutHint = /(?:^|\/)checkouts?(?:\/|$)/i.test(location?.pathname ?? '')
    const fields = document ? Array.from(document.querySelectorAll('input')).filter(input => isPromoInput(input, document)) : []
    const drawerFields = fields.filter(input => input.closest(CART_DRAWER))
    return {
      kind: fields.length ? 'promo-field' : checkoutHint ? 'checkout' : 'none',
      fieldCount: fields.length,
      visibleFieldCount: fields.filter(input => isVisible(input, document.defaultView)).length,
      canApply: fields.some(hasApply),
      checkoutHint,
      cartDrawer: {
        present: Boolean(document?.querySelector(CART_DRAWER)),
        fieldCount: drawerFields.length,
        visibleFieldCount: drawerFields.filter(input => isVisibleDrawerField(input, document.defaultView)).length,
      },
    }
  }

  Janice.checkoutDiscovery = { inspect, findVisibleDrawerInputs }
  if (typeof module === 'object' && module.exports) module.exports = Janice.checkoutDiscovery
})(typeof globalThis === 'object' ? globalThis : this)
