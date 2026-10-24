/*
 * The page button: Janice's tab on the right edge of Sharper Image pages,
 * and the card it opens. The card says how many coupons Janice has for the
 * store; at checkout it offers Try coupons, elsewhere a link to the
 * checkout. Opening it only reads, through the service worker's inspect as
 * when the popup opens: the checkout changes only after Try coupons. The
 * card opens on hover or click, never by itself, and the button steps aside
 * while the run panel is on the page. Like the panel, it lives in a shadow
 * root so the store's styles cannot restyle it.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    p, h2, ul { margin: 0; }
    .root {
      --brand: #5b2c91; --brand-2: #7b46c7; --brand-text: #5b2c91;
      --bg: #ffffff; --surface: #f5f2f9; --text: #1d1b20; --muted: #5c5766;
      --line: #e1d9eb; --line-strong: #b9aecb;
      --success: #0b7a3b; --warning: #8a4600; --error: #b3261e; --focus: #1a5fb4;
      position: relative;
      display: flex;
      justify-content: flex-end;
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .tab {
      display: grid; place-items: center;
      width: 50px; height: 48px; margin: 0; padding: 0 2px 0 0;
      border: 0; border-radius: 14px 0 0 14px;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 6px 18px rgba(29, 27, 32, 0.28), 0 1px 3px rgba(29, 27, 32, 0.2);
      cursor: pointer;
      transition: width 0.15s ease;
    }
    .tab:hover, .tab[aria-expanded="true"] { width: 58px; }
    .tab .mark { width: 34px; height: 34px; }
    /* On the purple tab the tag stands alone, as on the toolbar icon. */
    .tab .mark rect { fill: none; }
    .card {
      position: absolute; right: 12px; bottom: calc(100% + 14px);
      width: min(360px, calc(100vw - 24px));
      border: 1px solid var(--line); border-radius: 16px;
      background: var(--bg);
      box-shadow: 0 16px 40px rgba(29, 27, 32, 0.24), 0 2px 8px rgba(29, 27, 32, 0.12);
      animation: rise 0.18s ease-out;
    }
    .store {
      position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
      display: grid; place-items: center;
      width: 56px; height: 56px;
      border: 1px solid #e1d9eb; border-radius: 14px;
      background: #ffffff; color: #1d1b20;
      box-shadow: 0 4px 12px rgba(29, 27, 32, 0.16);
      font-size: 18px; font-weight: 800; letter-spacing: 0.02em;
    }
    .head { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 8px 0 12px; }
    .head .mark { width: 26px; height: 26px; }
    .demo {
      padding: 1px 8px; border: 1px solid var(--line-strong); border-radius: 999px;
      color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .close {
      display: grid; place-items: center; width: 34px; height: 34px; margin-left: auto; padding: 0;
      border: 0; border-radius: 50%; background: transparent; color: var(--text); cursor: pointer;
    }
    .close:hover { background: var(--surface); }
    .close .icon { width: 20px; height: 20px; }
    .body {
      display: grid; gap: 12px;
      max-height: calc(100vh - 240px); overflow: auto;
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
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
      padding: 8px 8px 8px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface);
    }
    .ticket {
      padding: 2px 8px; border: 2px dashed var(--brand-text); border-radius: 8px; color: var(--brand-text);
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
      background: linear-gradient(135deg, var(--brand), var(--brand-2)); color: #ffffff;
      font-size: 15.5px; line-height: 22px; box-shadow: 0 4px 12px rgba(91, 44, 145, 0.3);
    }
    .primary:hover { filter: brightness(1.08); }
    .secondary { min-height: 40px; padding: 8px 18px; border: 1.5px solid var(--line-strong); background: var(--bg); color: var(--text); font-size: 14.5px; }
    .secondary:hover { background: var(--surface); }
    button:disabled { cursor: default; opacity: 0.6; }
    button:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .note { color: var(--warning); font-size: 13px; }
    .fine { padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    .spinner {
      justify-self: center; width: 22px; height: 22px;
      border: 3px solid var(--surface); border-top-color: var(--brand-2); border-radius: 50%;
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
    @media (prefers-color-scheme: dark) {
      .root {
        --brand: #6d3bb0; --brand-2: #8a55d1; --brand-text: #c9a8f5;
        --bg: #1b1920; --surface: #26232d; --text: #f4f1f8; --muted: #c3bccf;
        --line: #3a3544; --line-strong: #5d566a;
        --success: #7fd69a; --warning: #f2b56b; --error: #f28b82; --focus: #8ab4f8;
      }
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
        <button type="button" class="tab" aria-expanded="false" aria-controls="card">${MARK}</button>
        <section class="card" id="card" aria-label="Janice Coupons" hidden>
          <span class="store" aria-hidden="true"></span>
          <header class="head">
            ${MARK}
            <span class="demo" hidden title="Simulated checkout: results do not reflect a real store">Demo</span>
            <button type="button" class="close" aria-label="Close">${icon('close')}</button>
          </header>
          <div class="body">
            <span class="spinner" hidden></span>
            <h2 class="heading" aria-live="polite"></h2>
            <p class="sub" hidden></p>
            <ul class="coupons" hidden></ul>
            <p class="text" hidden></p>
            <button type="button" class="try" hidden></button>
            <a class="go primary" hidden>Go to checkout</a>
            <p class="note" hidden></p>
            <p class="fine">Never touches payment details or places orders.</p>
          </div>
          <p class="announce" role="status"></p>
        </section>
      </div>
    `

    const part = selector => shadow.querySelector(selector)
    const element = (tag, className, text) => Object.assign(doc.createElement(tag), { className, textContent: text ?? '' })
    const tab = part('.tab')
    const card = part('.card')
    const rows = new Map()

    let inspection = null
    let isOpen = false
    let isPinned = false
    let isStarting = false
    let note = ''
    let closeTimer
    let requests = 0

    /** What the card shows for the page as last inspected. */
    function screen() {
      if (!inspection) return { heading: 'Looking for coupons…', isBusy: true }
      if (!inspection.ok) return { heading: "Janice can't read this page", text: 'Reload the page, then open Janice again.', warn: true }
      const store = inspection.detection?.store
      if (!store) return { heading: 'No coupons here', text: 'Janice Coupons works on Sharper Image.' }
      if (inspection.providerError) {
        return { store, heading: "Couldn't load coupons", text: `${inspection.providerError}. Nothing was changed.`, warn: true }
      }

      const candidates = inspection.candidates ?? []
      const count = candidates.length
      if (count === 0) return { store, count, heading: 'No coupons found yet', text: `Janice has no codes for ${store.name} right now.` }

      const one = count === 1
      const found = { store, candidates, count, heading: countText(count), sub: `for ${store.name}` }
      if (store.page !== 'checkout') {
        return {
          ...found,
          link: Janice.stores.STORES[store.id]?.checkoutUrl,
          text: one
            ? 'Janice tries it for you at checkout and keeps it only if your total goes down.'
            : 'Janice tries them for you at checkout and keeps the best one only if your total goes down.',
        }
      }

      const { detection, run } = inspection
      if (run && ACTIVE.has(run.status)) return { ...found, heading: phaseTitle(run), sub: progressText(run) }
      if (run?.result) {
        const { title, tone } = describeResult(run)
        return { ...found, heading: title, tone, sub: `${countText(count)} for ${store.name}`, start: detection.supported && 'again' }
      }
      if (!detection.supported) return { ...found, text: `${reasonText(detection.reason)} Nothing was changed.`, warn: true }
      return {
        ...found,
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
      row.append(element('span', 'ticket', candidate.code), element('span', 'offer', offerSummary(candidate) ?? candidate.offerText ?? 'Coupon code'), copy)
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
      tryButton.disabled = isStarting
      tryButton.className = `try ${view.start === 'again' ? 'secondary' : 'primary'}`
      tryButton.textContent = isStarting ? 'Starting…' : view.start === 'again' ? 'Try coupons again' : 'Try coupons'

      const go = part('.go')
      go.hidden = !view.link
      if (view.link) go.href = view.link
      show('.note', note)
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
      render()
    }

    function open({ pin = false } = {}) {
      win.clearTimeout(closeTimer)
      isPinned ||= pin
      if (isOpen) return render()
      isOpen = true
      note = ''
      render()
      return refresh()
    }

    function close({ focus = false } = {}) {
      win.clearTimeout(closeTimer)
      if (!isOpen) return
      isOpen = false
      isPinned = false
      render()
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
      isStarting = true
      note = ''
      render()
      let reply
      try {
        reply = await send({ type: 'janice:try' })
      } catch (error) {
        reply = { ok: false, reason: 'error', detail: String(error?.message ?? error) }
      }
      isStarting = false
      // Once started, the run panel takes over and this button steps aside.
      if (reply?.ok) return close()
      if (reply?.run) inspection = { ...inspection, run: reply.run }
      note = refusalText(reply)
      render()
      part('.announce').textContent = note
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

    // The run panel takes the corner during and after a run; the button comes back when it closes.
    let isPanelShown = false
    function syncWithPanel() {
      const isShown = Boolean(doc.querySelector('janice-coupons-panel'))
      if (isShown === isPanelShown) return
      isPanelShown = isShown
      host.style.setProperty('display', isShown ? 'none' : 'block', 'important')
      if (!isShown) return
      close()
      inspection = null
    }
    const observer = new win.MutationObserver(syncWithPanel)

    const outside = event => isOpen && !event.composedPath().includes(host) && close()
    tab.addEventListener('pointerenter', event => event.pointerType === 'mouse' && open())
    tab.addEventListener('pointerleave', leave)
    tab.addEventListener('click', () => (isOpen && isPinned ? close() : open({ pin: true })))
    card.addEventListener('pointerenter', () => win.clearTimeout(closeTimer))
    card.addEventListener('pointerleave', leave)
    part('.close').addEventListener('click', () => close({ focus: true }))
    part('.try').addEventListener('click', start)
    shadow.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !isOpen) return
      event.stopPropagation()
      close({ focus: true })
    })

    return {
      element: host,
      mount() {
        const parent = doc.body ?? doc.documentElement
        parent.append(host)
        observer.observe(parent, { childList: true })
        doc.addEventListener('pointerdown', outside, true)
        syncWithPanel()
        render()
      },
      open,
      close,
      destroy() {
        observer.disconnect()
        doc.removeEventListener('pointerdown', outside, true)
        win.clearTimeout(closeTimer)
        host.remove()
      },
    }
  }

  Janice.createLauncher = createLauncher

  if (typeof module === 'object' && module.exports) module.exports = { createLauncher }
})(typeof globalThis === 'object' ? globalThis : this)
