/*
 * Toolbar popup: the store, its coupons, and Try coupons. Until that click
 * it only reads the page. The run continues in the page after the popup
 * closes; reopening the popup shows its progress or result from
 * chrome.storage.session.
 */
;(async function () {
  'use strict'

  const { describeResult, progressText, phaseTitle, savingsText, offerSummary, amount, codeList, reasonText, refusalText } = Janice.messages
  const { LOGO, icon, resultIcon } = Janice.icons
  const byId = id => document.getElementById(id)
  const ACTIVE = new Set(['running', 'stopping'])

  // `popup.html?tab=<id>` names the tab explicitly; automated tests open the popup that way.
  const named = new URLSearchParams(location.search).get('tab')
  const tabId = named ? Number(named) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id

  let inspection = null
  let run = null
  let isStarting = false
  let stopSent = false
  let note = ''
  const cards = new Map()

  const element = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text ?? '' })
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('')
  const checkoutLine = (total, codes) => `Checkout · total ${amount(total)}${codes?.length ? ` with ${codeList(codes)}` : ''}`
  // A final state Janice read back and confirmed: the kept winner, or the original put back or never changed.
  const isChecked = result => result?.kind === 'better' || result?.restoration === 'verified' || result?.restoration === 'not-needed'

  function show(id, isShown, text) {
    byId(id).hidden = !isShown
    if (isShown) byId(id).textContent = text
  }

  /** What the popup shows for the page and run as currently known. */
  function screen() {
    const detection = inspection?.detection
    const store = detection?.store ?? null
    const candidates = inspection?.candidates ?? []
    const view = { store, isDemo: Boolean(store?.isDemo || run?.store?.isDemo), candidates: [] }

    if (tabId === undefined) return { ...view, status: 'No tab to check.' }
    if (!inspection) return { ...view, icon: 'spinner', status: 'Checking this page…' }
    if (!inspection.ok) {
      return { ...view, icon: 'lock', status: "Janice Coupons can't read this page.", sub: 'Open the Sharper Image checkout, then click the Janice Coupons button again.' }
    }
    if (!store) {
      return { ...view, icon: 'bag', status: 'This page is not a supported store.', sub: 'Janice Coupons works on the Sharper Image checkout for now.', shop: true }
    }
    if (store.page !== 'checkout') {
      return { ...view, meta: 'Store page', icon: 'arrow', status: 'Go to checkout to try coupons.', sub: 'Janice tests codes on the checkout page, one at a time.', candidates, count: true }
    }

    if (run && ACTIVE.has(run.status)) {
      return {
        ...view,
        meta: 'Checkout · testing coupons',
        kicker: phaseTitle(run),
        status: progressText(run),
        progress: run.progress ?? {},
        candidates,
        details: [run.baseline && `Before testing: ${codeList(run.baseline.codes)} · total ${amount(run.baseline.total)}`],
        stop: run.status,
      }
    }

    const preview = detection.preview
    const meta = preview ? checkoutLine(preview.total, preview.codes) : 'Checkout'
    const canStart = detection.supported && candidates.length > 0 && !inspection.providerError

    if (run?.result) {
      const { title, lines, tone } = describeResult(run)
      const { finalTotal, codes } = run.result
      return {
        ...view,
        // Only a confirmed final state goes in the store row; the details explain anything else.
        meta: isChecked(run.result) && finalTotal ? checkoutLine(finalTotal, codes) : 'Checkout',
        tone,
        savings: savingsText(run),
        icon: resultIcon(tone, run.result),
        status: run.store.isDemo ? `Demo result: ${title}` : title,
        details: lines,
        candidates,
        start: canStart && 'again',
      }
    }
    if (inspection.providerError) {
      return { ...view, meta, tone: 'warning', icon: 'warning', status: `Couldn't load coupons (${inspection.providerError}). Nothing was changed; reopen the popup to retry.` }
    }
    if (!detection.supported) return { ...view, meta, tone: 'warning', icon: 'warning', status: `${reasonText(detection.reason)} Nothing was changed.`, candidates }
    if (candidates.length === 0) return { ...view, meta, icon: 'info', status: 'No coupon candidates for this store yet. Nothing was changed.' }

    const one = candidates.length === 1
    return {
      ...view,
      meta,
      status: `Ready to try ${one ? '1 coupon' : `${candidates.length} coupons`}`,
      sub: one
        ? 'Janice tries it in your checkout and keeps it only if your total goes down.'
        : 'Janice tries each code in your checkout, one at a time, and keeps the best one only if your total goes down.',
      candidates,
      count: true,
      start: 'first',
      hint: 'Nothing changes until you click Try coupons.',
    }
  }

  // What this tab's run did with a code, for its card.
  function couponState(code) {
    const same = other => typeof other === 'string' && other.toUpperCase() === code.toUpperCase()
    if (!run) return { state: 'idle', label: 'Advertised · not tried yet' }
    const isActive = ACTIVE.has(run.status)
    const result = run.result
    if (isActive && same(run.progress?.code)) return { state: 'trying', label: 'Trying in your checkout…' }
    if (result?.kind === 'better' && same(result.code)) return { state: 'applied', label: `Applied · saves ${savingsText(run)}` }
    if (result?.reason === 'already-applied' && result.codes?.some(same)) return { state: 'applied', label: 'Already applied' }
    if (result?.kind === 'interrupted' && same(run.progress?.code)) return { state: 'unverified', label: 'May still be applied' }
    if (result?.kind === 'cart-changed') return { state: 'idle', label: 'Result discarded' }
    const attempt = (run.attempts ?? []).findLast(other => same(other.code))
    if (attempt?.outcome === 'accepted') {
      const isRemoved = isChecked(result) && Array.isArray(result.codes) && !result.codes.some(same)
      return { state: 'accepted', label: isRemoved ? `Accepted (${amount(attempt.total)}), then removed` : `Accepted · total ${amount(attempt.total)}` }
    }
    if (attempt?.outcome === 'rejected') return { state: 'rejected', label: 'Not accepted' }
    if (attempt) return { state: 'unverified', label: "Couldn't confirm" }
    return { state: 'idle', label: isActive ? 'Up next' : 'Not tried' }
  }

  function createCard(candidate) {
    const card = document.createElement('li')
    const top = element('div', 'coupon-top')
    const copy = element('button', 'copy', 'Copy')
    copy.type = 'button'
    copy.setAttribute('aria-label', `Copy code ${candidate.code}`)
    copy.addEventListener('click', () => copyCode(candidate.code))
    top.append(element('span', 'ticket', candidate.code), copy)
    card.append(top, element('p', 'offer', offerSummary(candidate) ?? candidate.offerText ?? 'Coupon code'), element('p', 'coupon-state'))
    return card
  }

  function paintCoupons(candidates) {
    const list = byId('coupons')
    const items = candidates.map(candidate => {
      if (!cards.has(candidate.code)) cards.set(candidate.code, createCard(candidate))
      const card = cards.get(candidate.code)
      const { state, label } = couponState(candidate.code)
      card.className = `coupon is-${state}`
      card.querySelector('.coupon-state').textContent = label
      return card
    })
    // Replace the list only when its cards change, so focus on a Copy button survives updates.
    const current = [...list.children]
    if (items.length !== current.length || items.some((item, index) => item !== current[index])) list.replaceChildren(...items)
    list.hidden = items.length === 0
  }

  async function copyCode(code) {
    let isCopied = false
    try {
      await navigator.clipboard.writeText(code)
      isCopied = true
    } catch {
      // No clipboard access, for example when the popup lost focus.
    }
    byId('announce').textContent = isCopied ? `Copied ${code}.` : `Couldn't copy ${code}.`
  }

  function paintFigure(view) {
    const figure = byId('figure')
    figure.hidden = !(view.savings || view.icon)
    figure.className = `figure is-${view.savings ? 'savings' : view.icon}`
    if (view.savings) {
      figure.replaceChildren(element('span', 'figure-amount', view.savings), element('span', 'figure-label', 'saved'))
    } else if (view.icon === 'spinner') {
      figure.replaceChildren(element('span', 'spinner'))
    } else if (view.icon) {
      figure.innerHTML = icon(view.icon)
    }
  }

  function paintProgress(progress) {
    const bar = byId('progress')
    bar.hidden = !progress
    if (!progress) return
    const isKnown = Number.isInteger(progress.index) && progress.count > 0
    bar.classList.toggle('is-indeterminate', !isKnown)
    if (!isKnown) {
      for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) bar.removeAttribute(name)
      return
    }
    bar.setAttribute('aria-valuemin', '0')
    bar.setAttribute('aria-valuemax', String(progress.count))
    bar.setAttribute('aria-valuenow', String(progress.index - 1))
    bar.setAttribute('aria-valuetext', `Trying code ${progress.index} of ${progress.count}`)
    bar.style.setProperty('--value', `${((progress.index - 0.5) / progress.count) * 100}%`)
  }

  function render() {
    const view = screen()
    if (!view.stop) stopSent = false

    byId('demo').hidden = !view.isDemo
    byId('store').hidden = !view.store
    if (view.store) {
      byId('store-mark').textContent = initials(view.store.name)
      byId('store-name').textContent = view.store.name
      byId('store-meta').textContent = view.meta ?? ''
    }
    const count = view.candidates.length
    show('count', Boolean(view.count) && count > 0, count === 1 ? '1 coupon' : `${count} coupons`)

    byId('hero').className = `hero${view.tone ? ` tone-${view.tone}` : ''}`
    paintFigure(view)
    show('kicker', Boolean(view.kicker), view.kicker)
    byId('status').textContent = view.status
    show('sub', Boolean(view.sub), view.sub)
    paintProgress(view.progress)
    paintCoupons(view.candidates)
    const details = (view.details ?? []).filter(Boolean)
    byId('details').replaceChildren(...details.map(line => element('li', '', line)))
    byId('details').hidden = details.length === 0

    const tryButton = byId('try')
    tryButton.hidden = !view.start
    tryButton.disabled = isStarting
    tryButton.className = view.start === 'again' ? 'secondary' : 'primary'
    tryButton.textContent = isStarting ? 'Starting…' : view.start === 'again' ? 'Try coupons again' : 'Try coupons'

    const stopButton = byId('stop')
    stopButton.hidden = !view.stop
    stopButton.disabled = view.stop === 'stopping' || stopSent
    stopButton.textContent = view.stop === 'stopping' ? 'Stopping…' : 'Stop'

    byId('shop').hidden = !view.shop
    show('hint', Boolean(view.hint), view.hint)
    show('note', Boolean(note), note)
  }

  async function refresh() {
    try {
      inspection = await chrome.runtime.sendMessage({ type: 'janice:inspect', tabId })
    } catch (error) {
      inspection = { ok: false, reason: 'error', detail: String(error?.message ?? error) }
    }
    run = inspection?.run ?? null
    render()
  }

  byId('try').addEventListener('click', async () => {
    if (isStarting) return
    isStarting = true
    note = ''
    render()
    let reply
    try {
      reply = await chrome.runtime.sendMessage({ type: 'janice:try', tabId })
    } catch (error) {
      reply = { ok: false, reason: 'error', detail: String(error?.message ?? error) }
    }
    isStarting = false
    if (reply?.run) run = reply.run
    if (!reply?.ok) note = refusalText(reply)
    render()
  })

  byId('stop').addEventListener('click', () => {
    stopSent = true
    byId('stop').disabled = true
    chrome.runtime.sendMessage({ type: 'janice:stop', tabId }).catch(() => {})
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    const change = area === 'session' && changes[`run:${tabId}`]
    if (!change) return
    run = change.newValue ?? null
    render()
  })

  byId('logo').innerHTML = LOGO
  render()
  await refresh()
})()
