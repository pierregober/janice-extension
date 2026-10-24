/*
 * Inline SVG for the Janice mark and the state icons, shared by the popup,
 * the checkout panel and the page button. Inline markup means the parts
 * shown in the store's page need no extension images exposed to it.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  // The toolbar icon's price tag, white tile and purple tag, for purple headers.
  const LOGO =
    '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect width="24" height="24" rx="5.3" fill="#ffffff"/>' +
    '<path transform="rotate(-35 12 12)" fill="#5b2c91" fill-rule="evenodd" ' +
    'd="M4.8 12 8.64 7.2H19.2v9.6H8.64ZM10.2 12a1.32 1.32 0 1 0-2.64 0 1.32 1.32 0 1 0 2.64 0Z"/></svg>'

  // The same tag reversed out of a purple tile, as on the toolbar icon, for light backgrounds.
  const MARK =
    '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect width="24" height="24" rx="5.3" fill="#5b2c91"/>' +
    '<path transform="rotate(-35 12 12)" fill="#ffffff" fill-rule="evenodd" ' +
    'd="M4.8 12 8.64 7.2H19.2v9.6H8.64ZM10.2 12a1.32 1.32 0 1 0-2.64 0 1.32 1.32 0 1 0 2.64 0Z"/></svg>'

  // Outline shapes on a 24 × 24 grid, stroked with the current text color.
  const SHAPES = {
    check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    warning: '<path d="M12 3.5 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17v.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    bag: '<path d="M5.5 8h13l-1 12.5h-11Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    arrow: '<path d="M5 12h13m-5-5 5 5-5 5"/>',
    close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
  }

  const icon = name =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name] ?? SHAPES.info}</svg>`

  /** The icon for a result's tone; an already applied code reads as fine. */
  const resultIcon = (tone, result) => (result?.reason === 'already-applied' ? 'check' : { neutral: 'info', warning: 'warning', error: 'error' }[tone] ?? 'info')

  Janice.icons = { LOGO, MARK, icon, resultIcon }

  if (typeof module === 'object' && module.exports) module.exports = Janice.icons
})(typeof globalThis === 'object' ? globalThis : this)
