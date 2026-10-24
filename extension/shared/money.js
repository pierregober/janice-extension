/*
 * Money helpers. Every calculation uses integer minor units (cents for USD);
 * Intl formats amounts for display only.
 *
 * Loaded as a classic script in the service worker, the popup and injected
 * content scripts (all sharing `globalThis.Janice`), and with require() in
 * Node tests.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const MINUS = '[\\u2212\\u2012\\u2013\\u2014-]'
  const AMOUNT = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g
  const NEGATIVE_PREFIX = new RegExp(`${MINUS}\\s*(?:[A-Z]{3}\\s*)?[$€£]?\\s*$`)

  // Digits after the decimal point for an ISO 4217 code (USD → 2).
  function minorDigits(currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits
    } catch {
      return 2
    }
  }

  /**
   * Parses one displayed amount ("$1,234.56", "− $15.00") into integer minor
   * units. Returns null for text with no amount, more than one amount, or
   * more fraction digits than the currency has.
   */
  function parseAmount(text, { digits = 2 } = {}) {
    if (typeof text !== 'string') return null

    const clean = text.replace(/ /g, ' ').trim()
    const found = [...clean.matchAll(AMOUNT)]
    if (found.length !== 1) return null

    const [match, whole, fraction = ''] = found[0]
    if (fraction.length > digits) return null

    const major = Number(whole.replace(/,/g, ''))
    const minor = Number(fraction.padEnd(digits, '0') || '0')
    const scale = 10 ** digits
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(major * scale + minor)) return null

    const amount = major * scale + minor
    const isNegative = NEGATIVE_PREFIX.test(clean.slice(0, clean.indexOf(match)))

    return isNegative ? -amount : amount
  }

  /** Formats integer minor units for display, from an exact decimal string. */
  function formatAmount(amountMinor, currency = 'USD', locale = 'en-US') {
    const digits = minorDigits(currency)
    const scale = 10 ** digits
    const absolute = Math.abs(amountMinor)
    const decimal = `${amountMinor < 0 ? '-' : ''}${Math.floor(absolute / scale)}${
      digits > 0 ? `.${String(absolute % scale).padStart(digits, '0')}` : ''
    }`

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(decimal)
  }

  Janice.money = { minorDigits, parseAmount, formatAmount }

  if (typeof module === 'object' && module.exports) module.exports = Janice.money
})(typeof globalThis === 'object' ? globalThis : this)
