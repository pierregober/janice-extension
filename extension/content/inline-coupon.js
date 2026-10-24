/*
 * A quiet, field-attached coupon affordance. Its transparent outline and
 * small button are rendered in an isolated shadow root without wrapping or
 * restyling merchant controls. Detection only decorates. In managed mode,
 * Use code starts the shared coupon runner and this control shows progress,
 * Stop and the verified result. Standalone callers may retain fill-only entry.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})
  const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  const STYLE = `
    :host {
      all: initial; position: fixed; inset: 0; width: 100vw; height: 100dvh;
      max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
      background: transparent; overflow: visible; pointer-events: none;
      z-index: 2147483647; color-scheme: light;
      /* Rainbow stops from the usejanice.com hero form. */
      --janice-spectrum: conic-gradient(from 0deg, #ff4d6db3, #ff9f1cb3, #ffe53bb3, #45e87bb3, #22c7ffb3, #7868ffb3, #ff52c8b3, #ff4d6db3);
      font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #24212b;
    }
    :host([hidden]) { display: none !important; }
    *, *::before, *::after { box-sizing: border-box; }
    .inline-coupon { pointer-events: none; }
    .coupon-outline {
      position: fixed; padding: 2px; pointer-events: none;
      border-radius: 0;
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask-composite: exclude;
    }
    .coupon-outline::before {
      content: ""; position: absolute; left: 50%; top: 50%;
      width: var(--spectrum-size); height: var(--spectrum-size);
      background: var(--janice-spectrum);
      transform: translate(-50%, -50%) rotate(0turn);
      animation: janice-rainbow-orbit 8s linear infinite;
    }
    @keyframes janice-rainbow-orbit {
      to { transform: translate(-50%, -50%) rotate(1turn); }
    }
    .inline-coupon:focus-within .coupon-outline::before,
    .inline-coupon:hover .coupon-outline::before { animation-play-state: paused; }
    @media (prefers-reduced-motion: reduce) {
      .coupon-outline::before { animation: none; }
    }
    .use-code {
      position: fixed; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
      min-height: 28px; max-width: calc(100vw - 16px); margin: 0; padding: 4px 10px;
      border: 1px solid #ded9e7; border-radius: 999px;
      background: #fff; color: #24212b; box-shadow: 0 1px 3px #24212b12;
      font: inherit; font-weight: 650; line-height: 18px; white-space: nowrap;
      pointer-events: auto; cursor: pointer;
    }
    .use-code::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--janice-spectrum); }
    .use-code:hover { background: #f7f5fa; border-color: #b7abc9; }
    .use-code:disabled { cursor: wait; opacity: 0.72; }
    .use-code:focus-visible { outline: 2px solid #6544a6; outline-offset: 3px; }
    .coupon-status {
      position: fixed; max-width: min(260px, calc(100vw - 16px)); margin: 0;
      padding: 5px 8px; border: 1px solid #e6e1eb; border-radius: 6px;
      background: #fff; color: #524b5e; font: inherit; font-size: 11px;
      overflow-wrap: anywhere; pointer-events: none;
    }
    .instruction { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
    [hidden] { display: none !important; }
    @media (forced-colors: active) {
      .coupon-outline { background: none; mask: none; -webkit-mask: none; border: 2px solid Highlight; }
      .coupon-outline::before { display: none; animation: none; }
      .use-code { border-color: ButtonText; }
      .use-code::before { background: Highlight; }
      .coupon-status { border-color: CanvasText; }
    }
  `

  function createInlineCoupon({ window: win = root, isEligibleInput = () => true, onTry, onStop } = {}) {
    const doc = win.document
    const host = doc.createElement('janice-inline-coupon')
    host.setAttribute('data-janice-inline', '')
    host.setAttribute('popover', 'manual')
    host.hidden = true
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="inline-coupon">
        <div class="coupon-outline" aria-hidden="true"></div>
        <button class="use-code" type="button" aria-describedby="coupon-instruction">Use code</button>
        <span class="instruction" id="coupon-instruction"></span>
        <p class="coupon-status" role="status" hidden></p>
      </div>
    `
    const outline = shadow.querySelector('.coupon-outline')
    const button = shadow.querySelector('.use-code')
    const instruction = shadow.querySelector('.instruction')
    const status = shadow.querySelector('.coupon-status')
    let target = null
    let code = null
    let shown = false
    let destroyed = false
    let frame = null
    let followUntil = 0
    let dispatchingInput = false
    const managed = typeof onTry === 'function'
    let currentRun = null
    let runFingerprint = ''
    let runRevision = 0
    let starting = false
    let stopPending = false
    let notice = ''
    const editEvents = ['beforeinput', 'input', 'paste', 'drop', 'compositionstart', 'keydown']
    const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedulePosition) : null

    const activeRun = () => currentRun?.status === 'running' || currentRun?.status === 'stopping'
    const timeOf = run => Number.isFinite(run?.updatedAt) ? run.updatedAt : 0

    function renderManaged() {
      if (!managed || destroyed) return
      const run = currentRun
      const active = activeRun()
      const stopping = run?.status === 'stopping' || (active && stopPending)
      const finished = run?.status === 'done' || Boolean(run?.result)
      button.textContent = stopping ? 'Stopping…' : active ? 'Stop' : starting ? 'Starting…' : finished ? 'Try again' : 'Use code'
      button.disabled = stopping || (!active && starting) || (active && typeof onStop !== 'function')
      if (starting || active) button.setAttribute('aria-busy', 'true')
      else button.removeAttribute('aria-busy')
      instruction.textContent = active
        ? 'Stop testing after the current store update, then restore the original coupon state when possible.'
        : 'Try available coupon codes one at a time using the store’s Apply button and verify each response.'

      const lines = []
      const last = run?.attempts?.at(-1)
      const outcome = attempt => `${attempt.code}: ${attempt.outcome === 'accepted' ? 'accepted' : attempt.outcome === 'rejected' ? 'not accepted' : 'unverified'}`
      if (active) {
        const progress = run.progress
        const message = run.message || (progress?.code ? `Trying ${progress.code} (${progress.index} of ${progress.count})…` : 'Testing coupons…')
        lines.push(Janice.messages?.progressText({ ...run, message }) ?? message)
        if (last) lines.push(outcome(last))
      } else if (starting) {
        lines.push('Starting coupon tests…')
      } else if (finished) {
        const complete = { ...run, attempts: run.attempts ?? [] }
        const description = Janice.messages?.describeResult(complete)
        const result = run.result ?? {}
        const fallback = {
          better: 'Code applied', rejected: 'Codes not accepted', 'no-improvement': 'No better price found',
          stopped: 'Testing stopped', unverified: 'Result could not be confirmed', unsupported: 'Cannot test this cart',
          'cart-changed': 'Testing stopped: cart changed', interrupted: 'Testing interrupted',
        }
        lines.push(description?.title ?? fallback[result.kind] ?? 'Testing finished')
        if (last?.outcome === 'rejected' && result.kind !== 'better') {
          lines.push(`${outcome(last)}${last.storeMessage ? `: ${last.storeMessage}` : ''}`)
        }
        if (['failed', 'unverified', 'skipped'].includes(result.restoration)) {
          const restoration = description?.lines?.find(line => /^(?:Couldn't (?:put back|confirm)|Janice left)/.test(line))
          lines.push(restoration ?? (result.restoration === 'skipped' ? 'Your discount changes were preserved.' : 'Original coupon state is not confirmed. Check the cart.'))
        } else if (['unverified', 'error', 'unsupported'].includes(result.kind)) {
          const detail = description?.lines?.[0]
          if (detail && detail !== description.title) lines.push(detail)
        }
        if (result.draftRestoration?.ok === false) lines.push('Field text was left as-is.')
      }
      if (notice) lines.push(notice)
      status.textContent = lines.filter(Boolean).join(' ')
      status.hidden = !status.textContent
      schedulePosition()
    }

    function rememberRun(run) {
      if (run && currentRun && timeOf(run) < timeOf(currentRun)) return
      const fingerprint = JSON.stringify(run ?? null)
      if (fingerprint !== runFingerprint) {
        const previousId = currentRun?.runId
        currentRun = run ?? null
        runFingerprint = fingerprint
        runRevision++
        notice = ''
        if (!activeRun() || previousId !== currentRun?.runId) stopPending = false
      }
    }

    function renderRun(run) {
      if (destroyed) return
      rememberRun(run)
      renderManaged()
    }

    async function requestManagedAction() {
      if (destroyed) return
      if (activeRun()) {
        if (stopPending || currentRun.status === 'stopping' || typeof onStop !== 'function') return
        stopPending = true
        notice = ''
        renderManaged()
        try {
          const reply = await onStop()
          if (!destroyed && reply?.ok === false) {
            stopPending = false
            if (activeRun()) notice = Janice.messages?.refusalText(reply) ?? reply.detail ?? 'Could not request Stop. Try again.'
          }
        } catch (error) {
          stopPending = false
          if (activeRun()) notice = `Could not request Stop: ${String(error?.message ?? error)}`
        }
        return renderManaged()
      }
      if (starting || !shown || !usable(target) || !isEligibleInput(target)) return
      starting = true
      notice = ''
      const revision = runRevision
      renderManaged()
      try {
        const reply = await onTry()
        if (destroyed) return
        // Live runner updates may arrive before the start reply. Keep those
        // instead of painting an older checking-state over active progress.
        if (reply?.run && (runRevision === revision || (currentRun?.runId === reply.run.runId && timeOf(reply.run) > timeOf(currentRun)))) rememberRun(reply.run)
        if (!reply?.ok && !activeRun()) notice = Janice.messages?.refusalText(reply) ?? reply?.detail ?? 'Could not start coupon tests.'
      } catch (error) {
        if (!activeRun()) notice = `Could not start coupon tests: ${String(error?.message ?? error)}`
      } finally {
        starting = false
        renderManaged()
      }
    }

    function listenForEdits(input, add) {
      for (const type of editEvents) input?.[add ? 'addEventListener' : 'removeEventListener'](type, edited)
    }

    function usable(input) {
      if (!input || input.ownerDocument !== doc || input.tagName !== 'INPUT' || input.type !== 'text' || !input.isConnected || input.disabled || input.readOnly || input.matches(':disabled')) return false
      for (let node = input; node?.nodeType === 1; node = node.parentElement) {
        if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
        if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return false
        const style = win.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      }
      if (typeof input.checkVisibility === 'function' && !input.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })) return false
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return typeof input.checkVisibility !== 'function'
      return rect.width > 0 && rect.height > 0 && rect.left < win.innerWidth && rect.top < win.innerHeight && rect.right > 0 && rect.bottom > 0
    }

    function hide() {
      if (shown && typeof host.hidePopover === 'function') host.hidePopover()
      shown = false
      host.hidden = true
      resizeObserver?.disconnect()
      listenForEdits(target, false)
      target = null
      code = null
      if (frame !== null) win.cancelAnimationFrame(frame)
      frame = null
    }

    const intersects = (a, b) => a.left < b.right + 3 && a.right > b.left - 3 && a.top < b.bottom + 3 && a.bottom > b.top - 3

    function matchCornerRadii(rect) {
      const style = win.getComputedStyle(target)
      const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius']
      const width = target.offsetWidth || rect.width
      const height = target.offsetHeight || rect.height
      const length = (value, size) => {
        const match = /^(\d*\.?\d+)(px|%)?$/.exec(value)
        return match ? Number(match[1]) * (match[2] === '%' ? size / 100 : 1) : null
      }
      const radii = corners.map(corner => {
        const parts = (style[corner] || '0px').trim().split(/\s+/)
        return [length(parts[0], width), length(parts[1] ?? parts[0], height)]
      })
      if (radii.some(pair => pair.includes(null))) {
        // Preserve CSS math expressions rather than replacing them with a
        // guessed uniform radius. Common px/% values use the exact offset below.
        for (const corner of corners) outline.style[corner] = style[corner] || '0px'
        return
      }
      // CSS scales all corners together when adjacent radii overlap. Resolve
      // that used geometry before adding the outline's three-pixel offset.
      const ratio = (size, sum) => sum > 0 ? size / sum : 1
      const factor = Math.min(1,
        ratio(width, radii[0][0] + radii[1][0]), ratio(width, radii[3][0] + radii[2][0]),
        ratio(height, radii[0][1] + radii[3][1]), ratio(height, radii[1][1] + radii[2][1]),
      )
      radii.forEach(([x, y], index) => {
        outline.style[corners[index]] = x === 0 || y === 0 ? '0px'
          : `${x * factor * rect.width / width + 3}px ${y * factor * rect.height / height + 3}px`
      })
    }

    // Keep the added button off the store's input, controls and coupon
    // feedback. Label text is measured separately when it wraps
    // the target, so the empty area beside its caption remains available.
    function occupied() {
      const boxes = []
      const add = rect => { if (rect.width > 0 && rect.height > 0) boxes.push(rect) }
      const container = target.closest('[id*="shopify-section-cart-drawer"], .shopify-section-cart-drawer, [id^="shopify-section-"][id$="__cart-drawer"]') ?? doc
      for (const element of container.querySelectorAll('button, input, select, textarea, a[href], summary, label, p, h1, h2, h3, dt, dd, .cart-discount-code__message, .cart-discount-code__order-discounts')) {
        if (element === target || element.closest('janice-inline-coupon, janice-coupons-launcher, janice-coupons-panel')) continue
        if (element.tagName === 'LABEL' && element.contains(target)) {
          for (const child of element.childNodes) {
            if (child.nodeType !== 3 || !child.textContent.trim()) continue
            const range = doc.createRange()
            range.selectNodeContents(child)
            if (typeof range.getBoundingClientRect === 'function') add(range.getBoundingClientRect())
          }
        } else add(element.getBoundingClientRect())
      }
      return boxes
    }

    function position() {
      frame = null
      if (!shown || !usable(target)) return hide()
      const rect = target.getBoundingClientRect()
      for (const [key, value] of Object.entries({ left: `${rect.left - 3}px`, top: `${rect.top - 3}px`, width: `${rect.width + 6}px`, height: `${rect.height + 6}px` })) outline.style.setProperty(key, value)
      matchCornerRadii(rect)
      // Rotate only the gradient texture inside the fixed mask. A diagonal-
      // sized square covers the whole rectangular border at every angle.
      outline.style.setProperty('--spectrum-size', `${Math.ceil(Math.hypot(rect.width + 6, rect.height + 6)) + 2}px`)

      const width = button.getBoundingClientRect().width || 88
      const height = button.getBoundingClientRect().height || 28
      const view = win.visualViewport
      const left = (view?.offsetLeft ?? 0) + 8
      const top = (view?.offsetTop ?? 0) + 8
      const right = left + (view?.width ?? win.innerWidth) - 16
      const bottom = top + (view?.height ?? win.innerHeight) - 16
      const boxes = occupied()
      const options = [
        { x: rect.right - width, y: rect.bottom + 6 },
        { x: rect.right - width, y: rect.top - height - 6 },
        { x: rect.right + 8, y: rect.top + (rect.height - height) / 2 },
        { x: rect.left - width - 8, y: rect.top + (rect.height - height) / 2 },
      ]
      // Also try beyond the native response rows so accepted/rejected text
      // and order-discount amounts remain readable after the store rerenders.
      const nearbyBelow = boxes.filter(box => box.top >= rect.bottom && box.top < rect.bottom + 360)
      for (const box of nearbyBelow) options.push({ x: rect.right - width, y: box.bottom + 6 })
      const clamp = point => ({ x: Math.max(left, Math.min(point.x, right - width)), y: Math.max(top, Math.min(point.y, bottom - height)) })
      const scored = options.map((point, index) => {
        const bounded = clamp(point)
        const box = { left: bounded.x, right: bounded.x + width, top: bounded.y, bottom: bounded.y + height }
        const collisions = boxes.filter(other => intersects(box, other)).length + (intersects(box, rect) ? 10 : 0)
        return { ...bounded, score: collisions * 1000 + index }
      }).sort((a, b) => a.score - b.score)
      const chosen = scored[0]
      button.style.setProperty('left', `${chosen.x}px`)
      button.style.setProperty('top', `${chosen.y}px`)
      if (!status.hidden) {
        const statusWidth = Math.min(260, right - left)
        status.style.setProperty('width', `${statusWidth}px`)
        const statusHeight = status.getBoundingClientRect().height || 40
        const statusOptions = [
          { x: chosen.x + width - statusWidth, y: chosen.y + height + 4 },
          { x: chosen.x + width - statusWidth, y: chosen.y - statusHeight - 4 },
          { x: rect.right - statusWidth, y: rect.bottom + 6 },
          { x: rect.right - statusWidth, y: Math.min(rect.top, chosen.y) - statusHeight - 6 },
          ...boxes.filter(box => box.bottom <= rect.top && box.bottom > rect.top - 180)
            .map(box => ({ x: rect.right - statusWidth, y: box.top - statusHeight - 6 })),
          ...nearbyBelow
            .map(box => ({ x: rect.right - statusWidth, y: box.bottom + 6 })),
        ]
        const buttonBox = { left: chosen.x, right: chosen.x + width, top: chosen.y, bottom: chosen.y + height }
        const statusPosition = statusOptions.map((point, index) => {
          const x = Math.max(left, Math.min(point.x, right - statusWidth))
          const y = Math.max(top, Math.min(point.y, bottom - statusHeight))
          const box = { left: x, right: x + statusWidth, top: y, bottom: y + statusHeight }
          const collisions = boxes.filter(other => intersects(box, other)).length
            + (intersects(box, rect) ? 10 : 0) + (intersects(box, buttonBox) ? 10 : 0)
          return { x, y, score: collisions * 1000 + index }
        }).sort((a, b) => a.score - b.score)[0]
        status.style.setProperty('left', `${statusPosition.x}px`)
        status.style.setProperty('top', `${statusPosition.y}px`)
      }
      // Follow the store's opening transform for a short bounded window.
      // Its mask stays attached to the field independently of the rainbow.
      if (win.performance.now() < followUntil) {
        for (let node = target; node?.nodeType === 1; node = node.parentElement) {
          if (node.getAnimations?.().some(animation => animation.playState === 'running')) {
            schedulePosition()
            break
          }
        }
      }
    }

    function schedulePosition() {
      if (shown && frame === null) frame = win.requestAnimationFrame(position)
    }

    function sync({ inputs = [], candidates = [], run } = {}) {
      if (destroyed) return
      if (run !== undefined) rememberRun(run)
      const next = Array.isArray(inputs) ? inputs.find(usable) : null
      const candidate = Array.isArray(candidates) ? candidates.find(item => typeof item?.code === 'string' && CODE.test(item.code)) : null
      if (!next || !candidate) return hide()
      const nextCode = candidate.code
      const targetChanged = next !== target
      if (targetChanged || nextCode !== code) {
        resizeObserver?.disconnect()
        if (targetChanged) listenForEdits(target, false)
        target = next
        code = nextCode
        if (targetChanged) listenForEdits(target, true)
        resizeObserver?.observe(target)
        if (!managed) {
          button.textContent = 'Use code'
          status.textContent = ''
          status.hidden = true
          instruction.textContent = `Enter ${code} in the highlighted field, then select the store's Apply button to check the discount.`
        }
        followUntil = win.performance.now() + 500
      }
      // Keep the button within a store modal's composed tree so its focus
      // trap can reach it. Existing input/label sibling pairs stay together;
      // the fixed host adds no box to the merchant's layout.
      let anchor = target.closest('label') ?? target
      if (anchor === target) {
        for (const label of target.labels ?? []) {
          if (label.parentNode === target.parentNode && (target.compareDocumentPosition(label) & win.Node.DOCUMENT_POSITION_FOLLOWING)) anchor = label
        }
      }
      if (host.parentNode !== anchor.parentNode || targetChanged) {
        if (shown && typeof host.hidePopover === 'function') host.hidePopover()
        shown = false
        anchor.parentNode.insertBefore(host, anchor.nextSibling)
      }
      host.hidden = false
      if (!shown && typeof host.showPopover === 'function') host.showPopover()
      shown = true
      renderManaged()
      position()
    }

    function edited(event) {
      if (managed) return renderManaged()
      if (dispatchingInput && event?.type === 'input') return
      button.textContent = 'Use code'
      status.hidden = true
      status.textContent = ''
      schedulePosition()
    }

    // Puts the whole code in the field at once. A store's controlled field may
    // rewrite or replace itself during the events, so the code counts as
    // entered only if this same field still holds it.
    function enterCode(input) {
      const holdsCode = () => !destroyed && shown && target === input && !doc.hidden && usable(input) && isEligibleInput(input) && input.value === code
      const { set } = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')
      set.call(input, code)
      input.setSelectionRange(code.length, code.length)
      dispatchingInput = true
      try {
        input.dispatchEvent(typeof win.InputEvent === 'function'
          ? new win.InputEvent('input', { bubbles: true, data: code, inputType: 'insertText' })
          : new win.Event('input', { bubbles: true }))
      } finally {
        dispatchingInput = false
      }
      if (!holdsCode()) return false
      input.dispatchEvent(new win.Event('change', { bubbles: true }))
      return holdsCode()
    }

    button.addEventListener('click', () => {
      if (managed) return void requestManagedAction()
      if (destroyed || !shown || !usable(target) || !CODE.test(code ?? '') || !isEligibleInput(target)) return hide()
      const input = target
      const existing = input.value
      status.hidden = false
      if (existing.trim() && existing.toUpperCase() !== code.toUpperCase()) {
        status.textContent = `Clear the field to use ${code}.`
        return schedulePosition()
      }
      if (existing.toUpperCase() !== code.toUpperCase() && !enterCode(input)) {
        status.hidden = true
        status.textContent = ''
        return schedulePosition()
      }
      button.textContent = 'Code entered'
      status.textContent = `${code} entered. Select Apply to check the discount.`
      schedulePosition()
    })

    doc.addEventListener('scroll', schedulePosition, { capture: true, passive: true })
    win.addEventListener('resize', schedulePosition)
    win.visualViewport?.addEventListener('resize', schedulePosition)
    win.visualViewport?.addEventListener('scroll', schedulePosition)
    return {
      element: host,
      sync,
      renderRun,
      hide,
      destroy() {
        destroyed = true
        hide()
        resizeObserver?.disconnect()
        doc.removeEventListener('scroll', schedulePosition, true)
        win.removeEventListener('resize', schedulePosition)
        win.visualViewport?.removeEventListener('resize', schedulePosition)
        win.visualViewport?.removeEventListener('scroll', schedulePosition)
        host.remove()
      },
    }
  }

  Janice.createInlineCoupon = createInlineCoupon
  if (typeof module === 'object' && module.exports) module.exports = { createInlineCoupon }
})(typeof globalThis === 'object' ? globalThis : this)
