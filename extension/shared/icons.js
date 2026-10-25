/*
 * Janice’s bundled favicon and inline SVG state icons, shared by the popup,
 * the checkout panel and the page button. The embedded image needs no runtime
 * network requests or extension resources exposed to merchant pages.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  // Exact vector favicon from https://usejanice.com/favicon.svg (October 24, 2026).
  // Use it as a self-contained image so repeated marks have no duplicate SVG ids.
  const FAVICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 68 68\"><defs><linearGradient id=\"m\" x1=\"4\" x2=\"64\" y1=\"3\" y2=\"66\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#190424\"/><stop offset=\".22\" stop-color=\"#55206F\"/><stop offset=\".43\" stop-color=\"#C692DA\"/><stop offset=\".58\" stop-color=\"#74318F\"/><stop offset=\".76\" stop-color=\"#321043\"/><stop offset=\".9\" stop-color=\"#8A48A2\"/><stop offset=\"1\" stop-color=\"#17001E\"/></linearGradient><radialGradient id=\"a\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"translate(19 14) rotate(46) scale(59 56)\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#fff\" stop-opacity=\".68\"/><stop offset=\".18\" stop-color=\"#E9C9F6\" stop-opacity=\".34\"/><stop offset=\".43\" stop-color=\"#BB86D1\" stop-opacity=\".08\"/><stop offset=\".7\" stop-color=\"#4D367C\" stop-opacity=\".16\"/><stop offset=\"1\" stop-color=\"#100016\" stop-opacity=\".46\"/></radialGradient></defs><path id=\"s\" d=\"M61.86 40.08L67.13 35.78C68.28 34.85 68.28 33.09 67.13 32.17L61.86 27.87C61.07 27.27 60.79 26.20 61.12 25.28L64.03 17.23C64.58 15.66 63.38 14.04 61.76 14.13L55.98 14.41C54.64 14.46 53.49 13.35 53.58 12.01L53.81 6.27C53.90 4.61 52.24 3.41 50.71 4.01L42.67 6.92C41.74 7.24 40.72 6.97 40.08 6.18L35.82 0.86C34.90 -0.28 33.14 -0.28 32.21 0.86L27.91 6.13C27.31 6.92 26.25 7.20 25.32 6.87L17.28 3.96C15.71 3.41 14.09 4.61 14.18 6.23L14.41 11.96C14.46 13.30 13.35 14.46 12.01 14.36L6.27 14.13C4.61 14.04 3.41 15.71 4.01 17.23L6.92 25.28C7.24 26.20 6.97 27.22 6.18 27.87L0.86 32.21C-0.28 33.14 -0.28 34.90 0.86 35.82L6.13 40.12C6.92 40.72 7.20 41.79 6.87 42.71L3.96 50.76C3.41 52.33 4.61 53.95 6.23 53.86L11.96 53.63C13.30 53.58 14.46 54.69 14.36 56.03L14.13 61.76C14.04 63.43 15.71 64.63 17.23 64.03L25.28 61.12C26.20 60.79 27.22 61.07 27.87 61.86L32.17 67.13C33.09 68.28 34.85 68.28 35.78 67.13L39.84 62.13C40.54 61.26 41.79 61.02 42.80 61.58L46.92 63.89C48.17 64.58 49.79 63.98 50.25 62.64L52.89 55.15C53.21 54.18 54.13 53.53 55.20 53.58L61.76 53.86C63.43 53.95 64.63 52.28 64.03 50.76L61.12 42.71C60.84 41.74 61.12 40.72 61.86 40.08Z\" fill=\"url(#m)\"/><path d=\"M61.86 40.08L67.13 35.78C68.28 34.85 68.28 33.09 67.13 32.17L61.86 27.87C61.07 27.27 60.79 26.20 61.12 25.28L64.03 17.23C64.58 15.66 63.38 14.04 61.76 14.13L55.98 14.41C54.64 14.46 53.49 13.35 53.58 12.01L53.81 6.27C53.90 4.61 52.24 3.41 50.71 4.01L42.67 6.92C41.74 7.24 40.72 6.97 40.08 6.18L35.82 0.86C34.90 -0.28 33.14 -0.28 32.21 0.86L27.91 6.13C27.31 6.92 26.25 7.20 25.32 6.87L17.28 3.96C15.71 3.41 14.09 4.61 14.18 6.23L14.41 11.96C14.46 13.30 13.35 14.46 12.01 14.36L6.27 14.13C4.61 14.04 3.41 15.71 4.01 17.23L6.92 25.28C7.24 26.20 6.97 27.22 6.18 27.87L0.86 32.21C-0.28 33.14 -0.28 34.90 0.86 35.82L6.13 40.12C6.92 40.72 7.20 41.79 6.87 42.71L3.96 50.76C3.41 52.33 4.61 53.95 6.23 53.86L11.96 53.63C13.30 53.58 14.46 54.69 14.36 56.03L14.13 61.76C14.04 63.43 15.71 64.63 17.23 64.03L25.28 61.12C26.20 60.79 27.22 61.07 27.87 61.86L32.17 67.13C33.09 68.28 34.85 68.28 35.78 67.13L39.84 62.13C40.54 61.26 41.79 61.02 42.80 61.58L46.92 63.89C48.17 64.58 49.79 63.98 50.25 62.64L52.89 55.15C53.21 54.18 54.13 53.53 55.20 53.58L61.76 53.86C63.43 53.95 64.63 52.28 64.03 50.76L61.12 42.71C60.84 41.74 61.12 40.72 61.86 40.08Z\" fill=\"url(#a)\"/></svg>"
  const brandImage = `data:image/svg+xml,${encodeURIComponent(FAVICON)}`
  // The adjacent heading or button supplies the accessible name.
  const LOGO = `<img class="logo" src="${brandImage}" width="28" height="28" alt="" draggable="false">`
  const MARK = `<img class="mark" src="${brandImage}" width="34" height="34" alt="" draggable="false">`

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
    // For tips (content/tips.js), the page button's gear menu and the settings buttons.
    gear:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    bookmark: '<path d="M7 3.5h10v17l-5-3.8-5 3.8Z"/>',
    trend: '<path d="M3.5 16.5 9 11l4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0Z"/><path d="M8 8h.01"/>',
    savings: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.4c-.5-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2.1 0 2.9 5.6 1.5 5.6 4.3 0 1.3-1.2 2.1-2.8 2.1-1.4 0-2.4-.6-2.9-1.6M12 6v1.8M12 16.3V18"/>',
    gift: '<rect x="4.5" y="9.5" width="15" height="10.5" rx="1.5"/><path d="M3.5 6.5h17v3h-17ZM12 6.5V20"/>',
    hide: '<path d="M2.5 12c2-3.8 5.4-6.5 9.5-6.5s7.5 2.7 9.5 6.5c-2 3.8-5.4 6.5-9.5 6.5S4.5 15.8 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    snooze: '<path d="M20 14.2A8 8 0 1 1 9.8 4a6.5 6.5 0 0 0 10.2 10.2Z"/>',
  }

  const icon = name =>
    `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name] ?? SHAPES.info}</svg>`

  /** The icon for a result's tone; an already applied code reads as fine. */
  const resultIcon = (tone, result) => (result?.reason === 'already-applied' ? 'check' : { neutral: 'info', warning: 'warning', error: 'error' }[tone] ?? 'info')

  Janice.icons = { LOGO, MARK, icon, resultIcon }

  if (typeof module === 'object' && module.exports) module.exports = Janice.icons
})(typeof globalThis === 'object' ? globalThis : this)
