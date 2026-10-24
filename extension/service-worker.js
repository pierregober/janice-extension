/*
 * Service worker: coordinates the popup, the page button and the page. It
 * injects the bundled content scripts into the tab the toolbar button was
 * used on (activeTab) or whose page button was opened (host access to
 * sharperimage.com), hands the run its coupon candidates, relays Stop, and
 * keeps each tab's latest run state in chrome.storage.session so the popup
 * can show it after reopening. It also opens the settings page for Go to
 * settings in the page button's menu, which a content script cannot open. It
 * holds nothing it needs between events: Chrome may stop it at any time.
 */
importScripts('providers/coupon-provider.js', 'providers/local-mock-provider.js', 'shared/coupon-candidates.js', 'content/stores.js')

const CONTENT_SCRIPTS = [
  'shared/money.js',
  'shared/compare.js',
  'shared/messages.js',
  'shared/icons.js',
  'shared/coupon-candidates.js',
  'content/dom.js',
  'content/coupon-entry.js',
  'content/adapters/sharper-image.js',
  'content/adapters/sharper-image-drawer.js',
  'content/shopify.js',
  'content/stores.js',
  'content/checkout-discovery.js',
  'content/run-controller.js',
  'content/panel.js',
  'content/main.js',
]
const ACTIVE = new Set(['running', 'stopping'])
const runKey = tabId => `run:${tabId}`

const provider = Janice.providers.createLocalMockProvider({
  loadDataset: async () => {
    const response = await fetch(chrome.runtime.getURL('data/mock-coupons.json'))
    if (!response.ok) throw new Error(`coupon data request failed (${response.status})`)
    return response.json()
  },
})

// Tabs whose start request is being handled, so rapid clicks start one run.
const starting = new Set()
// Per-tab write queues, so run updates are stored in the order they arrive.
const writes = new Map()

// The popup names the tab it was opened for; a content script (the page button) can only act on its own tab.
const tabOf = (message, sender) => (sender.url?.startsWith(chrome.runtime.getURL('')) ? message.tabId : sender.tab?.id)

const handlers = {
  'janice:inspect': (message, sender) => inspect(tabOf(message, sender)),
  'janice:try': (message, sender) => tryCoupons(tabOf(message, sender), message.additionalCodes),
  'janice:stop': (message, sender) => chrome.tabs.sendMessage(tabOf(message, sender), { type: 'janice:stop' }),
  'janice:run-update': ({ run }, sender) => saveRun(sender.tab?.id, run),
  'janice:open-settings': async () => {
    await chrome.runtime.openOptionsPage()
    return { ok: true }
  },
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = sender.id === chrome.runtime.id && handlers[message?.type]
  if (!handler) return false
  ;(async () => {
    try {
      sendResponse(await handler(message, sender))
    } catch (error) {
      sendResponse({ ok: false, reason: 'error', detail: String(error?.message ?? error) })
    }
  })()
  return true // The answer comes once the handler settles.
})

// The tab's host, readable on sharperimage.com or once the toolbar button granted activeTab; null when not.
async function hostOf(tabId) {
  try {
    const { url } = await chrome.tabs.get(tabId)
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}

// Injects the content scripts unless they already answer in this document.
async function ensureContent(tabId) {
  try {
    if ((await chrome.tabs.sendMessage(tabId, { type: 'janice:ping' }))?.ok) return
  } catch {
    // No content script in this document yet.
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS })
}

async function candidatesFor(storeId) {
  try {
    return { candidates: await provider.getCandidates(storeId), providerError: null }
  } catch (error) {
    return { candidates: [], providerError: error.message || 'the coupon data could not be read' }
  }
}

function interrupted(run) {
  return { ...run, status: 'done', updatedAt: Date.now(), result: { kind: 'interrupted', reason: 'page-changed', restoration: 'unverified' } }
}

