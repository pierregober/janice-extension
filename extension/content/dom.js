/*
 * DOM helpers for content scripts, bound to one window so tests can pass a
 * simulated one.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  function createDom(win) {
    const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

    /** Whether the element is rendered: no display:none or visibility:hidden on it or an ancestor. */
    function isShown(element) {
      if (!element || !element.isConnected) return false
      if (typeof element.checkVisibility === 'function') {
        return element.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
      }
      // Without a layout engine (tests), fall back to the styles that hide things.
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        if (node.hidden) return false
        const style = win.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return false
      }
      return true
    }

    const sleep = ms => new Promise(resolve => win.setTimeout(resolve, ms))

    /** Polls `check` until it returns something truthy, or null after `timeoutMs`. */
    async function waitFor(check, timeoutMs, pollMs) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const value = check()
        if (value) return value
        if (Date.now() >= deadline) return null
        await sleep(pollMs)
      }
    }

    /**
     * Types a value the way a framework-controlled input notices: through the
     * native setter, then input and change events.
     */
    function setNativeValue(input, value) {
      const { set } = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')
      set.call(input, value)
      input.dispatchEvent(new win.Event('input', { bubbles: true }))
      input.dispatchEvent(new win.Event('change', { bubbles: true }))
    }

    return { text, isShown, sleep, waitFor, setNativeValue }
  }

  Janice.createDom = createDom

  if (typeof module === 'object' && module.exports) module.exports = { createDom }
})(typeof globalThis === 'object' ? globalThis : this)
