/*
 * Snoozing the page button, from the gear menu in its card: on every store
 * for 24 hours, or on one store until the shopper turns it back on (in the
 * toolbar popup or on Janice's settings page). It is kept in
 * chrome.storage.local, so other tabs and later pages agree. Hide on this
 * page needs no storage: the page button forgets it when the page goes.
 */
;(function (root) {
  'use strict'

  const Janice = root.Janice || (root.Janice = {})

  const KEY = 'launcher:snooze'
  const DAY = 24 * 60 * 60 * 1000

  /** The stored snooze, tidied: { until: a time or null, stores: [{ id, name }] }. */
  function normalize(value) {
    const until = Number.isFinite(value?.until) ? value.until : null
    const stores = Array.isArray(value?.stores) ? value.stores.filter(store => typeof store?.id === 'string' && typeof store.name === 'string') : []
    return { until, stores }
  }

  /** What keeps the page button hidden on the store: 'store', 'everywhere' or null. */
  function hiddenBy(value, storeId, now = Date.now()) {
    const { until, stores } = normalize(value)
    if (stores.some(store => store.id === storeId)) return 'store'
    return until !== null && until > now ? 'everywhere' : null
  }

  async function read(storage) {
    return normalize((await storage.get(KEY))[KEY])
  }

  async function change(storage, edit) {
    const next = edit(await read(storage))
    await storage.set({ [KEY]: next })
    return next
  }

  const snoozeEverywhere = (storage, now = Date.now()) => change(storage, value => ({ ...value, until: now + DAY }))

  const snoozeStore = (storage, store) =>
    change(storage, value => ({ ...value, stores: [...value.stores.filter(other => other.id !== store.id), { id: store.id, name: store.name }] }))

  /** Ends the snooze on every store, on one store, or both. */
  const wake = (storage, { everywhere = false, storeId = null } = {}) =>
    change(storage, value => ({ until: everywhere ? null : value.until, stores: value.stores.filter(store => store.id !== storeId) }))

  Janice.snooze = { KEY, DAY, normalize, hiddenBy, read, snoozeEverywhere, snoozeStore, wake }

  if (typeof module === 'object' && module.exports) module.exports = Janice.snooze
})(typeof globalThis === 'object' ? globalThis : this)
