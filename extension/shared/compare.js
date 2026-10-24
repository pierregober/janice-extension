/*
 * Comparison of checkout totals. A candidate wins only with a verified,
 * comparable total strictly lower than the baseline; the baseline keeps
 * ties, worse totals, rejections and anything that cannot be compared.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  /** Discount codes compare case-insensitively, as Shopify treats them. */
  function sameCode(a, b) {
    return String(a).trim().toUpperCase() === String(b).trim().toUpperCase()
  }

  /** Whether two code lists hold the same codes, in any order. */
  function sameCodes(a, b) {
    return a.length === b.length && a.every(code => b.some(other => sameCode(code, other)))
  }

  /**
   * Whether two totals measure the same thing: the same currency, the same
   * amount type, and the same shipping and tax inclusion.
   */
  function isComparable(a, b) {
    return (
      Boolean(a && b) &&
      a.currency === b.currency &&
      a.basis === b.basis &&
      a.shippingIncluded === b.shippingIncluded &&
      a.taxIncluded === b.taxIncluded
    )
  }

  /**
   * Picks the lowest verified comparable total among the baseline and the
   * accepted attempts. Earlier entries win ties, so the baseline keeps them.
   */
  function chooseBest(baselineTotal, attempts) {
    let best = { source: 'baseline', total: baselineTotal }

    for (const attempt of attempts) {
      if (attempt.outcome !== 'accepted' || !isComparable(baselineTotal, attempt.total)) continue
      if (attempt.total.amountMinor < best.total.amountMinor) {
        best = { source: 'candidate', code: attempt.code, total: attempt.total }
      }
    }

    return best
  }

  Janice.compare = { sameCode, sameCodes, isComparable, chooseBest }

  if (typeof module === 'object' && module.exports) module.exports = Janice.compare
})(typeof globalThis === 'object' ? globalThis : this)
