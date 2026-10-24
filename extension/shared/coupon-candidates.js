/* Candidate preparation only. An entered code has no advertised or observed savings. */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})
  const MAX_CODES = 20
  const MAX_TEXT = 2000
  const MAX_CODE_LENGTH = 64
  const VALID_CODE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

  function validateCode(code) {
    if (typeof code !== 'string' || !code || code.length > MAX_CODE_LENGTH || !VALID_CODE.test(code)) {
      throw new Error('Use codes of up to 64 letters, numbers, hyphens or underscores.')
    }
    return code
  }

  function parseCodes(text = '') {
    if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Enter up to 2,000 characters of coupon codes.')
    const seen = new Set()
    const codes = []
    for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
      const code = validateCode(part)
      const key = code.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      codes.push(code)
      if (codes.length > MAX_CODES) throw new Error('Try up to 20 different codes per run, including the coupons Janice found.')
    }
    return codes
  }

  function mergeCandidates(providerCandidates, additionalCodes = '') {
    if (!Array.isArray(providerCandidates)) throw new Error('The coupon candidates could not be read.')
    const seen = new Set()
    const candidates = []
    const add = candidate => {
      const code = validateCode(typeof candidate?.code === 'string' ? candidate.code.trim() : null)
      const key = code.toUpperCase()
      if (seen.has(key)) return
      seen.add(key)
      candidates.push({ ...candidate, code })
      if (candidates.length > MAX_CODES) throw new Error('Try up to 20 different codes per run, including the coupons Janice found.')
    }
    for (const candidate of providerCandidates) add(candidate)
    for (const code of parseCodes(additionalCodes)) add({ code, source: { kind: 'shopper-entered' } })
    return candidates
  }

  Janice.couponCandidates = { parseCodes, mergeCandidates, MAX_CODES, MAX_TEXT, MAX_CODE_LENGTH }
  if (typeof module === 'object' && module.exports) module.exports = Janice.couponCandidates
})(typeof globalThis === 'object' ? globalThis : this)
