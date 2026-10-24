/*
 * Starts the page button. The manifest runs this, after the shared wording,
 * icons and store list, on sharperimage.com pages only: the extension's one
 * host permission. It reads nothing but the page address until the shopper
 * opens the card.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice
  if (!Janice || Janice.launcherStarted) return
  Janice.launcherStarted = true

  if (Janice.stores.detect(root.location, root.document)) Janice.createLauncher({ window: root }).mount()
})(typeof globalThis === 'object' ? globalThis : this)
