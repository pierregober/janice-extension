/*
 * Content-script entry, injected by the service worker when the toolbar
 * popup opens on a tab. Opening the popup only reads the page; a run (and
 * every checkout change) starts when the shopper clicks Try coupons.
 *
 * The run lives here, in the page, so closing the popup does not end it.
 * One run per page: a second start while one is active is refused.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice
  if (!Janice || Janice.contentMainLoaded) return
  Janice.contentMainLoaded = true

  let controller = null
  let panel = null
  let lastRun = null
  Janice.runViews ??= new Set()

  // Hands a run update to the service worker; with the extension reloading there is no one to tell.
  async function notify(run) {
    try {
      await chrome.runtime.sendMessage({ type: 'janice:run-update', run })
    } catch {
      // The panel in the page still shows it.
    }
  }

  function report(run) {
    lastRun = run
    panel?.render(run)
    for (const render of Janice.runViews) {
      try { render(run) } catch { /* One closed view must not interrupt checkout. */ }
    }
    void notify(run)
  }

  function detect() {
    const store = Janice.stores.detect(location, document)
    const discovery = Janice.checkoutDiscovery.inspect({ document, location })
    const run = controller?.getState() ?? lastRun
    if (!store) return { store: null, discovery, run }

    const { detection, surface } = Janice.stores.resolveSurface(store, { window })
    // A checkout on a host where coupon testing isn't verified yet (shop.app) is recognized and read, never run.
    const isUntested = store.isTestingVerified === false
    return {
      store,
      discovery,
      surface,
      supported: detection.supported && !isUntested,
      reason: isUntested ? 'unverified-checkout' : detection.reason ?? null,
      layout: detection.layout ?? null,
      preview: detection.state ? { total: detection.state.total, codes: detection.state.appliedCodes } : null,
      run,
    }
  }

  function start({ candidates = [], providerError = null }) {
    if (controller?.isActive()) return { ok: false, reason: 'already-running', run: controller.getState() }

    const store = Janice.stores.detect(location, document)
    if (!store) return { ok: false, reason: 'not-checkout' }
    if (store.isTestingVerified === false) return { ok: false, reason: 'unverified-checkout' }

    const { adapter, detection, surface } = Janice.stores.resolveSurface(store, { window })
    if (!detection.supported) return { ok: false, reason: 'unsupported-checkout' }
    controller = Janice.createRunController({ adapter, store, surface, candidates, providerError, onUpdate: report })

    panel?.destroy()
    panel = surface === 'cart-drawer' ? null : Janice.createPanel({
      window,
      onStop: () => controller?.stop(),
      onClose: () => {
        panel?.destroy()
        panel = null
      },
    })
    panel?.mount()
    void controller.start()

    return { ok: true, run: controller.getState() }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false

    switch (message?.type) {
      case 'janice:ping':
        sendResponse({ ok: true })
        break
      case 'janice:detect':
        sendResponse(detect())
        break
      case 'janice:start':
        sendResponse(start(message))
        break
      case 'janice:stop':
        sendResponse({ ok: Boolean(controller?.stop()) })
        break
      default:
        return false
    }
    return false
  })

  // Leaving or reloading the page ends this document, and the run with it.
  root.addEventListener('pagehide', () => {
    if (!controller?.isActive()) return
    const run = controller.getState()
    void notify({ ...run, status: 'done', updatedAt: Date.now(), result: { kind: 'interrupted', reason: 'page-changed', restoration: 'unverified' } })
  })
})(typeof globalThis === 'object' ? globalThis : this)
