/*
 * Coupon providers supply candidate codes for a store. A candidate is an
 * offer, not a result: only the store's checkout decides whether a code
 * works and what it saves, so nothing here is used to skip or score codes.
 *
 *   interface CouponProvider {
 *     id: string
 *     getCandidates(storeId: string): Promise<Candidate[]>  // [] when none
 *   }
 *
 *   Candidate {
 *     id, code, storeId, providerId,
 *     offerText,                 // as supplied, for display
 *     advertisedDiscount,        // { type, amountMinor, currency } or null
 *     advertisedMinimumSpend,    // { amountMinor, currency, inclusive, basis } or null
 *     expiresAt, restrictions    // null when unknown
 *   }
 *
 * A real API adapter replaces the local provider by implementing the same
 * interface; callers only see `getCandidates`.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  class ProviderError extends Error {
    constructor(code, message) {
      super(message)
      this.name = 'ProviderError'
      this.code = code
    }
  }

  function toCandidate(coupon, providerId) {
    return {
      id: String(coupon.id),
      code: coupon.code.trim(),
      storeId: coupon.storeId,
      providerId,
      offerText: typeof coupon.offerText === 'string' ? coupon.offerText : null,
      advertisedDiscount: coupon.advertisedDiscount ?? null,
      advertisedMinimumSpend: coupon.advertisedMinimumSpend ?? null,
      expiresAt: coupon.expiresAt ?? null,
      restrictions: coupon.restrictions ?? null,
    }
  }

  Janice.providers = Object.assign(Janice.providers || {}, { ProviderError, toCandidate })

  if (typeof module === 'object' && module.exports) module.exports = Janice.providers
})(typeof globalThis === 'object' ? globalThis : this)
