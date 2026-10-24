/*
 * One coupon run on one checkout page, independent of any store: capture a
 * baseline, test candidates one at a time, keep the best verified result,
 * and otherwise put the shopper's original coupon state back.
 *
 * The adapter does the store-specific reading and clicking; this module
 * decides. It only undoes its own changes (codes it applied, original codes
 * it removed), so a shopper's own edits during a run are never overridden.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') require('../shared/compare.js')

  const Janice = root.Janice || (root.Janice = {})

  const BLOCKED_MESSAGE = /too many|try again later|attempt limit|rate limit/i

  // Ends a run early with a result kind and the reason for it.
  class Halt extends Error {
    constructor(kind, reason, extra = {}) {
      super(reason)
      this.name = 'Halt'
      this.kind = kind
      this.reason = reason
      this.extra = extra
    }
  }

  /**
   * @param options.adapter     store adapter (see adapters/sharper-image.js)
   * @param options.store       { id, name, currency, isDemo }
   * @param options.candidates  provider candidates, tested in order
   * @param options.onUpdate    receives a plain snapshot after every change
   */
  function createRunController({
    adapter,
    store,
    surface = 'checkout',
    candidates = [],
    providerError = null,
    onUpdate = () => {},
    now = () => Date.now(),
    runDeadlineMs = 120000,
    runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  }) {
    const { sameCode, sameCodes, isComparable, chooseBest } = Janice.compare

    const run = {
      runId,
      surface,
      store: { id: store.id, name: store.name, isDemo: Boolean(store.isDemo) },
      status: 'idle',
      phase: null,
      message: '',
      progress: null,
      baseline: null,
      attempts: [],
      result: null,
      startedAt: null,
      updatedAt: null,
    }

    let stopRequested = false
    let baseline = null
    let expectedCodes = []
    let hasMutated = false
    let deadline = Infinity
    // A timed-out operation may still settle into either of these states.
    // Previously tried codes are not automatically ours to remove later:
    // the shopper may have deliberately applied one in the meantime.
    let pendingMutation = null
    // Candidate codes this run tried to apply: if one shows up applied, it is ours to remove,
    // even when the store applied it after the adapter stopped waiting.
    const attemptedByUs = []
    // Original codes this run removed and has not put back yet.
    const removedByUs = []

    const snapshot = () => JSON.parse(JSON.stringify(run))
    const isActive = () => run.status === 'running' || run.status === 'stopping'
    const holds = (codes, code) => codes.some(other => sameCode(other, code))
    const seen = state => (state?.ok ? { codes: [...state.appliedCodes], finalTotal: state.total } : {})

    function emit(patch) {
      Object.assign(run, patch, { updatedAt: now() })
      onUpdate(snapshot())
    }

    async function start() {
      if (run.status !== 'idle') return snapshot()
      deadline = now() + runDeadlineMs
      emit({ status: 'running', phase: 'checking', startedAt: now(), message: surface === 'cart-drawer' ? 'Reading your cart…' : 'Reading your checkout…' })

      let result
      try {
        result = await execute()
      } catch (error) {
        result = await recover(error)
      }
      if (result.problem === 'codes-changed') {
        result = { ...result, kind: 'cart-changed', reason: 'codes-changed' }
      }
      if (typeof adapter.restoreDraft === 'function') {
        try { result.draftRestoration = await adapter.restoreDraft() } catch { result.draftRestoration = { ok: false, reason: 'unexpected' } }
      }
      emit({ status: 'done', phase: null, progress: null, message: '', result })
      return snapshot()
    }

    /** Asks the run to stop after the checkout update in flight settles. */
    function stop() {
      if (!isActive() || stopRequested) return false
      stopRequested = true
      emit({ status: 'stopping' })
      return true
    }

    async function execute() {
      if (providerError) return { kind: 'provider-error', detail: providerError, restoration: 'not-needed' }
      if (candidates.length === 0) return { kind: 'no-candidates', restoration: 'not-needed' }

      const prepared = await adapter.prepare()
      if (!prepared.ok) return { kind: 'unsupported', reason: prepared.reason, restoration: 'not-needed' }

      const first = await adapter.readSettledState()
      if (!first.ok) {
        return { kind: first.reason === 'checkout-busy' ? 'unverified' : 'unsupported', reason: first.reason, restoration: 'not-needed' }
      }
      if (first.total.currency !== store.currency) {
        return { kind: 'unsupported', reason: 'currency', detail: first.total.currency, restoration: 'not-needed' }
      }
      if (first.unrestorable.length > 0) return { kind: 'unsupported', reason: 'unrestorable-reduction', restoration: 'not-needed' }
      if (first.appliedCodes.length > 1) return { kind: 'unsupported', reason: 'multiple-codes', restoration: 'not-needed' }

      baseline = first
      expectedCodes = [...first.appliedCodes]
      emit({ baseline: { total: first.total, codes: [...first.appliedCodes] } })

      const queue = candidates.filter(candidate => !holds(first.appliedCodes, candidate.code))
      if (queue.length === 0) {
        return { kind: 'no-improvement', reason: 'already-applied', ...seen(first), restoration: 'not-needed' }
      }

      for (const [index, candidate] of queue.entries()) {
        if (stopRequested) break
        emit({
          phase: 'testing',
          progress: { index: index + 1, count: queue.length, code: candidate.code },
          message: `Trying ${candidate.code} (${index + 1} of ${queue.length})…`,
        })
        await clearCodes()
        if (stopRequested) break

        const outcome = await applyCandidate(candidate.code)
        record(candidate.code, outcome)
        if (stopRequested) break
        if (outcome.status === 'unsupported') throw new Halt('unsupported', outcome.reason)
        if (outcome.status === 'unverified') throw new Halt('unverified', outcome.reason ?? 'timeout')
        if (outcome.status === 'rejected' && BLOCKED_MESSAGE.test(outcome.message ?? '')) throw new Halt('unverified', 'blocked')
      }

      if (stopRequested) return { kind: 'stopped', ...(await restore()) }

      const best = chooseBest(baseline.total, run.attempts)
      if (best.source === 'candidate') return keepWinner(best)

      const restoration = await restore()
      if (restoration.restoration !== 'verified' && restoration.restoration !== 'not-needed') {
        return { kind: 'error', reason: 'restore-failed', ...restoration }
      }
      const accepted = run.attempts.filter(attempt => attempt.outcome === 'accepted')
      if (accepted.some(attempt => !isComparable(baseline.total, attempt.total))) {
        return { kind: 'unverified', reason: 'not-comparable', ...restoration }
      }
      return { kind: accepted.length > 0 ? 'no-improvement' : 'rejected', ...restoration }
    }

    function applyCandidate(code) {
      if (!holds(attemptedByUs, code)) attemptedByUs.push(code)
      return mutate(() => adapter.applyCode(code, { isCancelled: () => stopRequested }), { kind: 'apply', code })
    }

    function record(code, outcome) {
      if (outcome.status === 'accepted') expectedCodes = [...outcome.state.appliedCodes]
      const attempt = {
        code,
        outcome: outcome.status === 'accepted' || outcome.status === 'rejected' ? outcome.status : 'unverified',
        total: outcome.status === 'accepted' && outcome.state.ok ? outcome.state.total : null,
        storeMessage: outcome.message ?? null,
      }
      emit({ attempts: [...run.attempts, attempt] })
    }

    // Runs one checkout mutation, refusing to act on a checkout that changed underneath the run.
    function possibleCodes(beforeCodes, { kind, code }) {
      return kind === 'remove'
        ? beforeCodes.filter(applied => !sameCode(applied, code))
        : holds(beforeCodes, code) ? [...beforeCodes] : [...beforeCodes, code]
    }

    function isExpectedState(state) {
      return sameCodes(state.appliedCodes, expectedCodes) ||
        Boolean(pendingMutation && (
          sameCodes(state.appliedCodes, pendingMutation.before) ||
          sameCodes(state.appliedCodes, pendingMutation.after)
        ))
    }

    async function mutate(operation, change) {
      if (now() > deadline) throw new Halt('unverified', 'run-timeout')
      const before = await adapter.readSettledState()
      if (!before.ok) throw new Halt('unverified', before.reason)
      if (before.page !== baseline.page) throw new Halt('interrupted', 'page-changed')
      if (before.cartIdentity !== baseline.cartIdentity) throw new Halt('cart-changed', 'cart-changed')
      if (!sameCodes(before.appliedCodes, expectedCodes)) throw new Halt('cart-changed', 'codes-changed')

      hasMutated = true
      pendingMutation = { before: [...before.appliedCodes], after: possibleCodes(before.appliedCodes, change) }
      const outcome = await operation()
      const after = outcome.state ?? adapter.readState()
      if (after.ok && after.page !== baseline.page) throw new Halt('interrupted', 'page-changed')
      if (after.ok && after.cartIdentity !== baseline.cartIdentity) throw new Halt('cart-changed', 'cart-changed')
      if (after.ok && !isExpectedState(after)) throw new Halt('cart-changed', 'codes-changed')
      if (after.ok) expectedCodes = [...after.appliedCodes]
      if (!after.pending && outcome.status !== 'unverified') pendingMutation = null
      return { ...outcome, state: after }
    }

    function noteRemoved(code) {
      if (holds(baseline.appliedCodes, code) && !holds(removedByUs, code)) removedByUs.push(code)
    }

    // Removes the codes applied now, so the next candidate is tested on its own.
    async function clearCodes() {
      for (const code of [...expectedCodes]) {
        emit({ message: `Removing ${code} so each code is compared on its own…` })
        const outcome = await mutate(() => adapter.removeCode(code), { kind: 'remove', code })
        if (outcome.status !== 'removed') {
          throw new Halt(outcome.status === 'unverified' ? 'unverified' : 'error', outcome.reason ?? 'remove-failed')
        }
        noteRemoved(code)
        expectedCodes = [...outcome.state.appliedCodes]
      }
    }

    // Leaves the winning code applied, re-applying it if a later candidate replaced it, then checks it.
    async function keepWinner(best) {
      emit({ phase: 'finalizing', progress: null, message: `Confirming ${best.code} is applied…` })
      const isOnlyWinner = state => state.ok && state.appliedCodes.length === 1 && sameCode(state.appliedCodes[0], best.code)

      if (!isOnlyWinner(await adapter.readSettledState())) {
        if (stopRequested) return { kind: 'stopped', ...(await restore()) }
        await clearCodes()
        const outcome = await applyCandidate(best.code)
        if (outcome.status !== 'accepted') {
          return { kind: 'error', reason: 'winner-reapply-failed', code: best.code, storeMessage: outcome.message ?? null, ...(await restore()) }
        }
        expectedCodes = [...outcome.state.appliedCodes]
      }
      if (stopRequested) return { kind: 'stopped', ...(await restore()) }

      const verified = await adapter.readSettledState()
      if (verified.ok && verified.cartIdentity !== baseline.cartIdentity) throw new Halt('cart-changed', 'cart-changed')
      if (!isOnlyWinner(verified) || !isComparable(baseline.total, verified.total)) {
        return { kind: 'error', reason: 'winner-verify-failed', code: best.code, ...(await restore()) }
      }
      if (verified.total.amountMinor >= baseline.total.amountMinor) {
        const restoration = await restore()
        return {
          kind: restoration.restoration === 'verified' ? 'no-improvement' : 'error',
          reason: 'improvement-not-confirmed',
          ...restoration,
        }
      }
      return {
        kind: 'better',
        code: best.code,
        codes: [...verified.appliedCodes],
        baselineTotal: baseline.total,
        finalTotal: verified.total,
        savingsMinor: baseline.total.amountMinor - verified.total.amountMinor,
        restoration: 'not-needed',
      }
    }

    // Undoes this run's own changes and checks the result against the baseline.
    async function restore({ verifyTotal = true } = {}) {
      if (!baseline) return { restoration: 'not-needed' }
      if (!hasMutated) return { restoration: 'not-needed', ...seen(baseline) }
      emit({ phase: 'restoring', progress: null, message: 'Putting your original coupon state back…' })

      try {
        // Restoration also awaits store requests. Check ownership before and
        // after each one so a concurrent shopper edit is never overwritten.
        async function readOwnedState() {
          const current = await adapter.readSettledState()
          if (current.ok && current.page !== baseline.page) throw new Halt('interrupted', 'page-changed')
          if (current.ok && !isExpectedState(current) && !sameCodes(current.appliedCodes, baseline.appliedCodes)) {
            throw new Halt('cart-changed', 'codes-changed')
          }
          if (current.ok) {
            expectedCodes = [...current.appliedCodes]
            pendingMutation = null
          }
          return current
        }

        async function restoreMutation(operation, change) {
          const before = await readOwnedState()
          if (!before.ok) return { status: 'unverified', reason: before.reason, state: before }
          pendingMutation = { before: [...before.appliedCodes], after: possibleCodes(before.appliedCodes, change) }
          const outcome = await operation()
          const after = outcome.state ?? adapter.readState()
          if (after.ok && after.page !== baseline.page) throw new Halt('interrupted', 'page-changed')
          if (after.ok && !isExpectedState(after) && !sameCodes(after.appliedCodes, baseline.appliedCodes)) {
            throw new Halt('cart-changed', 'codes-changed')
          }
          if (after.ok) expectedCodes = [...after.appliedCodes]
          if (!after.pending && outcome.status !== 'unverified') pendingMutation = null
          return { ...outcome, state: after }
        }

        let state = await readOwnedState()
        if (!state.ok) return { restoration: 'unverified', problem: state.reason }

        const ours = state.appliedCodes.filter(code => holds(attemptedByUs, code) && !holds(baseline.appliedCodes, code))
        for (const code of ours) {
          const outcome = await restoreMutation(() => adapter.removeCode(code), { kind: 'remove', code })
          if (outcome.status !== 'removed') {
            return { restoration: outcome.status === 'unverified' ? 'unverified' : 'failed', problem: outcome.reason ?? 'remove-failed', ...seen(outcome.state) }
          }
          noteRemoved(code)
          state = outcome.state
        }

        for (const code of [...removedByUs]) {
          if (!holds(state.appliedCodes, code)) {
            const outcome = await restoreMutation(() => adapter.applyCode(code), { kind: 'apply', code })
            if (outcome.status !== 'accepted') {
              return {
                restoration: outcome.status === 'unverified' ? 'unverified' : 'failed',
                problem: outcome.status === 'rejected' ? 'original-rejected' : outcome.reason ?? 'restore-failed',
                storeMessage: outcome.message ?? null,
                ...seen(outcome.state),
              }
            }
            state = outcome.state
          }
          removedByUs.splice(removedByUs.findIndex(removed => sameCode(removed, code)), 1)
        }

        const final = await readOwnedState()
        if (!final.ok) return { restoration: 'unverified', problem: final.reason }
        const codesMatch = sameCodes(final.appliedCodes, baseline.appliedCodes)
        const totalMatches =
          !verifyTotal || (isComparable(final.total, baseline.total) && final.total.amountMinor === baseline.total.amountMinor)
        if (codesMatch && totalMatches) return { restoration: 'verified', ...seen(final) }
        return { restoration: 'unverified', problem: codesMatch ? 'total-differs' : 'codes-differ', ...seen(final) }
      } catch (error) {
        if (error.reason === 'codes-changed') {
          return { restoration: 'skipped', problem: 'codes-changed', ...seen(adapter.readState()) }
        }
        if (error.reason === 'page-changed') return { restoration: 'unverified', problem: 'page-changed' }
        return { restoration: 'failed', problem: error.reason ?? 'unexpected', detail: String(error?.message ?? error) }
      }
    }

    async function recover(error) {
      const halt =
        error instanceof Halt ? error : new Halt('error', error?.reason ?? 'unexpected', { detail: String(error?.message ?? error) })

      // A different page: nothing here may be touched any more.
      if (halt.kind === 'interrupted') return { kind: 'interrupted', reason: halt.reason, restoration: 'unverified' }
      // Someone else changed the codes: leave them as they are.
      if (halt.reason === 'codes-changed') {
        return { kind: 'cart-changed', reason: 'codes-changed', restoration: 'skipped', ...seen(adapter.readState()) }
      }
      // A changed cart voids every comparison made so far.
      if (halt.kind === 'cart-changed') emit({ attempts: [] })

      const restoration = await restore({ verifyTotal: halt.kind !== 'cart-changed' })
      return { kind: halt.kind, reason: halt.reason, ...halt.extra, ...restoration }
    }

    return { start, stop, isActive, getState: snapshot }
  }

  Janice.createRunController = createRunController

  if (typeof module === 'object' && module.exports) module.exports = { createRunController }
})(typeof globalThis === 'object' ? globalThis : this)
