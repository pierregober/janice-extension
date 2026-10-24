/*
 * Store detection: which supported store, if any, the page belongs to, and
 * which adapter integrates with its checkout. Adding a store adds an entry
 * and an adapter; the comparison logic does not change.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') require('./adapters/sharper-image.js')

  const Janice = root.Janice || (root.Janice = {})

  const STORES = {
    'sharper-image-us': {
      id: 'sharper-image-us',
      name: 'Sharper Image',
      currency: 'USD',
      hosts: ['sharperimage.com', 'www.sharperimage.com'],
      checkoutPath: /^\/checkouts\//,
      // Observed: /checkout redirects to the current cart's checkout.
      checkoutUrl: 'https://sharperimage.com/checkout',
      createAdapter: options => Janice.createSharperImageAdapter(options),
    },
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

    const marker = DEMO_HOSTS.includes(host) && document.querySelector(DEMO_MARKER)
    const simulated = marker && STORES[marker.getAttribute('content')]
    return simulated ? describe(simulated, true, 'checkout') : null
  }

  function createAdapter(store, options = {}) {
    return STORES[store.id].createAdapter({ ...options, isDemo: store.isDemo })
  }

  /** Whether a page on this host could be a supported store or the Demo fixture, before injecting anything. */
  function isCandidateHost(hostname) {
    const host = String(hostname).toLowerCase()
    return DEMO_HOSTS.includes(host) || Object.values(STORES).some(store => store.hosts.includes(host))
  }

  Janice.stores = { STORES, detect, createAdapter, isCandidateHost }

  if (typeof module === 'object' && module.exports) module.exports = Janice.stores
})(typeof globalThis === 'object' ? globalThis : this)
