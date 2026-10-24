// Runs on the Demo checkout fixture: the ACCEPTANCE.md fixture table, end to
// end through the real adapter, controller and provider. Results here are
// fixture (Demo) results; they say nothing about the live store.
const test = require('node:test')
const assert = require('node:assert/strict')

const { FAST, runOnDemo, waitUntil } = require('./helpers/demo.js')

const usd = (amountMinor, basis = { shippingIncluded: true, taxIncluded: true }) => ({ amountMinor, currency: 'USD', basis: 'order-total', ...basis })

function assertNeverTouchedPayment(demo) {
  assert.deepEqual(demo.record.forbidden, [], 'Pay now and contact fields were never touched')
}

test('$149.99: AFF15 rejected, unchanged $149.99, no savings', async () => {
  const { result, run, demo } = await runOnDemo({ spendMinor: 14999 })
  assert.equal(run.store.isDemo, true)
  assert.equal(result.kind, 'rejected')
  assert.equal(result.savingsMinor, undefined)
  assert.deepEqual(run.attempts, [{ code: 'AFF15', outcome: 'rejected', total: null, storeMessage: 'AFF15 requires a minimum purchase of $150.00.' }])
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(result.finalTotal, usd(14999))
  assertNeverTouchedPayment(demo)
})

test('$150.00: AFF15 accepted, total $135.00, $15 saved and left applied', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 15000 })
  assert.equal(result.kind, 'better')
  assert.equal(result.code, 'AFF15')
  assert.deepEqual(result.baselineTotal, usd(15000))
  assert.deepEqual(result.finalTotal, usd(13500))
  assert.equal(result.savingsMinor, 1500)
  assert.deepEqual(demo.state.codes, ['AFF15'])
  assertNeverTouchedPayment(demo)
})

test('$200.00: AFF15 accepted, total $185.00, $15 saved', async () => {
  const { result } = await runOnDemo({ spendMinor: 20000 })
  assert.equal(result.kind, 'better')
  assert.deepEqual(result.finalTotal, usd(18500))
  assert.equal(result.savingsMinor, 1500)
})

test('qualifying spend but explicit rejection: reported, baseline kept, no advertised savings claimed', async () => {
  const { result, run, demo } = await runOnDemo({ spendMinor: 20000, mode: 'reject-all' })
  assert.equal(result.kind, 'rejected')
  assert.equal(run.attempts[0].storeMessage, "AFF15 can't be used right now.")
  assert.deepEqual(result.finalTotal, usd(20000))
  assert.deepEqual(demo.state.codes, [])
})

test('$200 with an existing $20 code: $180 beats AFF15 $185, the original code is restored and checked', async () => {
  const { result, run, demo } = await runOnDemo({ spendMinor: 20000, existing: ['SAVE20'] })
  assert.deepEqual(run.baseline, { total: usd(18000), codes: ['SAVE20'] })
  assert.deepEqual(run.attempts.map(a => [a.code, a.outcome, a.total?.amountMinor]), [['AFF15', 'accepted', 18500]])
  assert.equal(result.kind, 'no-improvement')
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(result.codes, ['SAVE20'])
  assert.deepEqual(result.finalTotal, usd(18000))
  assert.deepEqual(demo.record.removes, ['SAVE20', 'AFF15'], 'the original was removed so AFF15 was tested alone, then AFF15 removed')
  assert.deepEqual(demo.record.applies, ['AFF15', 'SAVE20'])
  assert.deepEqual(demo.state.codes, ['SAVE20'])
})

test('an existing code with the same total is kept on the tie', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, existing: ['TAKE15'] })
  assert.equal(result.kind, 'no-improvement')
  assert.deepEqual(result.codes, ['TAKE15'])
  assert.deepEqual(result.finalTotal, usd(18500))
  assert.deepEqual(demo.state.codes, ['TAKE15'])
})

test('no candidates or a provider error: explained, and the coupon field is never touched', async () => {
  const empty = await runOnDemo({ spendMinor: 20000 }, { candidates: [] })
  assert.equal(empty.result.kind, 'no-candidates')
  assert.deepEqual(empty.demo.record.applies, [])

  const failed = await runOnDemo({ spendMinor: 20000 }, { providerError: 'the coupon data could not be read' })
  assert.equal(failed.result.kind, 'provider-error')
  assert.deepEqual(failed.demo.record.applies, [])
  assert.deepEqual(failed.demo.record.removes, [])
})

test('Stop while an application is pending: no further attempts, the update settles, then the original state is restored', async () => {
  const candidates = [{ code: 'AFF15' }, { code: 'TAKE15' }]
  const { result, run, demo, updates } = await runOnDemo(
    { spendMinor: 20000, delayMs: 120 },
    {
      candidates,
      during: async ({ controller, demo: page }) => {
        await waitUntil(() => page.state.busy) // AFF15 is with the store
        assert.equal(controller.stop(), true)
        assert.equal(controller.stop(), false, 'a second Stop is a no-op')
      },
    },
  )
  assert.equal(result.kind, 'stopped')
  assert.deepEqual(demo.record.applies, ['AFF15'], 'TAKE15 was never tried')
  assert.deepEqual(run.attempts.map(a => [a.code, a.outcome]), [['AFF15', 'accepted']], 'the pending update was awaited and recorded')
  assert.equal(result.restoration, 'verified')
  assert.deepEqual(demo.state.codes, [])
  assert.deepEqual(result.finalTotal, usd(20000))
  assert.ok(updates.some(update => update.status === 'stopping'))
})

