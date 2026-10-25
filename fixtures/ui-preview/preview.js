// UI preview: the extension's popup, page button and checkout panel, fed
// simulated states. Each frame loads the real files from /extension/ with a
// stand-in for the chrome.* APIs. Nothing here reaches a store or the
// extension.
;(async function () {
  'use strict'

  const usd = amountMinor => ({ amountMinor, currency: 'USD', basis: 'order-total', shippingIncluded: false, taxIncluded: false })
  const STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false, page: 'checkout' }
  const AFF15 = {
    code: 'AFF15',
    offerText: 'Receive $15 Off Your Order when You Spend $150 or More. Enter Coupon Code: AFF15 at Checkout!',
    advertisedDiscount: { type: 'fixed-order-discount', amountMinor: 1500, currency: 'USD' },
    advertisedMinimumSpend: { amountMinor: 15000, currency: 'USD', inclusive: true, basis: null },
  }
  const accepted = { code: 'AFF15', outcome: 'accepted', total: usd(14499), storeMessage: null }
  const rejected = { code: 'AFF15', outcome: 'rejected', total: null, storeMessage: 'Enter a valid discount code or gift card' }
  const putBack = { restoration: 'verified', codes: [], finalTotal: usd(15999) }
  const trying = { index: 1, count: 1, code: 'AFF15' }

  const run = patch => ({
    runId: 'preview',
    store: { id: STORE.id, name: STORE.name, isDemo: false },
    status: 'done',
    phase: null,
    message: '',
    progress: null,
    baseline: { total: usd(15999), codes: [] },
    attempts: [],
    result: null,
    ...patch,
  })
  const RUNS = {
    reading: run({ status: 'running', phase: 'checking', message: 'Reading your checkout…', baseline: null }),
    testing: run({ status: 'running', phase: 'testing', progress: trying, message: 'Trying AFF15 (1 of 1)…' }),
    confirming: run({ status: 'running', phase: 'finalizing', attempts: [accepted], message: 'Confirming AFF15 is applied…' }),
    stopping: run({ status: 'stopping', phase: 'testing', progress: trying, message: 'Trying AFF15 (1 of 1)…' }),
    saved: run({
      attempts: [accepted],
      result: { kind: 'better', code: 'AFF15', codes: ['AFF15'], baselineTotal: usd(15999), finalTotal: usd(14499), savingsMinor: 1500, restoration: 'not-needed' },
    }),
    rejected: run({ attempts: [rejected], result: { kind: 'rejected', ...putBack } }),
    stopped: run({ attempts: [accepted], result: { kind: 'stopped', ...putBack } }),
    already: run({
      baseline: { total: usd(14499), codes: ['AFF15'] },
      result: { kind: 'no-improvement', reason: 'already-applied', codes: ['AFF15'], finalTotal: usd(14499), restoration: 'not-needed' },
    }),
    unconfirmed: run({
      attempts: [{ ...accepted, outcome: 'unverified', total: null }],
      result: { kind: 'unverified', reason: 'timeout', restoration: 'unverified', problem: 'timeout', codes: ['AFF15'], finalTotal: usd(14499) },
    }),
  }

  const checkout = (detection = {}) => ({
    ok: true,
    detection: { store: STORE, supported: true, preview: { total: usd(15999), codes: [] }, ...detection },
    candidates: [AFF15],
    providerError: null,
  })
  const POPUPS = [
    { title: 'Ready at checkout', inspection: checkout() },
    { title: 'Testing a code', inspection: checkout(), run: RUNS.testing },
    { title: 'The code worked and stays applied', inspection: checkout(), run: RUNS.saved },
    { title: 'Code not accepted', inspection: checkout(), run: RUNS.rejected },
    { title: 'Already applied', inspection: checkout({ preview: { total: usd(14499), codes: ['AFF15'] } }), run: RUNS.already },
    { title: 'Stopped', inspection: checkout(), run: RUNS.stopped },
    { title: "Result couldn't be confirmed", inspection: checkout(), run: RUNS.unconfirmed },
    {
      title: 'On the store, before checkout',
      inspection: { ok: true, detection: { store: { ...STORE, page: 'store' }, supported: false, reason: 'not-checkout' }, candidates: [AFF15], providerError: null },
    },
    { title: 'Another website', inspection: { ok: true, detection: { store: null }, candidates: [], providerError: null } },
    { title: "A page Chrome doesn't let extensions read", inspection: { ok: false, reason: 'no-access' } },
  ]
  const LAUNCHERS = [
    { title: 'On a store page', inspection: { ...checkout({ store: { ...STORE, page: 'store' }, supported: false, reason: 'not-checkout' }), run: null } },
    { title: 'At checkout (try it: Try coupons)', inspection: { ...checkout(), run: null } },
    { title: 'After a run', inspection: { ...checkout(), run: RUNS.saved } },
  ]
  const PANELS = [
    { title: 'Testing a code', run: RUNS.testing },
    { title: 'The code worked', run: RUNS.saved },
    { title: 'Code not accepted', run: RUNS.rejected },
    { title: 'Stopped', run: RUNS.stopped },
  ]
  const PANEL_SCRIPTS = ['shared/money.js', 'shared/messages.js', 'shared/icons.js', 'content/panel.js']
  const LAUNCHER_SCRIPTS = [...PANEL_SCRIPTS, 'shared/coupon-candidates.js', 'shared/snooze.js', 'content/stores.js', 'content/checkout-discovery.js', 'content/inline-coupon.js', 'content/launcher.js']

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

  // Called from inside each frame, before the extension's scripts run there.
  window.JanicePreview = {
    popup(win, index) {
      const listeners = []
      let current = POPUPS[index].run ?? null
      let timers = []
      const push = next => {
        current = next
        for (const listener of listeners) listener({ 'run:1': { newValue: next } }, 'session')
      }
      const schedule = steps => {
        timers.forEach(clearTimeout)
        timers = steps.map(([ms, next]) => setTimeout(() => push(next), ms))
      }
      const replies = {
        'janice:inspect': () => ({ ...POPUPS[index].inspection, run: current }),
        'janice:try': () => {
          schedule([[0, RUNS.reading], [900, RUNS.testing], [2700, RUNS.confirming], [3500, RUNS.saved]])
          return { ok: true, run: RUNS.reading }
        },
        'janice:stop': () => {
          schedule([[0, RUNS.stopping], [1200, RUNS.stopped]])
          return { ok: true }
        },
      }
      win.chrome = {
        runtime: { sendMessage: message => pause(150).then(() => replies[message.type]?.()) },
        tabs: { query: async () => [{ id: 1 }] },
        storage: { onChanged: { addListener: listener => listeners.push(listener) } },
      }
    },
    panel(win, index) {
      const panel = win.Janice.createPanel({ window: win })
      panel.mount()
      panel.render(PANELS[index].run)
    },
    // The button with its card open; Try coupons plays a run in a panel, as the page would.
    launcher(win, index) {
      let current = LAUNCHERS[index].inspection.run
      win.chrome = {
        runtime: {
          sendMessage: message =>
            pause(150).then(() => {
              if (message.type === 'janice:inspect') return { ...LAUNCHERS[index].inspection, run: current }
              if (message.type !== 'janice:try') return undefined
              const panel = win.Janice.createPanel({ window: win, onClose: () => panel.destroy() })
              panel.mount()
              const steps = [[0, RUNS.reading], [900, RUNS.testing], [2700, RUNS.confirming], [3500, RUNS.saved]]
              for (const [ms, run] of steps) setTimeout(() => panel.render((current = run)), ms)
              return { ok: true, run: RUNS.reading }
            }),
        },
      }
      // The checkout link would leave the preview.
      win.addEventListener('click', event => event.composedPath().some(node => node.classList?.contains('go')) && event.preventDefault(), true)
      const launcher = win.Janice.createLauncher({ window: win })
      launcher.mount()
      launcher.open({ pin: true })
    },
  }

  // Absolute URLs rather than <base>: Chrome's preload scanner ignores <base> in srcdoc frames.
  const POPUP_URL = new URL('/extension/popup/popup.html', location.href)
  const popupSource = (await (await fetch(POPUP_URL)).text()).replace(/\b(src|href)="([^"#][^"]*)"/g, (_, name, value) => `${name}="${new URL(value, POPUP_URL).href}"`)
  const popupDoc = index => popupSource.replace('<script src=', `<script>parent.JanicePreview.popup(window, ${index})</script>\n    <script src=`)
  const pageDoc = (scripts, call) => `<!doctype html>
    <html lang="en"><head><meta charset="utf-8" />
    <style>
      body { margin: 0; min-height: 100vh; background: #f6f6f7; }
      .page { display: grid; gap: 12px; padding: 20px; }
      .page span { height: 12px; border-radius: 6px; background: #e2e2e6; }
    </style></head>
    <body>
      <div class="page" aria-hidden="true"><span style="width: 55%"></span><span style="width: 80%"></span><span style="width: 40%"></span></div>
      ${scripts.map(src => `<script src="/extension/${src}"></script>`).join('')}
      <script>parent.JanicePreview.${call}</script>
    </body></html>`

  // Frames grow with their content: the popup's own height, or the panel's full height plus its 16px margins.
  function addFrame(gallery, { title, className, srcdoc, measure }) {
    const figure = document.createElement('figure')
    const caption = Object.assign(document.createElement('figcaption'), { textContent: title })
    const frame = Object.assign(document.createElement('iframe'), { className, srcdoc, title })
    frame.addEventListener('load', () => {
      const win = frame.contentWindow
      const fit = () => {
        const height = measure(win.document)
        if (height) frame.style.height = `${Math.ceil(height)}px`
      }
      new win.ResizeObserver(fit).observe(win.document.body)
      win.setTimeout(fit, 50)
    })
    figure.append(caption, frame)
    gallery.append(figure)
  }

  POPUPS.forEach((scenario, index) =>
    addFrame(document.getElementById('popups'), {
      title: scenario.title,
      className: 'popup-frame',
      srcdoc: popupDoc(index),
      measure: doc => doc.querySelector('main')?.getBoundingClientRect().height,
    }),
  )
  LAUNCHERS.forEach((scenario, index) =>
    addFrame(document.getElementById('launchers'), {
      title: scenario.title,
      className: 'launcher-frame',
      srcdoc: pageDoc(LAUNCHER_SCRIPTS, `launcher(window, ${index})`),
      measure: () => null,
    }),
  )
  PANELS.forEach((scenario, index) =>
    addFrame(document.getElementById('panels'), {
      title: scenario.title,
      className: 'panel-frame',
      srcdoc: pageDoc(PANEL_SCRIPTS, `panel(window, ${index})`),
      measure: doc => {
        const panel = doc.querySelector('janice-coupons-panel')?.shadowRoot?.querySelector('.panel')
        return panel && panel.scrollHeight + 2 + 32
      },
    }),
  )
})()
