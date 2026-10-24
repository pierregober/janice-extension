const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Exercise the actual message boundary: validate before janice:start can
// reach the page, independently of either UI's client-side validation.
function worker({ host = 'sharperimage.com', supported = true, page = 'checkout', surface = 'checkout' } = {}) {
  let listener
  const starts = []
  const writes = []
  const context = vm.createContext({ URL, console, fetch: async () => ({
    ok: true,
    json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/data/mock-coupons.json'), 'utf8')),
  }) })
  const noop = { addListener() {} }
  let settingsOpened = 0
  context.chrome = {
    runtime: { id: 'janice-test', getURL: file => `chrome-extension://janice-test/${file}`, onMessage: { addListener: fn => { listener = fn } }, onInstalled: noop, openOptionsPage: async () => { settingsOpened++ } },
    tabs: {
      get: async () => ({ url: `https://${host}/checkouts/cn/test/en-us` }),
      sendMessage: async (tabId, message) => {
        if (message.type === 'janice:ping') return { ok: true }
        if (message.type === 'janice:detect') return { store: { id: 'sharper-image-us', page }, surface, supported, run: null }
        if (message.type === 'janice:start') { starts.push(JSON.parse(JSON.stringify(message))); return { ok: true } }
      },
      onUpdated: noop, onRemoved: noop,
    },
    storage: { session: { get: async () => ({}), set: async value => writes.push(value), remove: async () => {} } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    scripting: { executeScript: async () => { throw new Error('content was already present') } },
  }
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8'), context))
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/service-worker.js'), 'utf8'), context)
  return {
    starts, writes, settingsOpened: () => settingsOpened,
    ask: message => new Promise(resolve => listener({ type: 'janice:try', tabId: 7, ...message }, { id: 'janice-test', url: 'chrome-extension://janice-test/popup/popup.html' }, resolve)),
  }
}

test('worker merges provider and shopper codes, removes duplicates, and never stores the raw draft', async () => {
  const app = worker()
  assert.equal((await app.ask({ additionalCodes: 'aff15, SAVE20\nSAVE20;NOPE' })).ok, true)
  assert.deepEqual(app.starts[0].candidates.map(candidate => candidate.code), ['AFF15', 'SAVE20', 'NOPE'])
  assert.equal(app.starts[0].candidates[1].source.kind, 'shopper-entered')
  assert.equal(app.starts[0].candidates[1].advertisedDiscount, undefined)
  assert.deepEqual(app.writes, [])
})

test('worker refuses invalid or oversized batches before starting checkout work', async () => {
  for (const additionalCodes of ['<script>', 'X'.repeat(65), Array.from({ length: 20 }, (_, i) => `CODE${i}`).join(','), { code: 'SAVE20' }]) {
    const app = worker()
    const reply = await app.ask({ additionalCodes })
    assert.equal(reply.ok, false)
    assert.equal(reply.reason, 'invalid-codes')
    assert.equal(app.starts.length, 0)
  }
})

test('worker never starts a batch on unrelated origins', async () => {
  const app = worker({ host: 'example.com' })
  assert.equal((await app.ask({ additionalCodes: 'SAVE20' })).reason, 'not-checkout')
  assert.equal(app.starts.length, 0)
})

test('finding a field alone does not authorize a batch on an unsupported layout', async () => {
  const app = worker({ supported: false })
  assert.equal((await app.ask({ additionalCodes: 'SAVE20' })).reason, 'unsupported-checkout')
  assert.equal(app.starts.length, 0)
})

test('verified cart-drawer capability starts the same batch runner on a store page', async () => {
  const app = worker({ page: 'store', surface: 'cart-drawer' })
  assert.equal((await app.ask({ additionalCodes: 'INVALID' })).ok, true)
  assert.deepEqual(app.starts[0].candidates.map(candidate => candidate.code), ['AFF15', 'INVALID'])
})

test('Go to settings in the page button opens the settings page for it: a content script cannot open it', async () => {
  const app = worker()
  assert.equal((await app.ask({ type: 'janice:open-settings' })).ok, true)
  assert.equal(app.settingsOpened(), 1)
  assert.equal(app.starts.length, 0)
})
