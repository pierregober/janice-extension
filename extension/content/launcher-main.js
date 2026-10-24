/*
 * Starts the page button. The manifest runs this, after the shared wording,
 * icons and store list, on sharperimage.com pages and shop.app checkout pages
 * only: the extension's host permissions. The button shows only on a supported
 * store's pages; on shop.app, the checkout's own Shopify shop record says
 * whose checkout it is. Read-only promo metadata discovery updates its hint as
 * controls appear. Opening the card or finding a visible drawer promo field
 * checks candidate availability. Use code explicitly fills a drawer promo
 * input; Try coupons authorizes the verified checkout test runner.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice
  if (!Janice || Janice.launcherStarted) return
  Janice.launcherStarted = true

  if (Janice.stores.detect(root.location, root.document)) Janice.createLauncher({ window: root }).mount()
})(typeof globalThis === 'object' ? globalThis : this)
