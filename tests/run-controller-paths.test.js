// Decision paths of the run controller with a scripted in-memory store, for
// cases a page fixture cannot time reliably.
const test = require('node:test')
const assert = require('node:assert/strict')

require('../extension/shared/compare.js')
const { createRunController } = require('../extension/content/run-controller.js')

const STORE = { id: 'sharper-image-us', name: 'Sharper Image', currency: 'USD', isDemo: false }
const RULES = { AFF15: 1500, TAKE15: 1500, SAVE20: 2000, BIG30: 3000 }

function scriptedStore({ baseMinor = 20000, codes = [], onApply, onRemove, onRead } = {}) {
  const state = { codes: [...codes], cart: 'cart-1', page: 'checkout-1', shippingIncluded: false, extraMinor: 0, reads: 0 }
  const log = []
  const read = () => ({
    ok: true,
    pending: false,
    total: {
      amountMinor: baseMinor + state.extraMinor - state.codes.reduce((sum, code) => sum + (RULES[code] ?? 0), 0),
      currency: 'USD',
      basis: 'order-total',
      shippingIncluded: state.shippingIncluded,
      taxIncluded: false,
    },
    subtotalMinor: baseMinor,
    appliedCodes: [...state.codes],
    unrestorable: [],
    cartIdentity: state.cart,
    errorText: null,
    page: state.page,
  })
  const adapter = {
    detect: () => ({ supported: true }),
    prepare: async () => ({ ok: true }),
    readState: read,
    async readSettledState() {
      state.reads += 1
      return onRead?.(state, log) ?? read()
    },
    async applyCode(code) {
      log.push(`apply ${code}`)
      const forced = onApply?.(code, state, log)
      if (forced) return { ...forced, state: read() }
      if (!(code in RULES)) return { status: 'rejected', message: 'Enter a valid discount code or gift card', state: read() }
      state.codes.push(code)
      return { status: 'accepted', message: `Discount code ${code} has been applied`, state: read() }
    },
    async removeCode(code) {
      log.push(`remove ${code}`)
      state.codes = state.codes.filter(applied => applied !== code)
      onRemove?.(code, state, log)
      return { status: 'removed', state: read() }
    },
  }
  return { adapter, state, log }
}

const run = (adapter, codes, options = {}) =>
  createRunController({ adapter, store: STORE, candidates: codes.map(code => ({ code })), ...options })

test('the best of several candidates is kept, re-applied after a later candidate replaced it', async () => {
  const { adapter, log, state } = scriptedStore()
  const { result } = await run(adapter, ['BIG30', 'AFF15']).start()

  assert.equal(result.kind, 'better')
  assert.equal(result.code, 'BIG30')
  assert.equal(result.savingsMinor, 3000)
  assert.deepEqual(log, ['apply BIG30', 'remove BIG30', 'apply AFF15', 'remove AFF15', 'apply BIG30'])
  assert.deepEqual(state.codes, ['BIG30'])
})

test('a winner the store refuses to re-apply is an error, and the original state is put back', async () => {
  let applied = 0
  const { adapter, state } = scriptedStore({
    onApply: code => (code === 'BIG30' && ++applied === 2 ? { status: 'rejected', message: 'This code has expired' } : null),
  })
  const { result } = await run(adapter, ['BIG30', 'AFF15']).start()

  assert.equal(result.kind, 'error')
  assert.equal(result.reason, 'winner-reapply-failed')
  assert.equal(result.storeMessage, 'This code has expired')
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(state.codes, [])
})

test('a winner that vanishes before the final check is never reported as applied', async () => {
  let finalizing = false
  let readsSince = 0
  const store = scriptedStore({
    onRead: state => {
      if (finalizing && ++readsSince === 2) state.codes = [] // gone between the two final reads
      return undefined
    },
  })
  const controller = run(store.adapter, ['AFF15'], { onUpdate: snapshot => (finalizing ||= snapshot.phase === 'finalizing') })
  const { result } = await controller.start()

  assert.equal(result.kind, 'error')
  assert.equal(result.reason, 'winner-verify-failed')
  assert.equal(result.savingsMinor, undefined)
  assert.equal(result.restoration, 'verified')
})

test('codes changed by someone else mid-run: stop and leave every code as it is', async () => {
  const { adapter, state, log } = scriptedStore({
    onRead: (current, entries) => {
      if (entries.length === 1 && !current.codes.includes('SHOPPER10')) current.codes.push('SHOPPER10')
      return undefined
    },
  })
  const { result, attempts } = await run(adapter, ['AFF15', 'TAKE15']).start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(attempts.map(a => a.code), ['AFF15'])
  assert.deepEqual(log, ['apply AFF15'], 'nothing was removed or applied after the change')
  assert.deepEqual(state.codes, ['AFF15', 'SHOPPER10'])
})

test('a different checkout page mid-run interrupts without touching it', async () => {
  const { adapter, log } = scriptedStore({
    onRead: (current, entries) => {
      if (entries.length === 1) current.page = 'checkout-2'
      return undefined
    },
  })
  const { result } = await run(adapter, ['AFF15', 'TAKE15']).start()

  assert.equal(result.kind, 'interrupted')
  assert.equal(result.restoration, 'unverified')
  assert.deepEqual(log, ['apply AFF15'])
})

