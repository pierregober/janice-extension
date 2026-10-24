/*
 * Development only: the service worker's entry in npm start's build, around
 * the real service-worker.js. Each time the worker starts it connects once
 * to npm start's reload channel (scripts/reload-server.js). When the channel
 * names a newer build it reloads Janice, then the Sharper Image and Demo
 * checkout tabs, whose page scripts a reload leaves behind; when npm start
 * stops, it reloads into the plain build. Without npm start running, the
 * attempt fails (Chrome lists it among the extension's errors) and nothing
 * else happens. npm run build and npm run package leave this file out.
 * While connected, the channel's messages keep Chrome from stopping the
 * worker, so check anything that depends on Chrome stopping it with npm run
 * build.
 *
 * scripts/build.js writes RELOAD_URL and BUILD_ID above this comment.
 */
importScripts('service-worker.js')

;(function () {
  'use strict'

  const RELOADED = 'dev:reloaded'
  // The pages the page button runs on in this build: the store, and the Demo checkout.
  const isJanicePage = url => /^https:\/\/sharperimage\.com\//.test(url) || /^http:\/\/127\.0\.0\.1(:\d+)?\/demo-checkout\//.test(url)

  function connect() {
    const socket = new WebSocket(RELOAD_URL)
    socket.addEventListener('message', async ({ data }) => {
      // The plain build has no page scripts of its own to refresh; an old page's button says to reload the page.
      if (data === 'final') return chrome.runtime.reload()
      if (!String(data).startsWith('build:') || data === `build:${BUILD_ID}`) return
      await chrome.storage.local.set({ [RELOADED]: true })
      chrome.runtime.reload()
    })
  }

  // Reloading Janice cuts off its scripts in open pages; reload those pages so they get the new ones.
  async function reloadPages() {
    if (!(await chrome.storage.local.get(RELOADED))[RELOADED]) return
    await chrome.storage.local.remove(RELOADED)
    for (const tab of await chrome.tabs.query({})) {
      if (tab.url && isJanicePage(tab.url)) void chrome.tabs.reload(tab.id)
    }
  }

  void reloadPages()
  connect()
})()
