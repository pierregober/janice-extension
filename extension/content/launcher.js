/*
 * The page button: Janice's tab on the right edge of Sharper Image pages,
 * and the card it opens. The card says how many coupons Janice has for the
 * store; at checkout it offers Try coupons, elsewhere a link to the
 * checkout. Opening it only reads, through the service worker's inspect as
 * when the popup opens: the checkout changes only after Try coupons. The
 * card opens on hover or click. A visible Shopify cart promo field receives
 * a subtle outline and a small Use code control; detection never fills it.
 * The button steps aside
 * while the run panel is on the page. The shopper can slide the button along
 * the edge, by dragging its tab or with the arrow keys, and it keeps that
 * spot on later pages. The gear in the card's header opens a menu: Hide on
 * this page, Snooze for 24 hours (every store), Snooze on this site (until
 * turned back on in the popup or settings, shared/snooze.js) and Go to
 * settings. The card always shows whole, without scrolling: above or below
 * the tab when it fits there, otherwise beside it (placeCard). Like the panel,
 * it lives in a shadow root so the store's styles cannot restyle it.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    p, h2, ul { margin: 0; }
    .root {
      /* Light theme only, whatever the system's setting: white, grays and one blue accent (owner request,
         2026-10-24). Success uses the blue; warnings and errors are told by their words and icons. */
      --accent: #2557d6; --accent-hover: #1b46b0;
      --bg: #ffffff; --surface: #f5f6f8; --text: #1c252c; --muted: #596071;
      --line: #dfe1e6; --line-strong: #80879a;
      --success: var(--accent); --warning: var(--text); --error: var(--text); --focus: var(--accent);
      position: relative;
      display: flex;
      justify-content: flex-end;
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .tab {
      display: grid; place-items: center;
      width: 50px; height: 48px; margin: 0; padding: 0 2px 0 0;
      border: 1px solid var(--line-strong); border-right: 0; border-radius: 14px 0 0 14px;
      background: var(--bg);
      box-shadow: 0 6px 18px rgba(28, 37, 44, 0.18), 0 1px 3px rgba(28, 37, 44, 0.14);
      /* The tab is also the handle that slides the button along the edge. */
      cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none;
      transition: width 0.15s ease;
    }
    .tab:hover, .tab[aria-expanded="true"] { width: 58px; }
    .tab.dragging { cursor: grabbing; }
    .tab .mark { width: 34px; height: 34px; object-fit: contain; }
    .card {
      /* Light, scrollbars included, even when the system is set to dark. */
      color-scheme: only light;
      /* Above the tab unless placeCard() says otherwise. --room caps it only when it is taller than the whole
         window, and then its body scrolls. */
      position: absolute; right: 12px; bottom: calc(100% + 14px);
      display: flex; flex-direction: column; max-height: var(--room, none);
      width: min(360px, calc(100vw - 24px));
      border: 1px solid var(--line); border-radius: 16px;
      background: var(--bg);
      box-shadow: 0 16px 40px rgba(28, 37, 44, 0.24), 0 2px 8px rgba(28, 37, 44, 0.12);
      animation: rise 0.18s ease-out;
    }
    /* Below the tab when it sits high up, with room for the store tile (--tile) when it shows. */
    .card[data-side="below"] { top: calc(100% + 14px + var(--tile, 0px)); bottom: auto; }
    /* Beside the tab, at its widest, and as level with it as the window allows (--top). */
    .card[data-side="beside"] { top: var(--top, 0px); bottom: auto; right: 66px; width: min(360px, calc(100vw - 74px)); }
    /* Tips in two columns (content/tips.js), when one column would be taller than the window. */
    .card[data-wide] { width: min(700px, calc(100vw - 24px)); }
    .card[data-wide][data-side="beside"] { width: min(700px, calc(100vw - 74px)); }
    .store {
      position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
      display: grid; place-items: center;
      width: 56px; height: 56px;
      border: 1px solid var(--line); border-radius: 14px;
      background: var(--bg); color: var(--text);
      box-shadow: 0 4px 12px rgba(28, 37, 44, 0.16);
      font-size: 18px; font-weight: 800; letter-spacing: 0.02em;
    }
    .head { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 8px 0 12px; }
    .head .mark { width: 26px; height: 26px; }
    .demo {
      padding: 1px 8px; border: 1px solid var(--line-strong); border-radius: 999px;
      color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .gear, .close {
      display: grid; place-items: center; width: 34px; height: 34px; padding: 0;
      border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer;
    }
    .gear { margin-left: auto; }
    .gear:hover, .gear[aria-expanded="true"], .close:hover { background: var(--surface); }
    .gear .icon, .close .icon { width: 20px; height: 20px; }
    /* The gear's menu: a popover in the top layer, under the gear and lined up with its right edge. */
    .menu {
      position: fixed; inset: auto; margin: 0;
      min-width: 224px; padding: 6px;
      border: 1px solid var(--line); border-radius: 12px;
      background: var(--bg); color: var(--text);
      box-shadow: 0 12px 32px rgba(28, 37, 44, 0.22), 0 2px 6px rgba(28, 37, 44, 0.12);
    }
    .menu:popover-open { display: grid; gap: 2px; }
    @supports (position-area: block-end) {
      .gear { anchor-name: --janice-gear; }
      .menu { position-anchor: --janice-gear; position-area: block-end span-inline-start; margin-block-start: 6px; position-try-fallbacks: flip-block; }
    }
    .menu-item {
      display: flex; align-items: center; gap: 10px;
      width: 100%; min-height: 40px; padding: 8px 12px;
      border: 0; border-radius: 8px; background: transparent; color: var(--text);
      font: inherit; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer;
    }
    .menu-item:hover { background: var(--surface); }
    .menu-item .icon { flex: none; width: 18px; height: 18px; color: var(--muted); }
    /* Tips on product pages (content/tips.js): a "tips" title in the header. */
    .tips-label { color: var(--text); font-size: 18px; font-weight: 750; letter-spacing: -0.01em; }
    .tips-slot { min-height: 0; overflow: auto; }
    .body {
      display: grid; gap: 12px;
      min-height: 0; overflow: auto;
      padding: 6px 18px 16px;
      text-align: center;
    }
    .heading { font-size: 22px; font-weight: 750; line-height: 1.25; letter-spacing: -0.01em; text-wrap: balance; }
    .tone-success .heading { color: var(--success); }
    .tone-warning .heading { color: var(--warning); }
    .tone-error .heading { color: var(--error); }
    .sub { margin-top: -8px; color: var(--muted); font-size: 13.5px; }
    .coupons { display: grid; gap: 8px; padding: 0; list-style: none; text-align: left; }
    .coupon {
      display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto; align-items: center; gap: 10px;
      padding: 8px 8px 8px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface);
    }
    .ticket {
      min-width: 0; overflow-wrap: anywhere;
      padding: 2px 8px; border: 2px dashed var(--accent); border-radius: 8px; color: var(--accent);
      font: 700 13px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.08em;
    }
    .offer { font-size: 13px; line-height: 1.35; }
    .copy {
      min-height: 30px; padding: 2px 12px; border: 1.5px solid var(--line-strong); border-radius: 999px;
      background: var(--bg); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer;
    }
    .copy:hover { background: var(--surface); }
    .text { color: var(--muted); font-size: 13px; }
    .warn .text { color: var(--warning); }
    .primary, .secondary {
      display: block; width: 100%; border-radius: 999px;
      font: inherit; font-weight: 700; text-align: center; text-decoration: none; cursor: pointer;
    }
    .primary {
      min-height: 46px; padding: 12px 18px; border: 0;
      background: var(--accent); color: #ffffff;
      font-size: 15.5px; line-height: 22px;
    }
    .primary:hover { background: var(--accent-hover); }
    .secondary { min-height: 40px; padding: 8px 18px; border: 1.5px solid var(--line-strong); background: var(--bg); color: var(--text); font-size: 14.5px; }
    .secondary:hover { background: var(--surface); }
    button:disabled { cursor: default; opacity: 0.6; }
    button:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .note { color: var(--warning); font-size: 13px; }
    .manual-codes { padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; text-align: left; }
    .manual-codes summary { cursor: pointer; color: var(--accent); font-weight: 650; }
    .manual-codes label { display: block; margin: 10px 0 5px; font-size: 13px; font-weight: 600; }
    .manual-codes textarea { display: block; width: 100%; min-height: 68px; padding: 8px; resize: vertical; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg); color: var(--text); font: inherit; }
    .codes-help { margin-top: 6px; color: var(--muted); font-size: 12px; }
    .codes-error { margin-top: 6px; color: var(--warning); font-size: 13px; }
    textarea:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .fine { padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    .spinner {
      justify-self: center; width: 22px; height: 22px;
      border: 3px solid var(--surface); border-top-color: var(--accent); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .announce { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    [hidden] { display: none !important; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .tab { transition: none; }
      .card { animation: none; }
      .spinner { animation-duration: 2.4s; }
    }
  `

  const ACTIVE = new Set(['running', 'stopping'])
  const countText = count => (count === 1 ? '1 coupon found' : `${count} coupons found`)
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('')

  function createLauncher({ window: win = root } = {}) {
    const doc = win.document
    const { describeResult, progressText, phaseTitle, reasonText, refusalText, offerSummary } = Janice.messages
    const { MARK, icon } = Janice.icons
    const send = message => win.chrome.runtime.sendMessage(message)

    const host = doc.createElement('janice-coupons-launcher')
    host.setAttribute('data-janice-launcher', '')
    for (const [property, value] of Object.entries({ position: 'fixed', right: '0', bottom: '88px', 'z-index': '2147483647', display: 'block' })) {
      host.style.setProperty(property, value, 'important')
    }

    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="root">
        <button type="button" class="tab" aria-expanded="false" aria-controls="card" aria-describedby="move-hint">${MARK}</button>
        <span id="move-hint" hidden>Drag it, or use the up and down arrow keys, to move it along the edge of the window.</span>
        <section class="card" id="card" aria-label="Janice Coupons" hidden>
          <span class="store" aria-hidden="true"></span>
          <header class="head">
            ${MARK}
            <span class="tips-label" hidden>tips</span>
            <span class="demo" hidden title="Simulated checkout: results do not reflect a real store">Demo</span>
            <button type="button" class="gear" popovertarget="menu" aria-label="Settings" aria-expanded="false">${icon('gear')}</button>
            <div class="menu" id="menu" popover>
              <button type="button" class="menu-item" data-action="hide-page">${icon('hide')}Hide on this page</button>
              <button type="button" class="menu-item" data-action="snooze-day">${icon('clock')}Snooze for 24 hours</button>
              <button type="button" class="menu-item" data-action="snooze-site">${icon('snooze')}Snooze on this site</button>
              <button type="button" class="menu-item" data-action="settings">${icon('gear')}Go to settings</button>
            </div>
            <button type="button" class="close" aria-label="Close">${icon('close')}</button>
          </header>
          <div class="body">
            <span class="spinner" hidden></span>
            <h2 class="heading" aria-live="polite"></h2>
            <p class="sub" hidden></p>
            <ul class="coupons" hidden></ul>
            <p class="text" hidden></p>
            <details class="manual-codes" hidden>
              <summary>Add your own codes</summary>
              <label for="additional-codes">Promo codes to try</label>
              <textarea id="additional-codes" rows="3" maxlength="2000" spellcheck="false" autocapitalize="off" aria-describedby="codes-help codes-error" placeholder="WELCOME10, SAVE20"></textarea>
              <p id="codes-help" class="codes-help">Separate codes with commas or new lines. Up to 20 codes per run.</p>
              <p id="codes-error" class="codes-error" role="status" hidden></p>
            </details>
            <button type="button" class="try" hidden></button>
            <a class="go primary" hidden>Go to checkout</a>
            <p class="note" hidden></p>
            <p class="fine">Never touches payment details or places orders.</p>
          </div>
          <div class="tips-slot" hidden></div>
          <p class="announce" role="status"></p>
        </section>
      </div>
    `

    const part = selector => shadow.querySelector(selector)
    const element = (tag, className, text) => Object.assign(doc.createElement(tag), { className, textContent: text ?? '' })
    const tab = part('.tab')
    const card = part('.card')
    const menu = part('.menu')
    const rows = new Map()
    // The store whose page this is: Snooze on this site snoozes the button there.
    const store = Janice.stores.detect(win.location, doc)
    part('[data-action="snooze-site"]').hidden = !store

    // On a product page the card shows tips about the product instead (content/tips.js).
    const product = store ? Janice.tips?.readProduct(doc, win.location) ?? null : null
    const tips = product
      ? Janice.tips.createTipsView({
          window: win,
          storage: win.chrome?.storage?.local ?? null,
          product,
          storeName: store.name,
          checkoutUrl: Janice.stores.STORES[store.id]?.checkoutUrl ?? null,
          onResize: () => placeCard(),
        })
      : null
    if (tips) {
      part('.tips-slot').append(tips.element)
      card.setAttribute('aria-label', 'Janice tips')
    }

    let inspection = null
    let isOpen = false
    let isPinned = false
    let isStarting = false
    let note = ''
    let closeTimer
    let requests = 0
    let codesError = ''
    let refreshTimer
    let localDiscovery = null
    let latestRun = null
    Janice.runViews ??= new Set()
    const inlineCoupon = Janice.createInlineCoupon({
      window: win,
      isEligibleInput: input => Janice.checkoutDiscovery.findVisibleDrawerInputs({ document: doc }).includes(input),
      onTry: () => requestRun(),
      onStop: () => send({ type: 'janice:stop' }),
    })
    let inlineCandidates = null
    let inlineChecking = false
    // Hide on this page lasts as long as the page. A snooze is kept (shared/snooze.js) and read before the button
    // shows; snoozedBy says what hides it here ('store' or 'everywhere').
    let isHiddenHere = false
    let snoozedBy = null
    let isRestored = false
    let isVisitRecorded = false
    let isMenuOpen = false
    const isQuiet = () => isHiddenHere || Boolean(snoozedBy)

    function preparedCandidates() {
      codesError = ''
      try {
        return Janice.couponCandidates.mergeCandidates(inspection?.candidates ?? [], part('#additional-codes').value)
      } catch (error) {
        codesError = error.message
        return inspection?.candidates ?? []
      }
    }

    /** What the card shows for the page as last inspected. */
    function screen() {
      if (!inspection) return { heading: 'Looking for coupons…', isBusy: true }
      if (!inspection.ok) return { heading: "Janice can't read this page", text: 'Reload the page, then open Janice again.', warn: true }
      const store = inspection.detection?.store
      if (!store) return { heading: 'No coupons here', text: 'Janice Coupons works on Sharper Image.' }
      if (inspection.providerError) {
        return { store, heading: "Couldn't load coupons", text: `${inspection.providerError}. Nothing was changed.`, warn: true }
      }

      const candidates = preparedCandidates()
      const count = candidates.length
      if (count === 0) return { store, count, heading: 'No coupons found yet', text: `Janice has no codes for ${store.name} right now.` }

      const one = count === 1
      const found = { store, candidates, count, heading: countText(count), sub: `for ${store.name}` }
      if (store.page !== 'checkout' && !inspection.detection.supported) {
        return {
          ...found,
          link: Janice.stores.STORES[store.id]?.checkoutUrl,
          text: inspection.detection.discovery?.kind === 'promo-field'
            ? "Promo code field detected. Automatic testing isn't verified here. Go to checkout to try coupons."
            : one
            ? 'Janice tries it for you at checkout and keeps it only if your total goes down.'
            : 'Janice tries them for you at checkout and keeps the best one only if your total goes down.',
        }
      }

      const { detection, run } = inspection
      if (run && ACTIVE.has(run.status)) return { ...found, heading: phaseTitle(run), sub: progressText(run), start: run.status === 'stopping' ? 'stopping' : 'stop' }
      if (run?.result) {
        const { title, tone } = describeResult(run)
        return { ...found, heading: title, tone, sub: `${countText(count)} for ${store.name}`, start: detection.supported && 'again' }
      }
      if (!detection.supported) return { ...found, text: detection.reason !== 'unverified-checkout' && detection.discovery?.kind === 'promo-field' ? "Promo code field detected. Automatic testing isn't verified here. Nothing was changed." : `${reasonText(detection.reason)} Nothing was changed.`, warn: true }
      return {
        ...found,
        sub: detection.discovery?.kind === 'promo-field' ? 'Promo code field detected' : found.sub,
        start: 'first',
        text: one
          ? 'Janice tries it in your checkout and keeps it only if your total goes down.'
          : 'Janice tries each code in your checkout, one at a time, and keeps the best one only if your total goes down.',
      }
    }

    function show(selector, text) {
      part(selector).hidden = !text
      part(selector).textContent = text ?? ''
    }

    function createRow(candidate) {
      const row = element('li', 'coupon')
      const copy = element('button', 'copy', 'Copy')
      copy.type = 'button'
      copy.setAttribute('aria-label', `Copy code ${candidate.code}`)
      copy.addEventListener('click', () => copyCode(candidate.code, copy))
      row.append(element('span', 'ticket', candidate.code), element('span', 'offer', offerSummary(candidate) ?? candidate.offerText ?? (candidate.source?.kind === 'shopper-entered' ? 'Your code' : 'Coupon code')), copy)
      return row
    }

    function paintCoupons(candidates) {
      const list = part('.coupons')
      const items = candidates.map(candidate => {
        if (!rows.has(candidate.code)) rows.set(candidate.code, createRow(candidate))
        return rows.get(candidate.code)
      })
      // Replace the list only when its rows change, so focus on a Copy button survives updates.
      const current = [...list.children]
      if (items.length !== current.length || items.some((item, index) => item !== current[index])) list.replaceChildren(...items)
      list.hidden = items.length === 0
    }

    function render() {
      const view = screen()
      tab.setAttribute('aria-expanded', String(isOpen))
      tab.setAttribute('aria-label', Number.isInteger(view.count) ? `Janice Coupons: ${countText(view.count)}` : 'Janice Coupons')
      if (localDiscovery?.kind === 'promo-field') tab.setAttribute('aria-label', `${tab.getAttribute('aria-label')}; promo code field detected`)
      card.hidden = !isOpen
      if (!isOpen) return

      card.className = ['card', view.tone && `tone-${view.tone}`, view.warn && 'warn'].filter(Boolean).join(' ')
      part('.store').hidden = !view.store
      part('.store').textContent = view.store ? initials(view.store.name) : ''
      part('.demo').hidden = !view.store?.isDemo
      part('.spinner').hidden = !view.isBusy
      part('.heading').textContent = view.heading
      show('.sub', view.sub)
      paintCoupons(view.candidates ?? [])
      show('.text', view.text)

      const tryButton = part('.try')
      tryButton.hidden = !view.start
      tryButton.disabled = isStarting || Boolean(codesError) || view.start === 'stopping'
      tryButton.className = `try ${view.start === 'again' ? 'secondary' : 'primary'}`
      tryButton.textContent = isStarting ? 'Starting…' : view.start === 'again' ? 'Try coupons again' : view.start === 'stop' ? 'Stop' : view.start === 'stopping' ? 'Stopping…' : 'Try coupons'

      const go = part('.go')
      go.hidden = !view.link
      if (view.link) go.href = view.link
      show('.note', note)
      part('.manual-codes').hidden = !(inspection?.detection?.supported && !inspection?.providerError && !ACTIVE.has(inspection?.run?.status))
      part('#additional-codes').disabled = isStarting
      part('#additional-codes').setAttribute('aria-invalid', String(Boolean(codesError)))
      show('.codes-error', codesError)

      if (tips) {
        for (const selector of ['.body', '.store', '.demo']) part(selector).hidden = true
        for (const selector of ['.tips-slot', '.tips-label']) part(selector).hidden = false
        void tips.update({ couponCount: view.isBusy ? null : view.count ?? 0 })
      }
      placeCard()
    }

    async function refresh() {
      const request = ++requests
      let reply
      try {
        reply = await send({ type: 'janice:inspect' })
      } catch (error) {
        reply = { ok: false, reason: 'error', detail: String(error?.message ?? error) }
      }
      if (request !== requests) return
      inspection = reply ?? { ok: false, reason: 'error' }
      if (reply?.run && (!latestRun || reply.run.updatedAt >= latestRun.updatedAt)) latestRun = reply.run
      render()
    }

    function open({ pin = false } = {}) {
      inlineCoupon.hide()
      win.clearTimeout(closeTimer)
      win.clearTimeout(refreshTimer)
      isPinned ||= pin
      if (isOpen) return render()
      isOpen = true
      note = ''
      render()
      return refresh()
    }

    function close({ focus = false } = {}) {
      win.clearTimeout(closeTimer)
      closeMenu()
      if (!isOpen) return
      isOpen = false
      isPinned = false
      render()
      void syncInlineCoupon()
      if (focus) tab.focus()
    }

    // Hovering opens the card and leaving closes it after a moment, unless a click or key opened it.
    function leave() {
      if (isPinned) return
      win.clearTimeout(closeTimer)
      closeTimer = win.setTimeout(() => close(), 350)
    }

    async function start() {
      if (isStarting) return
      if (ACTIVE.has((latestRun ?? inspection?.run)?.status)) {
        try { await send({ type: 'janice:stop' }) } catch { note = 'Could not request Stop. Try again.'; render() }
        return
      }
      preparedCandidates()
      if (codesError) {
        render()
        part('.announce').textContent = codesError
        return
      }
      isStarting = true
      note = ''
      render()
      const reply = await requestRun()
      isStarting = false
      // Once started, the run panel takes over and this button steps aside.
      if (reply?.ok) return close()
      if (reply?.run) inspection = { ...inspection, run: reply.run }
      note = refusalText(reply)
      render()
      part('.announce').textContent = note
    }

    async function requestRun() {
      const additionalCodes = part('#additional-codes').value
      try {
        Janice.couponCandidates.mergeCandidates(inlineCandidates ?? inspection?.candidates ?? [], additionalCodes)
        return await send({ type: 'janice:try', ...(additionalCodes.trim() ? { additionalCodes } : {}) })
      } catch (error) {
        return { ok: false, reason: 'error', detail: String(error?.message ?? error) }
      }
    }

    function runUpdated(run) {
      latestRun = run
      if (inspection) inspection = { ...inspection, run }
      render()
      void syncInlineCoupon()
    }

    async function copyCode(code, button) {
      let isCopied = false
      try {
        await win.navigator.clipboard.writeText(code)
        isCopied = true
      } catch {
        // No clipboard access, for example when the page's permissions policy blocks it.
      }
      button.textContent = isCopied ? 'Copied' : "Couldn't copy"
      part('.announce').textContent = isCopied ? `Copied ${code}.` : `Couldn't copy ${code}.`
      win.setTimeout(() => (button.textContent = 'Copy'), 2000)
    }

    // The gear's menu. The popover opens and closes itself (popovertarget, light dismiss, Escape); opening it
    // keeps the card open until the card is closed.
    const closeMenu = () => isMenuOpen && menu.hidePopover()
    // Without CSS anchor positioning (before Chrome 129) the menu is placed under the gear by hand.
    function placeMenu() {
      if (win.CSS?.supports?.('position-area', 'block-end')) return
      const gear = part('.gear').getBoundingClientRect()
      menu.style.setProperty('top', `${gear.bottom + 6}px`)
      menu.style.setProperty('right', `${Math.max(MARGIN, win.innerWidth - gear.right)}px`)
    }

    // Hide on this page, or a snooze: the button and its Use code control leave the page at once. A snooze is
    // also kept, and other tabs and later pages follow it (storageChanged).
    async function quiet(action) {
      if (action === 'hide-page') isHiddenHere = true
      else snoozedBy = action === 'snooze-site' ? 'store' : 'everywhere'
      close()
      syncDisplay()
      inlineCoupon.hide()
      if (action === 'hide-page' || !storage) return
      try {
        if (action === 'snooze-site') await Janice.snooze.snoozeStore(storage.local, store)
        else await Janice.snooze.snoozeEverywhere(storage.local)
      } catch {
        // Not kept: the button stays hidden on this page only.
      }
    }

    async function openSettings() {
      close()
      try {
        await send({ type: 'janice:open-settings' })
      } catch {
        // Still a click away: the toolbar popup's gear, or Options in Janice's toolbar menu.
      }
    }

    // The run panel takes the corner during and after a run; the button comes back when it closes.
    let isPanelShown = false
    // Shown unless the run panel has the corner or the shopper hid or snoozed the button.
    function syncDisplay() {
      host.style.setProperty('display', isPanelShown || isQuiet() ? 'none' : 'block', 'important')
    }
    function syncWithPanel() {
      const isShown = Boolean(doc.querySelector('janice-coupons-panel'))
      if (isShown === isPanelShown) return
      isPanelShown = isShown
      syncDisplay()
      if (!isShown) return void syncInlineCoupon()
      inlineCoupon.hide()
      close()
      inspection = null
    }
    function scanPage() {
      if (isPanelShown) return
      localDiscovery = Janice.checkoutDiscovery?.inspect({ document: doc, location: win.location }) ?? null
      host.setAttribute('data-checkout', localDiscovery?.kind ?? 'none')
      render()
      void syncInlineCoupon()
    }

    async function syncInlineCoupon() {
      const inputs = () => Janice.checkoutDiscovery.findVisibleDrawerInputs({ document: doc })
      if (!host.isConnected || !isRestored || isQuiet() || isPanelShown || isOpen || inputs().length === 0) return inlineCoupon.hide()
      if (inlineCandidates !== null) return inlineCoupon.sync({ inputs: inputs(), candidates: inlineCandidates, run: latestRun ?? inspection?.run ?? null })
      if (inlineChecking) return
      inlineChecking = true
      try {
        // Highlight only actual provider candidates. Discovery never writes
        // to a field; Use code is the shopper's explicit fill action.
        const reply = await send({ type: 'janice:inspect' })
        if (!host.isConnected) return
        inlineCandidates = reply?.ok && !reply.providerError ? reply.candidates ?? [] : []
        if (reply?.run && (!latestRun || reply.run.updatedAt >= latestRun.updatedAt)) latestRun = reply.run
        if (isPanelShown || isOpen || isQuiet()) return inlineCoupon.hide()
        inlineCoupon.sync({ inputs: inputs(), candidates: inlineCandidates, run: latestRun })
      } catch {
        inlineCandidates = []
        inlineCoupon.hide()
      } finally {
        inlineChecking = false
      }
    }
    const isJaniceNode = node => {
      const element = node.nodeType === 1 ? node : node.parentElement
      return Boolean(element?.closest('janice-coupons-launcher, janice-coupons-panel, janice-inline-coupon'))
    }
    function pageChanged(records = []) {
      syncWithPanel()
      if (records.length && records.every(record => isJaniceNode(record.target) || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].length && [...record.addedNodes, ...record.removedNodes].every(isJaniceNode)))) return
      win.clearTimeout(refreshTimer)
      refreshTimer = win.setTimeout(() => {
        scanPage()
        if (isOpen && !isPanelShown && !isStarting && !ACTIVE.has(inspection?.run?.status)) void refresh()
      }, 180)
    }
    const observer = new win.MutationObserver(pageChanged)

    // Moving the button: it slides along the right edge when its tab is dragged, or with the up and down arrow
    // keys while the tab has focus. Its spot is kept for later pages in chrome.storage.local, as a share of the
    // edge's length so that a resized window keeps it in proportion. Until moved, it sits in its default spot.
    const POSITION = 'launcher:position'
    const SNOOZE = Janice.snooze.KEY
    const MARGIN = 8
    const STEP = 15
    // The card: its gap to the tab above or below it, how far the store tile stands above its top edge, and the
    // narrowest window in which the wide tips card beside the tab is wide enough for two columns (content/tips.js).
    const GAP = 14
    const TILE = 28
    const WIDE_WINDOW = 700
    const storage = win.chrome?.storage
    let share = null
    let drag = null
    let wasDragged = false

    // While the button is hidden for the panel it has no height, so the tab's stands in.
    const travel = () => Math.max(0, win.innerHeight - (host.offsetHeight || 48) - 2 * MARGIN)

    // Every move goes through this one clamp, so the button never leaves the window.
    function moveTo(top) {
      const clamped = Math.min(Math.max(top, MARGIN), MARGIN + travel())
      host.style.setProperty('top', `${clamped}px`, 'important')
      host.style.setProperty('bottom', 'auto', 'important')
      share = travel() ? (clamped - MARGIN) / travel() : 0
      if (isOpen) placeCard()
    }
    const moveToShare = value => moveTo(MARGIN + Math.min(Math.max(value, 0), 1) * travel())

    // The card shows whole, never scrolled (owner request, 2026-10-24). It opens above the tab, or below it when the
    // tab sits high up, if it fits there; otherwise beside the tab, slid along the edge to stay in the window. Tips
    // that would be taller than the window take two columns. Only a card taller than the whole window, as on a page
    // zoomed far in, is capped and scrolls, rather than shrinking its text.
    function placeCard() {
      if (!isOpen) return
      const { top, bottom } = tab.getBoundingClientRect()
      // Room for the store tile over the coupon card's top edge, even before the store is known; tips have none.
      const tile = tips ? 0 : TILE
      const whole = win.innerHeight - 2 * MARGIN - tile
      // Its natural height, uncapped and in one column.
      card.style.removeProperty('--room')
      card.removeAttribute('data-wide')
      card.removeAttribute('data-side')
      let height = card.offsetHeight
      if (tips && height > whole && win.innerWidth >= WIDE_WINDOW) {
        card.setAttribute('data-wide', '')
        height = card.offsetHeight
      }
      const above = top - GAP - tile - MARGIN
      const below = win.innerHeight - bottom - GAP - tile - MARGIN
      if (height <= Math.max(above, below)) card.dataset.side = below > above ? 'below' : 'above'
      else card.dataset.side = 'beside'
      card.style.setProperty('--tile', `${tile}px`)
      if (card.dataset.side !== 'beside') return
      // Beside the tab its width can be smaller in a narrow window, so it is measured again.
      height = Math.min(card.offsetHeight, whole)
      if (height === whole) card.style.setProperty('--room', `${whole}px`)
      const level = Math.min(Math.max((top + bottom - height) / 2, MARGIN + tile), win.innerHeight - MARGIN - height)
      card.style.setProperty('--top', `${level - top}px`)
    }
    // The card is placed again whenever it renders (and the tips when they do). Anything else that changes its size,
    // like a resized codes box, places it on the next frame: outside the observer's callback, so not as a loop.
    let placing = 0
    const sizeObserver = win.ResizeObserver
      ? new win.ResizeObserver(() => {
          if (isOpen && !placing) placing = win.requestAnimationFrame(() => ((placing = 0), placeCard()))
        })
      : null

    async function keepPosition() {
      try {
        await storage?.local.set({ [POSITION]: { share } })
      } catch {
        // Not kept: the button stays where it is on this page.
      }
    }

    // The kept spot and any snooze are read before the button shows, so it never jumps or flashes.
    async function restore() {
      let kept = {}
      if (storage) {
        host.style.setProperty('visibility', 'hidden', 'important')
        try {
          kept = await storage.local.get([POSITION, SNOOZE])
        } catch {
          // The default spot, and no snooze.
        }
      }
      if (Number.isFinite(kept[POSITION]?.share)) moveToShare(kept[POSITION].share)
      snoozedBy = Janice.snooze.hiddenBy(kept[SNOOZE], store?.id)
      isRestored = true
      syncDisplay()
      host.style.removeProperty('visibility')
      void syncInlineCoupon()
      recordVisit()
    }

    // Tips keep today's price once the button may show, not while it is snoozed.
    function recordVisit() {
      if (!tips || isVisitRecorded || !isRestored || snoozedBy) return
      isVisitRecorded = true
      void tips.recordVisit()
    }

    // Moved in another tab; snoozed or turned back on in another tab, the popup or the settings page.
    const storageChanged = (changes, area) => {
      if (area !== 'local') return
      const value = changes[POSITION]?.newValue?.share
      if (!drag && Number.isFinite(value)) moveToShare(value)
      if (!changes[SNOOZE]) return
      snoozedBy = Janice.snooze.hiddenBy(changes[SNOOZE].newValue, store?.id)
      if (snoozedBy) close()
      syncDisplay()
      void syncInlineCoupon()
      recordVisit()
    }
    const resized = () => {
      if (share !== null) moveToShare(share)
      else placeCard()
      pageChanged()
    }

    tab.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return
      wasDragged = false
      drag = { pointerId: event.pointerId, startY: event.clientY, offset: event.clientY - host.getBoundingClientRect().top, isMoving: false }
      tab.setPointerCapture?.(event.pointerId)
    })
    tab.addEventListener('pointermove', event => {
      if (event.pointerId !== drag?.pointerId) return
      if (!drag.isMoving) {
        // A few pixels of travel make it a drag rather than a click.
        if (Math.abs(event.clientY - drag.startY) < 4) return
        drag.isMoving = true
        wasDragged = true
        tab.classList.add('dragging')
        close()
      }
      moveTo(event.clientY - drag.offset)
    })
    const endDrag = () => {
      if (drag?.isMoving) {
        void keepPosition()
        // The click that ends a drag is ignored; a touch drag may end without one.
        win.setTimeout(() => (wasDragged = false), 0)
      }
      drag = null
      tab.classList.remove('dragging')
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) tab.addEventListener(type, endDrag)
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      moveTo(host.getBoundingClientRect().top + (event.key === 'ArrowUp' ? -STEP : STEP))
      void keepPosition()
    })

    const outside = event => isOpen && !event.composedPath().includes(host) && close()
    tab.addEventListener('pointerenter', event => event.pointerType === 'mouse' && open())
    tab.addEventListener('pointerleave', leave)
    tab.addEventListener('click', () => {
      if (wasDragged) return
      if (isOpen && isPinned) close()
      else open({ pin: true })
    })
    card.addEventListener('pointerenter', () => win.clearTimeout(closeTimer))
    card.addEventListener('pointerleave', leave)
    part('.close').addEventListener('click', () => close({ focus: true }))
    menu.addEventListener('beforetoggle', event => {
      isMenuOpen = event.newState === 'open'
      part('.gear').setAttribute('aria-expanded', String(isMenuOpen))
      if (isMenuOpen) {
        isPinned = true
        return placeMenu()
      }
      // Chromium doesn't give focus back to the gear for a popover in a shadow root (as of Chrome 153).
      if (menu.contains(shadow.activeElement)) part('.gear').focus()
    })
    menu.addEventListener('click', event => {
      const action = event.target.closest('.menu-item')?.dataset.action
      if (action === 'settings') void openSettings()
      else if (action) void quiet(action)
    })
    part('.try').addEventListener('click', start)
    part('.manual-codes').addEventListener('toggle', placeCard)
    part('#additional-codes').addEventListener('input', () => {
      isPinned = true
      note = ''
      render()
    })
    shadow.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !isOpen) return
      event.stopPropagation()
      // An open menu closes by itself (the popover's light dismiss), and the card stays.
      if (!isMenuOpen) close({ focus: true })
    })

    return {
      element: host,
      mount() {
        const parent = doc.body ?? doc.documentElement
        parent.append(host)
        observer.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['name', 'id', 'type', 'placeholder', 'aria-label', 'aria-labelledby', 'disabled', 'readonly', 'hidden', 'inert', 'aria-hidden', 'open', 'style', 'class', 'aria-expanded'] })
        doc.addEventListener('pointerdown', outside, true)
        doc.addEventListener('transitionend', pageChanged, true)
        doc.addEventListener('animationend', pageChanged, true)
        doc.addEventListener('scroll', pageChanged, { passive: true, capture: true })
        win.addEventListener('popstate', pageChanged)
        win.addEventListener('resize', resized)
        storage?.onChanged.addListener(storageChanged)
        sizeObserver?.observe(card)
        Janice.runViews.add(runUpdated)
        syncWithPanel()
        scanPage()
        render()
        void restore()
      },
      open,
      close,
      destroy() {
        observer.disconnect()
        doc.removeEventListener('pointerdown', outside, true)
        doc.removeEventListener('transitionend', pageChanged, true)
        doc.removeEventListener('animationend', pageChanged, true)
        doc.removeEventListener('scroll', pageChanged, true)
        win.removeEventListener('popstate', pageChanged)
        win.removeEventListener('resize', resized)
        storage?.onChanged.removeListener(storageChanged)
        sizeObserver?.disconnect()
        if (placing) win.cancelAnimationFrame(placing)
        Janice.runViews.delete(runUpdated)
        win.clearTimeout(closeTimer)
        win.clearTimeout(refreshTimer)
        inlineCoupon.destroy()
        host.remove()
      },
    }
  }

  Janice.createLauncher = createLauncher

  if (typeof module === 'object' && module.exports) module.exports = { createLauncher }
})(typeof globalThis === 'object' ? globalThis : this)
