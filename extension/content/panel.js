/*
 * The checkout panel: a small card in the page's corner with progress, a
 * Stop button and the outcome. It lives in a shadow root so the store's
 * styles cannot restyle it, and never takes focus from the checkout.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    p { margin: 0; }
    .panel {
      --brand: #5b2c91; --brand-2: #7b46c7; --brand-text: #5b2c91;
      --bg: #ffffff; --surface: #f5f2f9; --surface-2: #e9e2f2;
      --text: #1d1b20; --muted: #5c5766; --line: #e1d9eb; --line-strong: #b9aecb;
      --success: #0b7a3b; --success-bg: #e5f4ea; --warning: #8a4600; --warning-bg: #fcefdf;
      --error: #b3261e; --error-bg: #fbe9e7; --focus: #1a5fb4;
      width: min(340px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg);
      color: var(--text);
      box-shadow: 0 12px 32px rgba(29, 27, 32, 0.22), 0 2px 6px rgba(29, 27, 32, 0.12);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      animation: rise 0.22s ease-out;
    }
    .bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(135deg, var(--brand), var(--brand-2)); color: #ffffff; }
    .logo { flex: none; width: 24px; height: 24px; border-radius: 6px; }
    h2 { margin: 0; font-size: 14.5px; font-weight: 700; }
    .demo {
      margin-left: auto; padding: 1px 8px;
      border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 999px; background: rgba(255, 255, 255, 0.16);
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .body { display: grid; gap: 10px; padding: 14px 16px 16px; }
    .working { display: grid; gap: 8px; }
    .working-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
    .kicker { color: var(--brand-text); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .ticket {
      padding: 2px 10px; border: 2px dashed var(--brand-text); border-radius: 8px; background: var(--surface);
      color: var(--brand-text); font: 700 14px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.08em;
    }
    .progress { height: 8px; overflow: hidden; border-radius: 999px; background: var(--surface-2); }
    .progress > span { display: block; width: var(--value, 40%); height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--brand), var(--brand-2)); transition: width 0.4s ease; }
    .progress.indeterminate > span { width: 40%; animation: slide 1.3s ease-in-out infinite; }
    .status { font-weight: 600; }
    /* The finished state is announced here and shown in the result block. */
    .status.announce-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .baseline { color: var(--muted); font-size: 12.5px; }
    .result { display: grid; gap: 8px; }
    .figure { display: grid; justify-self: center; place-items: center; }
    .figure.savings { padding: 8px 20px 6px; border-radius: 14px; background: var(--success-bg); color: var(--success); }
    .figure-amount { font-size: 30px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
    .figure-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .figure.symbol { width: 44px; height: 44px; border-radius: 50%; background: var(--surface); color: var(--brand-text); }
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
    button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    button:disabled { cursor: default; opacity: 0.6; }
    [hidden] { display: none !important; }
    @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      .panel { animation: none; }
      .progress > span { transition: none; }
      .progress.indeterminate > span { width: 100%; animation: none; opacity: 0.5; }
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        --brand: #6d3bb0; --brand-2: #8a55d1; --brand-text: #c9a8f5;
        --bg: #1b1920; --surface: #26232d; --surface-2: #353040;
        --text: #f4f1f8; --muted: #c3bccf; --line: #3a3544; --line-strong: #5d566a;
        --success: #7fd69a; --success-bg: #173322; --warning: #f2b56b; --warning-bg: #3a2a16;
        --error: #f28b82; --error-bg: #3b1d1b; --focus: #8ab4f8;
      }
    }
  `

  function createPanel({ window: win = root, onStop = () => {}, onClose = () => {} } = {}) {
    const doc = win.document
    const { describeResult, progressText, phaseTitle, savingsText, amount, codeList } = Janice.messages
    const { LOGO, icon, resultIcon } = Janice.icons

    const host = doc.createElement('janice-coupons-panel')
    host.setAttribute('data-janice-panel', '')
    for (const [property, value] of Object.entries({ position: 'fixed', right: '16px', bottom: '16px', 'z-index': '2147483647', display: 'block' })) {
      host.style.setProperty(property, value, 'important')
    }

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
            <div class="progress" aria-hidden="true"><span></span></div>
          </div>
          <p class="status" role="status" aria-live="polite"></p>
          <p class="baseline" hidden></p>
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

      const bar = part('.progress')
      const isKnown = Number.isInteger(run.progress?.index) && run.progress.count > 0
      bar.classList.toggle('indeterminate', !isKnown)
      if (isKnown) bar.style.setProperty('--value', `${((run.progress.index - 0.5) / run.progress.count) * 100}%`)
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
      mount: () => (doc.body ?? doc.documentElement).append(host),
      render,
      destroy: () => host.remove(),
    }
  }

  Janice.createPanel = createPanel

  if (typeof module === 'object' && module.exports) module.exports = { createPanel }
})(typeof globalThis === 'object' ? globalThis : this)
