/*
 * The first-version provider: the bundled, user-supplied dataset
 * (data/mock-coupons.json). No account, key, backend or network request.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') require('./coupon-provider.js')

  const Janice = root.Janice || (root.Janice = {})
  const { ProviderError, toCandidate } = Janice.providers

  function validate(data) {
    const isValid =
      data &&
      data.schemaVersion === 1 &&
      data.provider &&
      typeof data.provider.id === 'string' &&
      Array.isArray(data.stores) &&
      Array.isArray(data.coupons) &&
      data.coupons.every(
        coupon =>
          coupon &&
          typeof coupon.code === 'string' &&
          coupon.code.trim() !== '' &&
          typeof coupon.storeId === 'string',
      )

    if (!isValid) throw new ProviderError('invalid-dataset', 'the coupon data is not in the expected format')

    return data
  }

  /**
   * @param {{ loadDataset: () => Promise<unknown> | unknown }} options
   *   reads the dataset: fetch() of the bundled file in the extension, a
   *   file read in tests.
   */
  function createLocalMockProvider({ loadDataset }) {
    let pending = null

    async function dataset() {
      pending ??= (async () => validate(await loadDataset()))()
      try {
        return await pending
      } catch (error) {
        pending = null
        throw error instanceof ProviderError
          ? error
          : new ProviderError('unavailable', 'the coupon data could not be read')
      }
    }

    return {
      id: 'local-mock',
      async getCandidates(storeId) {
        const data = await dataset()

        return data.coupons
          .filter(coupon => coupon.storeId === storeId)
          .map(coupon => toCandidate(coupon, data.provider.id))
      },
    }
  }

  Janice.providers.createLocalMockProvider = createLocalMockProvider

  if (typeof module === 'object' && module.exports) module.exports = Janice.providers
})(typeof globalThis === 'object' ? globalThis : this)
