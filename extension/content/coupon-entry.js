/*
 * Coupon entry shared by store adapters: the whole code goes into the field
 * at once, as a paste would, with one input event and one change event. The
 * adapter owns Apply, response verification, and restoration. Only a
 * visible, eligible field is written, and the entry counts only if that field
 * still holds the code afterwards: a store's controlled field may rewrite or
 * replace itself during those events.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})
  const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

  async function enterCouponCode({ window: win = root, input, code, isCancelled = () => false, isEligibleInput = () => true } = {}) {
    const doc = win.document
    if (typeof code !== 'string' || !CODE.test(code)) return { ok: false, reason: 'invalid-code' }

    function available() {
      if (!input || input.ownerDocument !== doc || input.tagName !== 'INPUT' || input.type !== 'text'
        || !input.isConnected || input.disabled || input.readOnly || input.matches(':disabled')) return false
      for (let node = input; node?.nodeType === 1; node = node.parentElement) {
        if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
        if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return false
        const style = win.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      }
      if (typeof input.checkVisibility === 'function'
        && !input.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false
      const rect = input.getBoundingClientRect()
      // Logical visibility remains testable in DOMs without a layout engine.
      if (rect.width === 0 && rect.height === 0) return typeof input.checkVisibility !== 'function'
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < win.innerWidth && rect.top < win.innerHeight
    }

    // Why the field can't take the code now, or, given what was entered, no longer holds it.
    function problem(entered) {
      if (isCancelled()) return 'stopped'
      if (!doc || doc.hidden || !available()) return 'page-changed'
      if (!isEligibleInput(input)) return 'codes-changed'
      if (entered !== undefined && input.value !== entered) return 'codes-changed'
      return null
    }

    try {
      const before = problem()
      if (before) return { ok: false, reason: before }
    } catch {
      // A failed ownership check must never permit a write.
      return { ok: false, reason: 'codes-changed' }
    }
    let existing
    try {
      existing = input.value
    } catch {
      return { ok: false, reason: 'codes-changed' }
    }
    if (existing.toUpperCase() === code.toUpperCase()) return { ok: true }

    try {
      const { set } = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')
      set.call(input, code)
      input.setSelectionRange(code.length, code.length)
      input.dispatchEvent(typeof win.InputEvent === 'function'
        ? new win.InputEvent('input', { bubbles: true, data: code, inputType: 'insertText' })
        : new win.Event('input', { bubbles: true }))
      const afterInput = problem(code)
      if (afterInput) return { ok: false, reason: afterInput }
      input.dispatchEvent(new win.Event('change', { bubbles: true }))
      const afterChange = problem(code)
      return afterChange ? { ok: false, reason: afterChange } : { ok: true }
    } catch {
      return { ok: false, reason: 'page-changed' }
    }
  }

  Janice.enterCouponCode = enterCouponCode
  if (typeof module === 'object' && module.exports) module.exports = { enterCouponCode }
})(typeof globalThis === 'object' ? globalThis : this)
