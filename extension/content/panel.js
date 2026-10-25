/*
 * The checkout panel: a small card in the page's corner with progress, a
 * Stop button and the outcome. It lives in a shadow root so the store's
 * styles cannot restyle it. A manual popover keeps it above page stacking
 * contexts without trapping focus or blocking the checkout.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    p { margin: 0; }
    .panel {
      /* Light theme only, whatever the system's setting: white, grays and one blue accent (owner request,
         2026-10-24). Success uses the blue; warnings and errors are told by their words and icons. */
      --accent: #2557d6; --accent-soft: #eef2fd;
      --bg: #ffffff; --surface: #f5f6f8; --surface-2: #eceef2;
      --text: #1c252c; --muted: #596071; --line: #dfe1e6; --line-strong: #80879a;
      --success: var(--accent); --success-bg: var(--accent-soft); --warning: var(--text); --warning-bg: var(--surface);
      --error: var(--text); --error-bg: var(--surface); --focus: var(--accent);
      /* Light, scrollbars included, even when the system is set to dark. */
      color-scheme: only light;
      width: min(340px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg);
      color: var(--text);
      box-shadow: 0 12px 32px rgba(28, 37, 44, 0.22), 0 2px 6px rgba(28, 37, 44, 0.12);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: rise 0.22s ease-out;
    }
    .bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--bg); color: var(--text); }
    .logo { flex: none; width: 24px; height: 24px; object-fit: contain; }
    h2 { margin: 0; font-size: 14.5px; font-weight: 700; }
    .demo {
      margin-left: auto; padding: 1px 8px;
      border: 1px solid var(--line-strong); border-radius: 999px; color: var(--muted);
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .body { display: grid; gap: 10px; padding: 14px 16px 16px; }
    .working { display: grid; gap: 8px; }
    .working-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
    .kicker { color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .ticket {
      min-width: 0; overflow-wrap: anywhere;
      padding: 2px 10px; border: 2px dashed var(--accent); border-radius: 8px; background: var(--surface);
      color: var(--accent); font: 700 14px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.08em;
    }
    /* A native <progress>, fully restyled; cqi lets the indeterminate fill move in track widths. */
    .progress {
      --indeterminate-duration: 1.3s;
      container-type: inline-size; display: block; width: 100%; height: 8px;
      overflow: clip; border: 0 solid; border-radius: 999px; background: var(--surface-2); appearance: none;
    }
    .progress::-webkit-progress-bar { background: transparent; }
    .progress::-webkit-progress-value { border-radius: 999px; background: var(--accent); transition: inline-size 0.4s ease; }
    .progress:indeterminate::-webkit-progress-value { animation: slide var(--indeterminate-duration) ease-in-out infinite; }
    .status { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
    /* The finished state is announced here and shown in the result block. */
    .status.announce-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .baseline { color: var(--muted); font-size: 12.5px; }
    .session-note { color: var(--muted); font-size: 12.5px; }
    .attempt-log { font-size: 13px; }
    .attempt-log summary { cursor: pointer; font-weight: 650; padding-block: 6px; }
    .attempt-log ul { margin-top: 4px; }
    .result { display: grid; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .body > *, .working > *, .attempt-log li { min-width: 0; overflow-wrap: anywhere; }
    .figure { display: grid; justify-self: center; place-items: center; }
    .figure.savings { padding: 8px 20px 6px; border-radius: 14px; background: var(--success-bg); color: var(--success); }
    .figure-amount { font-size: 30px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
    .figure-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .figure.symbol { width: 44px; height: 44px; border-radius: 50%; background: var(--surface); color: var(--accent); }
    .figure .icon { width: 24px; height: 24px; }
    .tone-warning .figure.symbol { background: var(--warning-bg); color: var(--warning); }
    .tone-error .figure.symbol { background: var(--error-bg); color: var(--error); }
    h3 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.3; text-align: center; text-wrap: balance; }
    .tone-success h3 { color: var(--success); }
    .tone-warning h3 { color: var(--warning); }
    .tone-error h3 { color: var(--error); }
    ul { margin: 0; padding: 10px 12px 10px 28px; border-radius: 12px; background: var(--surface); font-size: 13px; }
    li + li { margin-top: 4px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button {
      min-height: 34px; padding: 4px 18px; border: 1.5px solid var(--line-strong); border-radius: 999px;
      background: var(--bg); color: var(--text); font: inherit; font-weight: 650; cursor: pointer;
    }
    button:hover { background: var(--surface); }
    button:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    button:disabled { cursor: default; opacity: 0.6; }
    [hidden] { display: none !important; }
    @keyframes slide { from, to { inline-size: 40%; margin-right: auto; } from { translate: -100%; } to { translate: 100cqi; } }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      .panel { animation: none; }
      .progress::-webkit-progress-value { transition: none; }
      /* Slower, not stopped, so it still shows that work is going on. */
      .progress { --indeterminate-duration: 10s; }
    }
  `

  function createPanel({ window: win = root, onStop = () => {}, onClose = () => {} } = {}) {
    const doc = win.document
    const { describeResult, progressText, phaseTitle, savingsText, amount, codeList } = Janice.messages
    const { LOGO, icon, resultIcon } = Janice.icons

    const host = doc.createElement('janice-coupons-panel')
    host.setAttribute('data-janice-panel', '')
    for (const [property, value] of Object.entries({ position: 'fixed', top: 'auto', left: 'auto', right: '16px', bottom: '16px', margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'visible', 'z-index': '2147483647' })) {
      host.style.setProperty(property, value, 'important')
    }
    // Chrome 116+ supports popovers. Keep a fixed-position fallback for
    // non-browser test DOMs and environments where the API is unavailable.
    const usePopover = typeof host.showPopover === 'function'
    if (usePopover) host.setAttribute('popover', 'manual')
    else host.style.setProperty('display', 'block', 'important')

    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <section class="panel" role="region" aria-label="Janice Coupons">
        <header class="bar">
          ${LOGO}
          <h2>Janice Coupons</h2>
          <span class="demo" hidden title="Simulated checkout: results do not reflect a real store">Demo</span>
        </header>
        <div class="body">
          <div class="working" hidden>
            <div class="working-top">
              <p class="kicker"></p>
              <span class="ticket" aria-hidden="true" hidden></span>
            </div>
            <progress class="progress" aria-label="Testing progress"></progress>
          </div>
          <p class="status" role="status" aria-live="polite"></p>
          <p class="session-note">Keep checkout open. Janice tests one code at a time.</p>
          <p class="baseline" hidden></p>
          <details class="attempt-log" hidden>
            <summary></summary>
            <ul aria-label="Coupon attempts"></ul>
          </details>
          <div class="result" hidden>
            <div class="figure" aria-hidden="true"></div>
            <h3></h3>
            <ul></ul>
          </div>
          <div class="actions">
            <button type="button" class="stop">Stop</button>
            <button type="button" class="close" hidden>Close</button>
          </div>
        </div>
      </section>
    `

    const part = selector => shadow.querySelector(selector)
    const element = (tag, className, text) => Object.assign(doc.createElement(tag), { className, textContent: text })
    part('.stop').addEventListener('click', () => onStop())
    part('.close').addEventListener('click', () => onClose())

    function paintWorking(run) {
      part('.kicker').textContent = phaseTitle(run)
      const ticket = part('.ticket')
      ticket.hidden = !run.progress?.code
      ticket.textContent = run.progress?.code ?? ''

      // Without a value the bar is indeterminate; with one, halfway through the code being tried.
      const bar = part('.progress')
      const { index, count } = run.progress ?? {}
      if (Number.isInteger(index) && count > 0) {
        bar.max = count
        bar.value = index - 0.5
        bar.setAttribute('aria-valuetext', `Trying code ${index} of ${count}`)
      } else {
        bar.removeAttribute('value')
        bar.removeAttribute('aria-valuetext')
      }
    }

    function paintFigure(run, tone) {
      const figure = part('.figure')
      const savings = savingsText(run)
      figure.className = `figure ${savings ? 'savings' : 'symbol'}`
      if (savings) figure.replaceChildren(element('span', 'figure-amount', savings), element('span', 'figure-label', 'saved'))
      else figure.innerHTML = icon(resultIcon(tone, run.result))
    }

    function render(run) {
      const isActive = run.status === 'running' || run.status === 'stopping'
      const result = part('.result')

      part('.demo').hidden = !run.store.isDemo
      part('.working').hidden = !isActive
      part('.session-note').hidden = !isActive
      const attempts = run.attempts ?? []
      part('.attempt-log').hidden = attempts.length === 0
      part('.attempt-log summary').textContent = `${attempts.length} ${attempts.length === 1 ? 'code' : 'codes'} tried`
      part('.attempt-log ul').replaceChildren(...attempts.map(attempt => {
        const outcome = attempt.outcome === 'accepted' ? `Accepted${attempt.total ? ` · total ${amount(attempt.total)}` : ''}`
          : attempt.outcome === 'rejected' ? 'Not accepted' : 'Unverified'
        return element('li', '', `${attempt.code}: ${outcome}`)
      }))
      part('.baseline').hidden = !(isActive && run.baseline)
      if (run.baseline) {
        part('.baseline').textContent = `Before testing: ${codeList(run.baseline.codes)} · total ${amount(run.baseline.total)}`
      }

      const stop = part('.stop')
      stop.hidden = !isActive
      stop.disabled = run.status === 'stopping'
      stop.textContent = run.status === 'stopping' ? 'Stopping…' : 'Stop'
      part('.close').hidden = isActive

      const status = part('.status')
      status.classList.toggle('announce-only', !isActive)
      if (isActive) {
        paintWorking(run)
        status.textContent = progressText(run)
        result.hidden = true
        return
      }

      const { title, lines, tone } = describeResult(run)
      status.textContent = run.store.isDemo ? `Demo result: ${title}` : title
      result.hidden = false
      result.className = `result tone-${tone}`
      paintFigure(run, tone)
      result.querySelector('h3').textContent = title
      result.querySelector('ul').replaceChildren(...lines.map(line => element('li', '', line)))
    }

    return {
      element: host,
      mount: () => {
        ;(doc.body ?? doc.documentElement).append(host)
        if (usePopover) host.showPopover()
      },
      render,
      destroy: () => host.remove(),
    }
  }

  Janice.createPanel = createPanel

  if (typeof module === 'object' && module.exports) module.exports = { createPanel }
})(typeof globalThis === 'object' ? globalThis : this)
