/*
 * Janice's settings page: Go to settings in the page button's menu, the
 * toolbar popup's gear, or Options in Janice's toolbar menu opens it. It shows
 * what Janice keeps on this device for the page button and tips, and changes
 * it in chrome.storage.local; open store pages follow the changes.
 */
;(async function () {
  'use strict'

  const { snooze, tips, icons } = Janice
  const storage = chrome.storage.local
  const KEYS = [snooze.KEY, tips.KEYS.settings, tips.KEYS.prices]
  const byId = id => document.getElementById(id)
  const time = value => new Date(value).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  function storeRow(store) {
    const row = document.createElement('li')
    const name = Object.assign(document.createElement('span'), { textContent: store.name })
    const show = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary', textContent: 'Show again' })
    show.setAttribute('aria-label', `Show the page button on ${store.name} again`)
    show.addEventListener('click', async () => {
      await snooze.wake(storage, { storeId: store.id })
      byId('button-title').focus()
      byId('status').textContent = `The page button shows on ${store.name} again.`
    })
    row.append(name, show)
    return row
  }

  async function render() {
    const stored = await storage.get(KEYS)
    const { until, stores } = snooze.normalize(stored[snooze.KEY])
    const isSnoozed = until !== null && until > Date.now()
    byId('everywhere').textContent = isSnoozed ? `Snoozed until ${time(until)}` : 'Showing'
    byId('wake-everywhere').hidden = !isSnoozed
    byId('snoozed-stores').replaceChildren(...stores.map(storeRow))
    byId('snoozed-stores').hidden = stores.length === 0
    byId('no-stores').hidden = stores.length > 0

    byId('remember').checked = stored[tips.KEYS.settings]?.rememberPrices !== false
    const count = Object.keys(stored[tips.KEYS.prices] ?? {}).length
    byId('prices').textContent = count === 0 ? 'No prices kept' : count === 1 ? 'Prices kept for 1 product' : `Prices kept for ${count} products`
  }

  byId('wake-everywhere').addEventListener('click', async () => {
    await snooze.wake(storage, { everywhere: true })
    byId('button-title').focus()
    byId('status').textContent = 'The page button shows on every store again.'
  })
  byId('remember').addEventListener('change', async event => {
    const settings = (await storage.get(tips.KEYS.settings))[tips.KEYS.settings] ?? {}
    await storage.set({ [tips.KEYS.settings]: { ...settings, rememberPrices: event.target.checked } })
    byId('status').textContent = event.target.checked ? 'Janice will remember prices you see.' : "Janice won't remember new prices."
  })
  byId('clear-prices').addEventListener('click', async () => {
    await storage.set({ [tips.KEYS.prices]: {} })
    byId('status').textContent = 'Price history cleared.'
  })
  // Snoozed from a store page, or changed in another tab, while this page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEYS.some(key => changes[key])) void render()
  })

  byId('logo').innerHTML = icons.LOGO
  await render()
})()