/** What the popup and the page button's card show on opening: the page's store and checkout, read only. */
async function inspect(tabId) {
  let run = await loadRun(tabId)
  const host = await hostOf(tabId)
  if (host === null) return { ok: false, reason: 'no-access', run }
  // Other sites are never injected into: there is nothing to read there.
  if (!Janice.stores.isCandidateHost(host)) return { ok: true, detection: { store: null, run: null }, candidates: [], providerError: null, run }
  try {
    await ensureContent(tabId)
  } catch {
    return { ok: false, reason: 'no-access', run }
  }
  const detection = await chrome.tabs.sendMessage(tabId, { type: 'janice:detect' })

  // A run stored as active that this document does not know was cut off by navigation.
  const live = detection.run
  if (run && ACTIVE.has(run.status) && !(live && live.runId === run.runId && ACTIVE.has(live.status))) {
    run = interrupted(run)
    await saveRun(tabId, run)
  }
  if (live && (!run || live.runId !== run.runId || live.updatedAt >= run.updatedAt)) run = live

  const { candidates, providerError } = detection.store ? await candidatesFor(detection.store.id) : { candidates: [], providerError: null }
  return {
    ok: true,
    detection,
    candidates: candidates.map(({ code, offerText, advertisedDiscount, advertisedMinimumSpend }) => ({
      code,
      offerText,
      advertisedDiscount,
      advertisedMinimumSpend,
    })),
    providerError,
    run,
  }
}

/** Starts a run in the tab: the shopper's Try coupons click, in the popup or the page button's card. */
async function tryCoupons(tabId, additionalCodes = '') {
  if (starting.has(tabId)) return { ok: false, reason: 'already-starting' }
  starting.add(tabId)
  try {
    const host = await hostOf(tabId)
    if (host === null || !Janice.stores.isCandidateHost(host)) return { ok: false, reason: 'not-checkout' }
    await ensureContent(tabId)
    const detection = await chrome.tabs.sendMessage(tabId, { type: 'janice:detect' })
    if (detection.run && ACTIVE.has(detection.run.status)) return { ok: false, reason: 'already-running', run: detection.run }
    if (!detection.store) return { ok: false, reason: 'not-checkout' }
    if (!detection.supported) return { ok: false, reason: detection.reason === 'unverified-checkout' ? 'unverified-checkout' : 'unsupported-checkout' }

    const { candidates, providerError } = await candidatesFor(detection.store.id)
    let batch
    try {
      batch = Janice.couponCandidates.mergeCandidates(candidates, additionalCodes)
    } catch (error) {
      return { ok: false, reason: 'invalid-codes', detail: error.message }
    }
    return await chrome.tabs.sendMessage(tabId, { type: 'janice:start', candidates: batch, providerError })
  } finally {
    starting.delete(tabId)
  }
}

async function loadRun(tabId) {
  const key = runKey(tabId)
  return (await chrome.storage.session.get(key))[key] ?? null
}

async function saveRun(tabId, run) {
  if (tabId === undefined || !run) return { ok: false }
  const previous = writes.get(tabId)
  const queued = (async () => {
    try {
      await previous
    } catch {
      // A failed earlier write does not hold this one back.
    }
    return writeRun(tabId, run)
  })()
  writes.set(tabId, queued)
  return queued
}

async function writeRun(tabId, run) {
  const previous = await loadRun(tabId)
  if (previous && previous.runId === run.runId && previous.updatedAt > run.updatedAt) return { ok: true }
  await chrome.storage.session.set({ [runKey(tabId)]: run })
  try {
    await chrome.action.setBadgeText({ tabId, text: ACTIVE.has(run.status) ? '…' : run.result?.kind === 'interrupted' ? '!' : '' })
  } catch {
    // The tab may have closed meanwhile.
  }
  return { ok: true }
}

// A navigation or reload in a tab ends any run in it.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return
  try {
    const run = await loadRun(tabId)
    if (run && ACTIVE.has(run.status)) await saveRun(tabId, interrupted(run))
  } catch {
    // Session storage failed; the popup reports the stored run as it finds it.
  }
})

chrome.tabs.onRemoved.addListener(async tabId => {
  writes.delete(tabId)
  try {
    await chrome.storage.session.remove(runKey(tabId))
  } catch {
    // Session storage is cleared when the browser closes anyway.
  }
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: '#5b2c91' })
})
