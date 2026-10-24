/*
 * Store detection: which supported store, if any, the page belongs to, and
 * which adapter integrates with its checkout. Adding a store adds an entry
 * and an adapter; the comparison logic does not change.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') {
    require('./adapters/sharper-image.js')
    require('./adapters/sharper-image-drawer.js')
    require('./shopify.js')
  }

  const Janice = root.Janice || (root.Janice = {})

  const STORES = {
    'sharper-image-us': {
      id: 'sharper-image-us',
      name: 'Sharper Image',
      currency: 'USD',
      hosts: ['sharperimage.com', 'www.sharperimage.com'],
      checkoutPath: /^\/checkouts\//,
      // Observed: the store's Shopify shop, named on its checkout pages on every host.
      shopifyShopId: '85659779361',
      // Observed: /checkout redirects to the current cart's checkout.
      checkoutUrl: 'https://sharperimage.com/checkout',
      createAdapter: options => Janice.createSharperImageAdapter(options),
    },
  }

  // Shopify also serves a store's checkout on hosts of its own. Shoppers signed in to Shop are redirected from
  // the store's /checkout to shop.app (observed 2026-10-24). There the store is known only from the checkout
  // page, by its Shopify shop ID, and the ID in the address must agree. Try coupons stays off on these hosts
  // until a supervised run confirms the store's responses there.
  const SHOPIFY_CHECKOUT_HOSTS = {
    'shop.app': { checkoutPath: /^\/checkout\/(\d+)\/(?:cn|c)\//, isTestingVerified: false },
  }

  // The local Demo checkout fixture names the store it simulates; it is only
  // recognized on these hosts and every result from it is labeled Demo.
  const DEMO_HOSTS = ['localhost', '127.0.0.1']
  const DEMO_MARKER = 'meta[name="janice-demo-checkout"]'

  function describe(store, isDemo, page) {
    return { id: store.id, name: store.name, currency: store.currency, isDemo, page }
  }

  /** The store the page belongs to, or null. */
  function detect(location, document) {
    const host = location.hostname.toLowerCase()

    for (const store of Object.values(STORES)) {
      if (store.hosts.includes(host)) {
        return describe(store, false, store.checkoutPath.test(location.pathname) ? 'checkout' : 'store')
      }
    }

    if (Object.hasOwn(SHOPIFY_CHECKOUT_HOSTS, host)) {
      const { checkoutPath, isTestingVerified } = SHOPIFY_CHECKOUT_HOSTS[host]
      const shop = Janice.shopify?.recognize(document)
      const store = shop && checkoutPath.exec(location.pathname)?.[1] === shop.id && Object.values(STORES).find(candidate => candidate.shopifyShopId === shop.id)
      return store ? { ...describe(store, false, 'checkout'), checkoutHost: host, isTestingVerified } : null
    }

    const marker = DEMO_HOSTS.includes(host) && document.querySelector(DEMO_MARKER)
    const simulated = marker && STORES[marker.getAttribute('content')]
    return simulated ? describe(simulated, true, 'checkout') : null
  }

  function createAdapter(store, options = {}) {
    return STORES[store.id].createAdapter({ ...options, isDemo: store.isDemo })
  }

  function resolveSurface(store, options = {}) {
    if (store.page === 'checkout') {
      const adapter = createAdapter(store, options)
      return { surface: 'checkout', adapter, detection: adapter.detect() }
    }
    if (store.id === 'sharper-image-us' && Janice.createSharperImageDrawerAdapter) {
      const win = options.window ?? root
      const typeCode = options.typeCode ?? ((input, code, entry) => Janice.enterCouponCode({ window: win, input, code, ...entry }))
      const adapter = Janice.createSharperImageDrawerAdapter({ ...options, typeCode, isDemo: store.isDemo })
      const detection = adapter.detect()
      if (detection.supported) return { surface: 'cart-drawer', adapter, detection }
    }
    return { surface: null, adapter: null, detection: { supported: false, reason: 'not-checkout' } }
  }

  /** Whether a page on this host could be a supported store's checkout or the Demo fixture, before injecting anything. */
  function isCandidateHost(hostname) {
    const host = String(hostname).toLowerCase()
    return DEMO_HOSTS.includes(host) || Object.hasOwn(SHOPIFY_CHECKOUT_HOSTS, host) || Object.values(STORES).some(store => store.hosts.includes(host))
  }

  Janice.stores = { STORES, detect, createAdapter, resolveSurface, isCandidateHost }

  if (typeof module === 'object' && module.exports) module.exports = Janice.stores
})(typeof globalThis === 'object' ? globalThis : this)