test('a shopper code added while an application is pending is never removed by the next attempt', async () => {
  const { adapter, state, log } = scriptedStore({
    onApply: (code, current) => {
      current.codes.push(code, 'SHOPPER10')
      return { status: 'accepted' }
    },
  })
  const { result } = await run(adapter, ['AFF15', 'BIG30']).start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['apply AFF15'])
  assert.deepEqual(state.codes, ['AFF15', 'SHOPPER10'])
})

test('a shopper code added while the original code is being removed stops further mutations', async () => {
  const { adapter, state, log } = scriptedStore({
    codes: ['SAVE20'],
    onRemove: (_code, current) => current.codes.push('SHOPPER10'),
  })
  const { result } = await run(adapter, ['AFF15', 'BIG30']).start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['remove SAVE20'])
  assert.deepEqual(state.codes, ['SHOPPER10'])
})

test('restoration preserves a shopper code added after the last attempt', async () => {
  const { adapter, state, log } = scriptedStore({ codes: ['SAVE20'] })
  const controller = run(adapter, ['AFF15'], {
    onUpdate: snapshot => {
      if (snapshot.phase === 'restoring') state.codes.push('SHOPPER10')
    },
  })
  const { result } = await controller.start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['remove SAVE20', 'apply AFF15'])
  assert.deepEqual(state.codes, ['AFF15', 'SHOPPER10'])
})

test('restoration stops if a shopper code appears while removing our test code', async () => {
  const { adapter, state, log } = scriptedStore({
    codes: ['SAVE20'],
    onRemove: (code, current) => {
      if (code === 'AFF15') current.codes.push('SHOPPER10')
    },
  })
  const { result } = await run(adapter, ['AFF15']).start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['remove SAVE20', 'apply AFF15', 'remove AFF15'])
  assert.deepEqual(state.codes, ['SHOPPER10'])
})

test('restoration reports a shopper edit during reapplication of the original code', async () => {
  const { adapter, state, log } = scriptedStore({
    codes: ['SAVE20'],
    onApply: (code, current) => {
      if (code !== 'SAVE20') return null
      current.codes.push(code, 'SHOPPER10')
      return { status: 'accepted' }
    },
  })
  const { result } = await run(adapter, ['AFF15']).start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['remove SAVE20', 'apply AFF15', 'remove AFF15', 'apply SAVE20'])
  assert.deepEqual(state.codes, ['SAVE20', 'SHOPPER10'])
})

test('a previously tested code applied by the shopper is not mistaken for a code still owned by the run', async () => {
  const { adapter, state, log } = scriptedStore({ codes: ['SAVE20'] })
  const controller = run(adapter, ['AFF15', 'INVALID'], {
    onUpdate: snapshot => {
      if (snapshot.phase === 'restoring') state.codes.push('AFF15')
    },
  })
  const { result } = await controller.start()

  assert.equal(result.kind, 'cart-changed')
  assert.equal(result.reason, 'codes-changed')
  assert.equal(result.restoration, 'skipped')
  assert.deepEqual(log, ['remove SAVE20', 'apply AFF15', 'remove AFF15', 'apply INVALID'])
  assert.deepEqual(state.codes, ['AFF15'])
})

test('the whole run is bounded in time', async () => {
  let clock = 0
  const { adapter, state } = scriptedStore({ onApply: () => ((clock += 5000), null) })
  const { result } = await run(adapter, ['AFF15', 'TAKE15'], { now: () => clock, runDeadlineMs: 3000 }).start()

  assert.equal(result.kind, 'unverified')
  assert.equal(result.reason, 'run-timeout')
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(state.codes, [])
})

test('Stop before anything was tried changes nothing', async () => {
  const { adapter, log } = scriptedStore()
  const controller = run(adapter, ['AFF15'])
  const finished = controller.start()
  assert.equal(controller.stop(), true)
  const { result } = await finished

  assert.equal(result.kind, 'stopped')
  assert.equal(result.restoration, 'not-needed')
  assert.deepEqual(log, [])
})

test('a checkout still updating at the start is unverified, and nothing is tried', async () => {
  const { adapter, log } = scriptedStore({ onRead: () => ({ ok: false, reason: 'checkout-busy', pending: true }) })
  const { result } = await run(adapter, ['AFF15']).start()
  assert.equal(result.kind, 'unverified')
  assert.equal(result.reason, 'checkout-busy')
  assert.deepEqual(log, [])
})

test('an accepted code on a different basis (shipping appeared) is not compared', async () => {
  const { adapter, state } = scriptedStore({
    onApply: (code, current) => {
      current.codes.push(code)
      current.shippingIncluded = true
      return { status: 'accepted' }
    },
  })
  const { result } = await run(adapter, ['AFF15']).start()
  assert.equal(result.kind, 'error', 'restoring cannot match a baseline measured without shipping')
  assert.notEqual(result.restoration, 'verified')
  assert.equal(result.savingsMinor, undefined)
  assert.deepEqual(state.codes, [])
})

test('an improvement that does not hold up on re-reading keeps the original', async () => {
  let finalizing = false
  const { adapter, state } = scriptedStore({
    onRead: current => {
      if (finalizing && current.codes.includes('AFF15')) current.extraMinor = 1500 // the store re-priced
      if (!current.codes.includes('AFF15')) current.extraMinor = 0
      return undefined
    },
  })
  const controller = run(adapter, ['AFF15'], { onUpdate: snapshot => (finalizing ||= snapshot.phase === 'finalizing') })
  const { result } = await controller.start()

  assert.equal(result.kind, 'no-improvement')
  assert.equal(result.reason, 'improvement-not-confirmed')
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(state.codes, [])
})