test('the cart changes during testing: stop, discard comparisons, claim nothing, undo only our code', async () => {
  const { result, run, demo } = await runOnDemo({ spendMinor: 20000, failures: ['cart-change-on-apply'] })
  assert.equal(result.kind, 'cart-changed')
  assert.deepEqual(run.attempts, [], 'old-cart comparisons are discarded')
  assert.equal(result.savingsMinor, undefined)
  assert.deepEqual(demo.state.codes, [], 'AFF15, applied by the run, was removed')
  assert.equal(demo.state.quantity, 2, "the shopper's cart edit stands")
  assert.equal(result.restoration, 'verified')
})

test('a shopper editing the cart mid-run (another tab) stops the run the same way', async () => {
  const { result, demo } = await runOnDemo(
    { spendMinor: 20000, delayMs: 80 },
    { during: async ({ demo: page }) => (await waitUntil(() => page.state.busy), page.setQuantity(3)) },
  )
  assert.equal(result.kind, 'cart-changed')
  assert.equal(demo.state.quantity, 3)
  assert.deepEqual(demo.state.codes, [])
})

test('repeated starts make one run with one baseline', async () => {
  const { controller, run, demo } = await runOnDemo(
    { spendMinor: 20000 },
    {
      during: async ({ controller: running }) => {
        await running.start()
        await running.start()
      },
    },
  )
  assert.equal(run.result.kind, 'better')
  assert.deepEqual(demo.record.applies, ['AFF15'])
  assert.equal((await controller.start()).runId, run.runId, 'a finished run does not start again')
})

test('missing controls, an unreadable total, another currency or a gift card: unsupported, nothing changed', async () => {
  for (const [failures, reason] of [
    [['missing-controls'], 'no-discount-field'],
    [['unreadable-total'], 'unreadable-total'],
    [['non-usd'], 'currency'],
    [['gift-card'], 'unrestorable-reduction'],
  ]) {
    const { result, demo } = await runOnDemo({ spendMinor: 20000, failures })
    assert.equal(result.kind, 'unsupported', failures[0])
    assert.equal(result.reason, reason)
    assert.equal(result.restoration, 'not-needed')
    assert.deepEqual(demo.record.applies, [])
  }
})

test('more than one existing code is not replaced', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, existing: ['SAVE20', 'TAKE15'] })
  assert.equal(result.kind, 'unsupported')
  assert.equal(result.reason, 'multiple-codes')
  assert.deepEqual(demo.record.removes, [])
})

test('a checkout that never settles: unverified, and restoration is not claimed while it is still updating', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, failures: ['never-settle-apply'] })
  assert.equal(result.kind, 'unverified')
  assert.equal(result.reason, 'timeout')
  assert.equal(result.restoration, 'unverified')
  assert.equal(result.problem, 'checkout-busy')
  assert.equal(result.savingsMinor, undefined)
  assert.equal(demo.state.busy, true)
})

test('restoring the original code fails: reported as a failure with the state now shown', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, existing: ['SAVE20'], failures: ['restore-rejected'] })
  assert.equal(result.kind, 'error')
  assert.equal(result.reason, 'restore-failed')
  assert.equal(result.restoration, 'failed')
  assert.equal(result.problem, 'original-rejected')
  assert.deepEqual(result.codes, [])
  assert.deepEqual(result.finalTotal, usd(20000))
  assert.deepEqual(demo.state.codes, [])
})

test('a removal that never settles leaves restoration unverified', async () => {
  const { result } = await runOnDemo({ spendMinor: 20000, existing: ['SAVE20'], failures: ['remove-hangs'] })
  assert.equal(result.kind, 'unverified')
  assert.notEqual(result.restoration, 'verified')
})

test('a winning code the store drops afterwards is never reported as applied', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, dropAfterMs: 10, failures: ['drop-winner'] })
  assert.notEqual(result.kind, 'better')
  assert.equal(result.savingsMinor, undefined)
  assert.deepEqual(demo.state.codes, [])
})

test('a store limiting attempts stops the run as unverified', async () => {
  const { result } = await runOnDemo({ spendMinor: 20000, failures: ['blocked'] })
  assert.equal(result.kind, 'unverified')
  assert.equal(result.reason, 'blocked')
})

test('a code that is already applied is not tested again', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, existing: ['AFF15'] })
  assert.equal(result.kind, 'no-improvement')
  assert.equal(result.reason, 'already-applied')
  assert.deepEqual(demo.record.applies, [])
})

test('the narrow layout: the run opens the order summary itself', async () => {
  const { result, demo } = await runOnDemo({ spendMinor: 20000, layout: 'collapsed' })
  assert.equal(result.kind, 'better')
  assert.equal(demo.state.expanded, true)
})

test('shipping not yet calculated is carried into the compared basis', async () => {
  const { result } = await runOnDemo({ spendMinor: 20000, shipping: 'pending' })
  assert.equal(result.kind, 'better')
  assert.deepEqual(result.finalTotal, usd(18500, { shippingIncluded: false, taxIncluded: false }))
})

test('progress is reported step by step', async () => {
  const { updates } = await runOnDemo({ spendMinor: 20000, existing: ['SAVE20'] }, { timing: FAST })
  const phases = [...new Set(updates.map(update => update.phase).filter(Boolean))]
  assert.deepEqual(phases, ['checking', 'testing', 'restoring'])
  assert.ok(updates.some(update => /Removing SAVE20 so each code is compared on its own/.test(update.message)))
  assert.equal(updates.at(-1).status, 'done')
})
