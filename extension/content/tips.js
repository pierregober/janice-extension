/*
 * Tips: what the page button shows on a store's product pages, laid out like
 * Honey's tips panel but with Janice's own data. The product comes from the
 * page's schema.org Product data (name, image, offers.price and
 * priceCurrency, as observed on sharperimage.com product pages on
 * 2026-10-24). A product's page opens at /products/<handle> or, from most of
 * the store's own links, inside a collection; both are the same product. The
 * coupon count comes from Janice's provider, and the price trend
 * from the prices Janice has seen on this device. Save and Watch for price
 * drops stay on this device too: there is no account or server, Janice
 * doesn't check prices in the background, and it has no rewards program.
 * Remembering prices can be turned off, and they can be cleared, on Janice's
 * settings page (options/options.js). The tips take two columns when the card
 * is wide, which the page button makes it when one column would be taller
 * than the window (content/launcher.js).
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const KEYS = { prices: 'tips:prices', watch: 'tips:watch', saved: 'tips:saved', settings: 'tips:settings' }
  const KEEP_DAYS = 90
  const KEEP_PRODUCTS = 200
  const TREND_DAYS = 30
  // /products/<handle>, also after a collection (/collections/<collection>/products/<handle>, observed) or another prefix.
  const PRODUCT_PATH = /\/products\/([^/]+)\/?$/

  const STYLE = `
    .tips-view { container-type: inline-size; }
    .tips { display: grid; gap: 10px; padding: 2px 16px 12px; text-align: left; }
    .tips p { margin: 0; }
    .tips .icon { flex: none; width: 18px; height: 18px; }
    .product { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; }
    .thumb { width: 56px; height: 56px; border-radius: 8px; background: var(--surface); object-fit: cover; }
    .product-title {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
      font-size: 16px; font-weight: 750; line-height: 1.3;
    }
    .product-store { color: var(--muted); font-size: 14px; }
    .save { display: grid; justify-items: center; gap: 2px; padding: 4px; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
    .save .icon { width: 22px; height: 22px; }
    .save[aria-pressed="true"] .icon, .watch[aria-pressed="true"] .icon { fill: currentColor; }
    .price-note { color: var(--text); font-size: 13px; line-height: 1.4; }
    .price-note.good { color: var(--success); font-weight: 650; }
    .box { display: grid; align-content: start; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
    .offers { background: var(--surface); }
    .offer-row { display: grid; grid-template-columns: 1fr 1fr; }
    .offer-cell { display: grid; align-content: start; gap: 4px; padding-right: 10px; }
    .offer-cell + .offer-cell { padding: 0 0 0 12px; border-left: 1px solid var(--line-strong); }
    .offer-title { display: flex; align-items: center; gap: 6px; font-size: 14.5px; font-weight: 750; line-height: 1.25; }
    .offer-title .icon { color: var(--success); }
    .offer-value { display: flex; align-items: center; gap: 6px; font-size: 13.5px; }
    .offer-value .icon { width: 16px; height: 16px; }
    .later .offer-title, .later .offer-value { color: var(--muted); }
    .later .offer-title .icon { color: var(--muted); }
    .offer-fine { color: var(--muted); font-size: 12px; line-height: 1.4; }
    .trend-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .trend-title { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 650; }
    .link { padding: 0; border: 0; background: none; color: var(--text); font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
    .figures { display: grid; justify-items: end; }
    .current-price { font-size: 17px; font-weight: 800; }
    .trend-summary { font-size: 13px; font-weight: 650; }
    .chart { position: relative; height: 56px; border-radius: 6px; outline-offset: 4px; }
    .chart:focus-visible { outline: 3px solid var(--focus); }
    .chart svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .chart .axis { stroke: var(--line-strong); stroke-width: 1; }
    .chart .series { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .chart .point { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
    .chart .crosshair { stroke: var(--line-strong); stroke-width: 1; }
    .readout {
      position: absolute; bottom: calc(100% + 6px); transform: translateX(-50%);
      display: grid; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px;
      background: var(--bg); box-shadow: 0 4px 12px rgba(28, 37, 44, 0.16); white-space: nowrap; pointer-events: none;
    }
    .readout-value { font-size: 13px; font-weight: 750; }
    .readout-date { color: var(--muted); font-size: 11.5px; }
    .axis-labels { display: flex; justify-content: space-between; margin-top: -6px; color: var(--muted); font-size: 12px; }
    .axis-labels span:last-child { color: var(--text); font-weight: 650; }
    .price-history { width: 100%; border-collapse: collapse; font-size: 13px; }
    .price-history caption { padding-bottom: 4px; color: var(--muted); font-size: 12px; text-align: left; }
    .price-history th, .price-history td { padding: 4px 0; border-top: 1px solid var(--line); text-align: left; }
    .price-history th:last-child, .price-history td:last-child { text-align: right; }
    .watch { display: flex; align-items: center; justify-content: center; gap: 8px; }
    .watch-note { color: var(--muted); font-size: 12px; text-align: center; }
    .link:focus-visible, .save:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    /* Wide: the product on top, then the savings and the price trend side by side. */
    @container (min-width: 600px) {
      .tips { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .product, .price-note { grid-column: 1 / -1; }
    }
  `

  const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null)
  const pad = number => String(number).padStart(2, '0')
  // A calendar day on this device, as YYYY-MM-DD.
  const dayOf = time => {
    const date = new Date(time)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000)
  const shortDate = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const httpsUrl = value => {
    try {
      const url = new URL(String(value), 'https://invalid.example')
      return url.protocol === 'https:' && url.hostname !== 'invalid.example' ? url.href : null
    } catch {
      return null
    }
  }

  // The schema.org Product the page declares, in plain JSON-LD, an array of it, or a @graph.
  function productData(document) {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data
      try {
        data = JSON.parse(script.textContent)
      } catch {
        continue
      }
      for (const item of [data].flat().flatMap(entry => entry?.['@graph'] ?? [entry])) {
        if ([item?.['@type']].flat().includes('Product')) return item
      }
    }
    return null
  }

  function toMinor(value, currency) {
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN
    const digits = Janice.money?.minorDigits?.(currency) ?? 2
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 10 ** digits) : null
  }

  /** The product a product page shows ({ key, title, image, priceMinor, currency, url }), or null. */
  function readProduct(document, location) {
    const handle = PRODUCT_PATH.exec(location.pathname)?.[1]
    if (!handle) return null
    const meta = property => document.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null
    const product = productData(document)
    const offer = [product?.offers].flat().find(entry => entry && entry.price !== undefined)
    const currency = text(offer?.priceCurrency) ?? text(meta('og:price:currency'))
    const priceMinor = toMinor(offer?.price ?? meta('og:price:amount'), currency)
    const title = text(product?.name) ?? text(meta('og:title'))
    if (priceMinor === null || !currency || !title) return null
    const image = [product?.image].flat().map(entry => entry?.url ?? entry).find(entry => typeof entry === 'string')
    return {
      key: decodeURIComponent(handle).toLowerCase(),
      title,
      image: httpsUrl(image ?? meta('og:image')),
      priceMinor,
      currency,
      url: `${location.origin}/products/${handle}`,
    }
  }

  const lastDay = entries => entries.at(-1)?.day ?? ''

  /** Notes today's price for the product, one entry per day, unless the shopper turned that off. */
  async function recordPrice(storage, product, now = Date.now()) {
    if (!storage || !product) return
    const stored = await storage.get([KEYS.settings, KEYS.prices])
    if (stored[KEYS.settings]?.rememberPrices === false) return
    const prices = stored[KEYS.prices] ?? {}
    const today = dayOf(now)
    const entries = (prices[product.key] ?? []).filter(entry => entry.day !== today && daysBetween(entry.day, today) < KEEP_DAYS)
    entries.push({ day: today, priceMinor: product.priceMinor, currency: product.currency })
    const next = { ...prices, [product.key]: entries }
    // Keep the products seen most recently.
    const keys = Object.keys(next).sort((a, b) => lastDay(next[b]).localeCompare(lastDay(next[a])))
    for (const key of keys.slice(KEEP_PRODUCTS)) delete next[key]
    await storage.set({ [KEYS.prices]: next })
  }

  const SVG = 'http://www.w3.org/2000/svg'

  /** The tips for `product`; onResize is called whenever what they show may change their size. */
  function createTipsView({ window: win = root, storage = null, product, storeName = '', checkoutUrl = null, now = () => Date.now(), onResize = () => {} }) {
    const doc = win.document
    const { icon } = Janice.icons
    const money = amountMinor => Janice.money.formatAmount(amountMinor, product.currency)

    const element = doc.createElement('div')
    element.className = 'tips-view'
    element.innerHTML = `
      <style>${STYLE}</style>
      <div class="tips">
        <div class="product">
          <img class="thumb" alt="" width="56" height="56" hidden>
          <div>
            <p class="product-title"></p>
            <p class="product-store"></p>
          </div>
          <button type="button" class="save" aria-pressed="false">${icon('bookmark')}<span class="save-label">Save</span></button>
        </div>
        <p class="price-note"></p>
        <section class="box offers" aria-label="Savings">
          <div class="offer-row">
            <div class="offer-cell">
              <p class="offer-title">${icon('savings')}Potential savings</p>
              <p class="offer-value">${icon('tag')}<span class="coupon-count">Checking coupons…</span></p>
            </div>
            <div class="offer-cell later">
              <p class="offer-title">${icon('gift')}Rewards</p>
              <p class="offer-value">Not available yet</p>
            </div>
          </div>
          <a class="tips-go primary" hidden>Go to checkout</a>
          <p class="offer-fine">Janice keeps a coupon only if your total goes down. It never touches payment details or places orders.</p>
        </section>
        <section class="box trend" aria-labelledby="trend-title">
          <div class="trend-head">
            <p class="trend-title" id="trend-title">${icon('trend')}Price trend over time</p>
            <button type="button" class="link history-toggle" aria-expanded="false" aria-controls="price-history">See price history</button>
          </div>
          <div class="figures">
            <p class="current-price"></p>
            <p class="trend-summary"></p>
          </div>
          <div class="chart" tabindex="0" role="img"></div>
          <div class="axis-labels" aria-hidden="true"><span>30d</span><span>15d</span><span>Current</span></div>
          <table class="price-history" id="price-history" hidden>
            <caption>Prices Janice saw on this device</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Price</th></tr></thead>
            <tbody></tbody>
          </table>
          <button type="button" class="watch secondary" aria-pressed="false">${icon('bookmark')}<span class="watch-label">Watch for price drops</span></button>
          <p class="watch-note" hidden></p>
        </section>
      </div>
    `
    const part = selector => element.querySelector(selector)
    // What the view knows: storage as last read, or memory alone without storage.
    const state = { prices: {}, watch: {}, saved: {}, settings: {} }
    let loaded = null
    let couponCount = null

    async function load() {
      if (!storage) return
      const stored = await storage.get(Object.values(KEYS))
      for (const [name, key] of Object.entries(KEYS)) state[name] = stored[key] ?? {}
    }

    async function save(name, value) {
      state[name] = value
      try {
        await storage?.set({ [KEYS[name]]: value })
      } catch {
        // Kept in memory for this page.
      }
    }

    // The prices seen in the trend window, in this currency, with today's price last.
    function trendPoints() {
      const today = dayOf(now())
      const seen = (state.prices[product.key] ?? []).filter(entry => entry.currency === product.currency && entry.day !== today && daysBetween(entry.day, today) <= TREND_DAYS)
      return [...seen, { day: today, priceMinor: product.priceMinor }].sort((a, b) => a.day.localeCompare(b.day))
    }

    function describeTrend(points) {
      const [first] = points
      if (points.length < 2) return { summary: 'First price seen', note: "Janice hasn't seen this price change yet, but it could drop when Janice tries coupons at checkout." }
      const change = product.priceMinor - first.priceMinor
      const since = shortDate(first.day)
      if (change < 0) return { summary: `Down ${money(-change)} since ${since}`, note: `This price dropped ${money(-change)} since ${since}.`, isGood: true }
      if (change > 0) return { summary: `Up ${money(change)} since ${since}`, note: `This price went up ${money(change)} since ${since}, but it could drop when Janice tries coupons at checkout.` }
      return { summary: `No changes since ${since}`, note: 'No recent price changes found at this store, but this price could drop when Janice tries coupons at checkout.' }
    }

    function drawChart(points) {
      const chart = part('.chart')
      const today = dayOf(now())
      const width = 300
      const height = 56
      const inset = 6
      const x = day => inset + ((TREND_DAYS - Math.min(TREND_DAYS, daysBetween(day, today))) / TREND_DAYS) * (width - 2 * inset)
      const prices = points.map(point => point.priceMinor)
      const low = Math.min(...prices)
      const high = Math.max(...prices)
      const y = price => (high === low ? height / 2 : inset + (1 - (price - low) / (high - low)) * (height - 2 * inset))
      const node = (tag, attributes) => {
        const created = doc.createElementNS(SVG, tag)
        for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, String(value))
        return created
      }
      const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' })
      svg.append(node('line', { class: 'axis', x1: 0, y1: height - 0.5, x2: width, y2: height - 0.5, 'vector-effect': 'non-scaling-stroke' }))
      if (points.length > 1) {
        svg.append(node('path', { class: 'series', d: points.map((point, index) => `${index ? 'L' : 'M'}${x(point.day).toFixed(1)} ${y(point.priceMinor).toFixed(1)}`).join(' '), 'vector-effect': 'non-scaling-stroke' }))
      }
      const crosshair = node('line', { class: 'crosshair', y1: 0, y2: height, visibility: 'hidden', 'vector-effect': 'non-scaling-stroke' })
      svg.append(crosshair)
      const dots = points.map(point => {
        const dot = node('circle', { class: 'point', cx: x(point.day), cy: y(point.priceMinor), r: 4, 'vector-effect': 'non-scaling-stroke' })
        svg.append(dot)
        return dot
      })
      const readout = doc.createElement('div')
      readout.className = 'readout'
      readout.hidden = true
      const value = doc.createElement('span')
      value.className = 'readout-value'
      const date = doc.createElement('span')
      date.className = 'readout-date'
      readout.append(value, date)
      chart.replaceChildren(svg, readout)
      chart.setAttribute('aria-label', `Price trend over the last 30 days: ${points.map(point => `${shortDate(point.day)} ${money(point.priceMinor)}`).join(', ')}.`)

      // The crosshair snaps to the nearest price; the arrow keys step through them.
      let shown = points.length - 1
      function showPoint(index) {
        shown = Math.max(0, Math.min(points.length - 1, index))
        const point = points[shown]
        const left = (x(point.day) / width) * 100
        crosshair.setAttribute('x1', x(point.day))
        crosshair.setAttribute('x2', x(point.day))
        crosshair.setAttribute('visibility', 'visible')
        value.textContent = money(point.priceMinor)
        date.textContent = point.day === today ? 'Today' : shortDate(point.day)
        readout.style.left = `${Math.max(14, Math.min(86, left))}%`
        readout.hidden = false
        dots.forEach((dot, at) => dot.setAttribute('r', at === shown ? 5 : 4))
      }
      function hidePoint() {
        crosshair.setAttribute('visibility', 'hidden')
        readout.hidden = true
        dots.forEach(dot => dot.setAttribute('r', 4))
      }
      chart.onpointermove = event => {
        const box = chart.getBoundingClientRect()
        const at = box.width ? ((event.clientX - box.left) / box.width) * width : width
        let nearest = 0
        points.forEach((point, index) => {
          if (Math.abs(x(point.day) - at) < Math.abs(x(points[nearest].day) - at)) nearest = index
        })
        showPoint(nearest)
      }
      chart.onpointerleave = () => (doc.activeElement === chart || chart.getRootNode().activeElement === chart ? showPoint(shown) : hidePoint())
      chart.onfocus = () => showPoint(shown)
      chart.onblur = hidePoint
      chart.onkeydown = event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        showPoint(shown + (event.key === 'ArrowLeft' ? -1 : 1))
      }
    }

    function paintHistory(points) {
      const rows = [...points].reverse().map(point => {
        const row = doc.createElement('tr')
        const day = doc.createElement('td')
        day.textContent = point.day === dayOf(now()) ? 'Today' : shortDate(point.day)
        const price = doc.createElement('td')
        price.textContent = money(point.priceMinor)
        row.append(day, price)
        return row
      })
      part('.price-history tbody').replaceChildren(...rows)
    }

    function render() {
      part('.product-title').textContent = product.title
      part('.product-store').textContent = storeName
      const thumb = part('.thumb')
      thumb.hidden = !product.image
      if (product.image && thumb.getAttribute('src') !== product.image) thumb.src = product.image

      const isSaved = Boolean(state.saved[product.key])
      part('.save').setAttribute('aria-pressed', String(isSaved))
      part('.save-label').textContent = isSaved ? 'Saved' : 'Save'

      const points = trendPoints()
      const trend = describeTrend(points)
      const watched = state.watch[product.key]
      const dropSinceWatch = watched && watched.currency === product.currency ? watched.priceMinor - product.priceMinor : 0
      const note = part('.price-note')
      note.textContent = dropSinceWatch > 0 ? `Down ${money(dropSinceWatch)} since you started watching on ${shortDate(watched.day)}.` : trend.note
      note.classList.toggle('good', dropSinceWatch > 0 || Boolean(trend.isGood))

      part('.coupon-count').textContent = couponCount === null ? 'Checking coupons…' : couponCount === 0 ? 'No coupons yet' : couponCount === 1 ? '1 coupon' : `${couponCount} coupons`
      const go = part('.tips-go')
      go.hidden = !checkoutUrl
      if (checkoutUrl) go.href = checkoutUrl

      part('.current-price').textContent = money(product.priceMinor)
      part('.trend-summary').textContent = trend.summary
      drawChart(points)
      paintHistory(points)

      part('.watch').setAttribute('aria-pressed', String(Boolean(watched)))
      part('.watch-label').textContent = watched ? 'Watching for price drops' : 'Watch for price drops'
      part('.watch-note').hidden = !watched
      part('.watch-note').textContent = watched ? `Since ${shortDate(watched.day)} at ${money(watched.priceMinor)}. Janice compares when you visit this page.` : ''
      onResize()
    }

    async function ensureLoaded() {
      loaded ??= load().catch(() => {})
      await loaded
      render()
    }

    part('.save').addEventListener('click', async () => {
      const saved = { ...state.saved }
      if (saved[product.key]) delete saved[product.key]
      else saved[product.key] = { title: product.title, url: product.url, image: product.image, day: dayOf(now()) }
      await save('saved', saved)
      render()
    })
    part('.watch').addEventListener('click', async () => {
      const watch = { ...state.watch }
      if (watch[product.key]) delete watch[product.key]
      else watch[product.key] = { day: dayOf(now()), priceMinor: product.priceMinor, currency: product.currency }
      await save('watch', watch)
      render()
    })
    part('.history-toggle').addEventListener('click', () => {
      const table = part('.price-history')
      table.hidden = !table.hidden
      part('.history-toggle').setAttribute('aria-expanded', String(!table.hidden))
      part('.history-toggle').textContent = table.hidden ? 'See price history' : 'Hide price history'
      onResize()
    })
    return {
      element,
      /** Records today's price on this device, as the page loads. */
      recordVisit: async () => {
        try {
          await recordPrice(storage, product, now())
        } catch {
          // Without storage the trend shows today's price alone.
        }
        loaded = null
      },
      /** Shows the tips with the coupon count as last inspected (null while unknown). */
      update: ({ couponCount: count = null } = {}) => {
        couponCount = Number.isInteger(count) ? count : null
        return ensureLoaded()
      },
    }
  }

  Janice.tips = { KEYS, readProduct, recordPrice, createTipsView, dayOf }

  if (typeof module === 'object' && module.exports) module.exports = Janice.tips
})(typeof globalThis === 'object' ? globalThis : this)
