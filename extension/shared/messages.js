/*
 * Shopper-facing wording for run states, shared by the checkout panel and
 * the toolbar popup so both say the same thing.
 */
;(function (root) {
  'use strict'

  if (typeof module === 'object' && typeof require === 'function') require('./money.js')

  const Janice = root.Janice || (root.Janice = {})

  const REASONS = {
    'not-checkout': 'Open the Sharper Image checkout page to try coupons.',
    'no-discount-field': "The checkout's discount code field wasn't found.",
    'discount-field-hidden': 'The discount code field is hidden. Open the order summary and try again.',
    'no-order-summary': "The checkout's order summary wasn't found.",
    'no-total': "The order total couldn't be found.",
    'unreadable-total': "The order total couldn't be read.",
    'unreadable-currency': "The checkout's currency couldn't be confirmed.",
    currency: 'The checkout shows a currency other than USD; this version only compares USD totals.',
    'unrestorable-reduction':
      "A gift card or another reduction is applied that Janice can't safely put back.",
    'multiple-codes': 'More than one discount code is applied; this version can only put back one.',
    'checkout-busy': 'The checkout was still updating.',
    timeout: "The checkout didn't finish updating in time.",
    'apply-disabled': "The checkout's Apply button wasn't available.",
    'no-remove-button': "The checkout's Remove button wasn't found.",
    'remove-failed': "A discount code couldn't be removed.",
    blocked: 'The store is limiting coupon attempts right now.',
    'page-changed': 'The checkout page changed during testing.',
    'not-comparable': 'The checkout started including shipping or taxes during testing, so totals could not be compared.',
    'codes-changed': 'The discount codes changed outside Janice during testing.',
    'cart-changed': 'Your cart changed during testing.',
    'winner-reapply-failed': "The best code couldn't be applied again.",
    'winner-verify-failed': "The best code couldn't be confirmed in the checkout.",
    'improvement-not-confirmed': "The lower total didn't hold up when the checkout was read again.",
    'restore-failed': "Your original coupon state couldn't be put back.",
    'original-rejected': 'The store did not accept your original code again.',
    'total-differs': 'The codes match, but the total differs from before testing.',
    'codes-differ': "The discount codes don't match what was applied before testing.",
    'run-timeout': 'Testing took too long and was stopped.',
    'refused-unsafe-control': 'Janice refused to press a control that could affect payment.',
    unexpected: 'An unexpected error occurred.',
  }

  // Why a Try coupons request did not start a run.
  const START_REFUSALS = {
    'already-running': 'A run is already in progress on this tab.',
    'already-starting': 'A run is already starting on this tab.',
    'not-checkout': 'Open the Sharper Image checkout page to try coupons.',
  }

  const PHASES = {
    checking: 'Getting ready',
    testing: 'Testing coupons',
    finalizing: 'Confirming the best code',
    restoring: 'Putting things back',
  }

  function amount(total) {
    return total ? Janice.money.formatAmount(total.amountMinor, total.currency) : 'unknown'
  }

  function codeList(codes) {
    return codes && codes.length ? codes.join(', ') : 'no code'
  }

  function reasonText(reason, fallback = REASONS.unexpected) {
    return REASONS[reason] || fallback
  }

  /** Why a start request was refused, from the service worker's reply. */
  function refusalText(reply) {
    return START_REFUSALS[reply?.reason] ?? `Couldn't start: ${reply?.detail ?? 'unknown error'}.`
  }

  /** What the compared amount includes, so savings are never overstated. */
  function basisNote(total) {
    if (!total) return ''
    const missing = [!total.shippingIncluded && 'shipping', !total.taxIncluded && 'taxes'].filter(Boolean)

    return missing.length
      ? `Compared on the order total before ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} calculated.`
      : 'Compared on the order total including shipping and taxes.'
  }

  function restorationLine(result) {
    const seen = result.finalTotal ? `${codeList(result.codes)} · total ${amount(result.finalTotal)}` : null

    switch (result.restoration) {
      case 'verified':
        return `Your original coupon state is back: ${seen} (checked).`
      case 'failed':
        return `Couldn't put back your original coupon state: ${reasonText(result.problem)}${
          seen ? ` Checkout now shows ${seen}.` : ' Check the order summary.'
        }`
      case 'unverified':
        return `Couldn't confirm your original coupon state: ${reasonText(result.problem)}${
          seen ? ` Last seen: ${seen}.` : ' Check the order summary.'
        }`
      case 'skipped':
        return 'Janice left the discount codes as they are now, to avoid undoing your changes.'
      default:
        return ''
    }
  }

  function attemptLine(attempt, baselineTotal) {
    if (attempt.outcome === 'accepted') {
      const isNotLower = baselineTotal && attempt.total && attempt.total.amountMinor >= baselineTotal.amountMinor
      return `${attempt.code} was accepted: total ${amount(attempt.total)}${isNotLower ? `, not lower than the ${amount(baselineTotal)} before testing` : ''}.`
    }
    if (attempt.outcome === 'rejected') {
      return `${attempt.code} was not accepted${attempt.storeMessage ? `: “${attempt.storeMessage}”` : ''}.`
    }
    return `${attempt.code}: the result couldn't be confirmed.`
  }

  /** Text for the step in progress. */
  function progressText(run) {
    if (run.status === 'stopping') return 'Stopping: finishing the current checkout update, then putting things back…'
    return run.message || 'Working…'
  }

  /** Short heading for the step in progress. */
  function phaseTitle(run) {
    if (run.status === 'stopping') return 'Stopping'
    return PHASES[run.phase] || 'Working'
  }

  /** The verified savings of a finished run, formatted; null unless a code lowered the total. */
  function savingsText(run) {
    const result = run?.result
    return result?.kind === 'better' ? amount({ ...result.finalTotal, amountMinor: result.savingsMinor }) : null
  }

  // "$15" rather than "$15.00", as offers are usually worded.
  const offerAmount = ({ amountMinor, currency }) => Janice.money.formatAmount(amountMinor, currency).replace(/\.00$/, '')

  /** A short label for a candidate's advertised offer, or null. It is what the offer claims, not a result. */
  function offerSummary(candidate) {
    const discount = candidate?.advertisedDiscount
    if (discount?.type !== 'fixed-order-discount' || !Number.isInteger(discount.amountMinor)) return null
    const off = `${offerAmount(discount)} off`
    const minimum = candidate.advertisedMinimumSpend
    if (!Number.isInteger(minimum?.amountMinor)) return `${off} your order`
    if (minimum.inclusive === true) return `${off} orders of ${offerAmount(minimum)} or more`
    if (minimum.inclusive === false) return `${off} orders over ${offerAmount(minimum)}`
    return `${off}, ${offerAmount(minimum)} minimum order`
  }

  /** Title, detail lines and tone for a finished (or interrupted) run. */
  function describeResult(run) {
    const result = run.result || {}
    const lines = []
    const add = line => line && lines.push(line)

    switch (result.kind) {
      case 'better':
        add(`${result.code} is applied. Total ${amount(result.finalTotal)}, was ${amount(result.baselineTotal)}.`)
        add(basisNote(result.finalTotal))
        add("Savings come from the checkout's own totals.")
        return { title: `You save ${savingsText(run)} with ${result.code}`, lines, tone: 'success' }
      case 'no-improvement':
        if (result.reason === 'already-applied') {
          add(`${codeList(result.codes)} is already applied, so there was nothing new to try.`)
          return { title: 'Already using the available code', lines, tone: 'neutral' }
        }
        run.attempts.forEach(attempt => add(attemptLine(attempt, run.baseline?.total)))
        add(result.reason === 'improvement-not-confirmed' ? reasonText(result.reason) : '')
        add(restorationLine(result))
        return { title: 'No better price found', lines, tone: 'neutral' }
      case 'rejected':
        run.attempts.forEach(attempt => add(attemptLine(attempt)))
        add('No savings claimed.')
        add(restorationLine(result))
        return { title: 'Code not accepted', lines, tone: 'neutral' }
      case 'no-candidates':
        add('There are no coupon candidates for this store yet. Nothing was changed.')
        return { title: 'No coupons to try', lines, tone: 'neutral' }
      case 'provider-error':
        add(`The coupon list couldn't be loaded${result.detail ? ` (${result.detail})` : ''}. Nothing was changed; try again.`)
        return { title: "Couldn't load coupons", lines, tone: 'warning' }
      case 'unsupported':
        add(reasonText(result.reason))
        add(result.restoration === 'not-needed' ? 'Nothing was changed.' : restorationLine(result))
        return { title: "Can't test this checkout", lines, tone: 'warning' }
      case 'unverified':
        add(reasonText(result.reason))
        run.attempts.forEach(attempt => add(attemptLine(attempt)))
        add('No savings claimed.')
        add(restorationLine(result))
        return { title: "Result couldn't be confirmed", lines, tone: 'warning' }
      case 'stopped':
        add(restorationLine(result) || 'Nothing was changed.')
        return { title: 'Testing stopped', lines, tone: result.restoration === 'verified' || result.restoration === 'not-needed' ? 'neutral' : 'warning' }
      case 'cart-changed':
        add(`${reasonText(result.reason)} Earlier results were discarded and no savings are claimed.`)
        add(restorationLine(result))
        return { title: 'Testing stopped: checkout changed', lines, tone: 'warning' }
      case 'interrupted':
        add('The page reloaded or moved on while testing.')
        add(
          run.progress?.code || run.attempts.length
            ? `${run.progress?.code || run.attempts.at(-1).code} may still be applied. Check the order summary before paying.`
            : 'Check the order summary before paying.',
        )
        return { title: 'Testing was interrupted', lines, tone: 'warning' }
      default:
        add(reasonText(result.reason))
        add(restorationLine(result))
        add('Check the order summary before paying.')
        return { title: 'Something went wrong', lines, tone: 'error' }
    }
  }

  Janice.messages = { REASONS, amount, codeList, reasonText, refusalText, basisNote, progressText, phaseTitle, savingsText, offerSummary, describeResult }

  if (typeof module === 'object' && module.exports) module.exports = Janice.messages
})(typeof globalThis === 'object' ? globalThis : this)
