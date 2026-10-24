// Loads the Demo checkout fixture and the extension's own content scripts
// into a jsdom window, the way the service worker injects them into a tab.
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const ROOT = path.join(__dirname, '..', '..')
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8')

const CONTENT_SCRIPTS = JSON.parse(
  /CONTENT_SCRIPTS = (\[[\s\S]*?\])/.exec(read('extension/service-worker.js'))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
).filter(file => file !== 'content/main.js')

// Fast timings: the fixture answers in 30 ms instead of the live ~800 ms.
const FAST = { pollMs: 5, settleMs: 40, timeoutMs: 800, enableMs: 300, expandMs: 300 }

function loadScripts(window, files) {
  for (const file of files) window.eval(read(path.join('extension', file)))
}

// Values made inside a jsdom window belong to its realm; strict deepEqual
// wants Node's, so assertions compare plain copies.
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

// The fixture's state and record as plain copies, read at each access.
function demoView(window) {
  return {
    get record() {
      return plain(window.JaniceDemo.record)
    },
    get state() {
      return plain(window.JaniceDemo.state)
    },
    setQuantity: quantity => window.JaniceDemo.setQuantity(quantity),
  }
}

/** A Demo checkout in jsdom with the content scripts loaded (not main.js), after any preload scripts. */
function createDemoCheckout(config = {}, { url = 'http://localhost:4300/demo-checkout/', preload = [] } = {}) {
  const html = read('fixtures/demo-checkout/index.html').replace('<script src="demo-checkout.js"></script>', '')
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true })
  const { window } = dom
  window.JANICE_DEMO_CONFIG = { delayMs: 30, rollerLagMs: 20, dropAfterMs: 60, ...config }
  window.eval(read('fixtures/demo-checkout/demo-checkout.js'))
  loadScripts(window, [...preload, ...CONTENT_SCRIPTS])
  return { dom, window, demo: demoView(window), Janice: window.Janice }
}

/** A page holding captured live markup, at a live checkout URL. */
function createLivePage(fixture) {
  const dom = new JSDOM(`<!doctype html><html lang="en-US"><body><aside>${read(path.join('tests', 'fixtures', fixture))}</aside></body></html>`, {
    url: 'https://sharperimage.com/checkouts/cn/TESTTOKEN/en-us',
    runScripts: 'outside-only',
  })
  loadScripts(dom.window, CONTENT_SCRIPTS)
  return { dom, window: dom.window, Janice: dom.window.Janice }
}

/** The real AFF15 candidate, through the local provider and the bundled dataset. */
async function aff15Candidates() {
  const { createLocalMockProvider } = require('../../extension/providers/local-mock-provider.js')
  const provider = createLocalMockProvider({ loadDataset: () => JSON.parse(read('extension/data/mock-coupons.json')) })
  return provider.getCandidates('sharper-image-us')
}

/** Runs one controller over a Demo checkout and resolves with its final snapshot. */
async function runOnDemo(config, { candidates, providerError = null, timing = FAST, during } = {}) {
  const checkout = createDemoCheckout(config)
  const { window, Janice } = checkout
  const store = { ...Janice.stores.detect(window.location, window.document) }
  const adapter = Janice.createSharperImageAdapter({ window, timing, isDemo: true })
  const updates = []
  const controller = Janice.createRunController({
    adapter,
    store,
    candidates: candidates ?? (await aff15Candidates()),
    providerError,
    onUpdate: run => updates.push(run),
  })
  const finished = controller.start()
  if (during) await during({ ...checkout, controller, updates })
  const run = plain(await finished)
  return { ...checkout, controller, run, result: run.result, updates: plain(updates) }
}

const waitUntil = async (check, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise(resolve => setTimeout(resolve, 2))
  }
}

module.exports = { ROOT, read, plain, FAST, CONTENT_SCRIPTS, createDemoCheckout, createLivePage, aff15Candidates, runOnDemo, waitUntil, loadScripts }
