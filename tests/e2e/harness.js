// Drives the unpacked extension in Playwright's Chromium (Chrome for
// Testing). Shared by the Demo browser tests and scripts/live-check.js.
//
// Playwright cannot click the toolbar button, which is what grants
// activeTab. The extension is therefore loaded from a temporary build (what
// npm run build writes) whose manifest adds host access for the origins
// under test; nothing else differs. The popup is opened as a page naming the
// target tab (popup.html?tab=<id>), and the checkout tab is brought back to
// the front.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const { buildExtension } = require('../../scripts/build.js')

const EXTENSION = path.join(__dirname, '..', '..', 'extension')

// launcherMatches adds pages where the page button runs, such as the Demo checkout's host.
function testCopy({ hostPermissions, launcherMatches = [], dataset } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-extension-'))
  buildExtension({ outDir: dir })
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.host_permissions = hostPermissions
  manifest.content_scripts[0].matches.push(...launcherMatches)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  if (dataset) fs.writeFileSync(path.join(dir, 'data', 'mock-coupons.json'), JSON.stringify(dataset, null, 2))
  return dir
}

// A given profileDir is kept (and reused across launches); otherwise a throwaway one is made and removed.
async function launch({ extensionDir, headless = true, viewport = { width: 1280, height: 900 }, profileDir }) {
  const profile = profileDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'janice-profile-'))
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless,
    viewport,
    locale: 'en-US',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host

  return {
    context,
    worker,
    extensionId,
    browserVersion: context.browser()?.version() ?? null,
    async tabId(urlPattern) {
      const tabs = await worker.evaluate(pattern => chrome.tabs.query({ url: pattern }), urlPattern)
      if (tabs.length !== 1) throw new Error(`expected one tab for ${urlPattern}, found ${tabs.length}`)
      return tabs[0].id
    },
    async openPopup(tabId) {
      const popup = await context.newPage()
      await popup.goto(`chrome-extension://${extensionId}/popup/popup.html?tab=${tabId}`)
      return popup
    },
    // As in the profile of anyone who loads Janice unpacked: without it Chrome disables Janice when it reloads.
    async turnOnDeveloperMode() {
      const page = await context.newPage()
      await page.goto('chrome://extensions/')
      await page.evaluate(() => new Promise(resolve => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve)))
      await page.close()
    },
    storedRun: tabId => worker.evaluate(id => chrome.storage.session.get(`run:${id}`).then(stored => stored[`run:${id}`] ?? null), tabId),
    async close() {
      await context.close()
      if (!profileDir) fs.rmSync(profile, { recursive: true, force: true })
    },
  }
}

/** What the checkout panel shows, read from its shadow root. */
function panelState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('janice-coupons-panel')?.shadowRoot
    if (!root) return null
    const text = selector => root.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() ?? ''
    return {
      status: text('.status'),
      result: text('.result'),
      baseline: text('.baseline'),
      isDemo: !root.querySelector('.demo').hidden,
      isStoppable: !root.querySelector('.stop').hidden,
      isDone: !root.querySelector('.close').hidden,
    }
  })
}

function waitForPanelDone(page, timeout = 60000) {
  return page.waitForFunction(
    () => {
      const root = document.querySelector('janice-coupons-panel')?.shadowRoot
      return Boolean(root && !root.querySelector('.close').hidden)
    },
    null,
    { timeout, polling: 100 },
  )
}

module.exports = { EXTENSION, testCopy, launch, panelState, waitForPanelDone }
