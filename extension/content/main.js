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

  function report(run) {
    lastRun = run
    panel?.render(run)
    chrome.runtime.sendMessage({ type: 'janice:run-update', run }).catch(() => {})
  }

  function detect() {
    const store = Janice.stores.detect(location, document)
    const run = controller?.getState() ?? lastRun
    if (!store) return { store: null, run }
    if (store.page !== 'checkout') return { store, supported: false, reason: 'not-checkout', run }

    const detection = Janice.stores.createAdapter(store, { window }).detect()
    return {
      store,
      supported: detection.supported,
      reason: detection.reason ?? null,
      layout: detection.layout ?? null,
      preview: detection.state ? { total: detection.state.total, codes: detection.state.appliedCodes } : null,
      run,
    }
  }

  function start({ candidates = [], providerError = null }) {
    if (controller?.isActive()) return { ok: false, reason: 'already-running', run: controller.getState() }

    const store = Janice.stores.detect(location, document)
    if (!store || store.page !== 'checkout') return { ok: false, reason: 'not-checkout' }

    const adapter = Janice.stores.createAdapter(store, { window })
    controller = Janice.createRunController({ adapter, store, candidates, providerError, onUpdate: report })

    panel?.destroy()
    panel = Janice.createPanel({
      window,
      onStop: () => controller?.stop(),
      onClose: () => {
        panel?.destroy()
        panel = null
      },
    })
    panel.mount()
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
    chrome.runtime
      .sendMessage({
        type: 'janice:run-update',
        run: { ...run, status: 'done', updatedAt: Date.now(), result: { kind: 'interrupted', reason: 'page-changed', restoration: 'unverified' } },
      })
      .catch(() => {})
  })
})(typeof globalThis === 'object' ? globalThis : this)
