// npm start's development build in Chromium: it connects to the reload
// channel, a newer build reloads Janice and the open Demo checkout tab, whose
// page button then runs the new scripts, and stopping switches Chrome back to
// the plain build.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { buildExtension } = require('../../scripts/build.js')
const { startReloadServer } = require('../../scripts/reload-server.js')
const { serveFixtures } = require('../../scripts/serve-fixtures.js')
const { waitUntil } = require('../helpers/demo.js')
const { launch } = require('./harness.js')

test("npm start's build reloads itself and the open Demo checkout when a newer build lands, then goes back to the plain build", async () => {
  const reload = await startReloadServer({ port: 0 })
  const server = await serveFixtures({ port: 0 })
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-dev-build-'))
  const build = buildId => buildExtension({ outDir, dev: { reloadPort: reload.port, buildId } })
  build('one')
  reload.setBuild('one')
  const browser = await launch({ extensionDir: outDir })
  try {
    await browser.turnOnDeveloperMode()
    await waitUntil(() => reload.clients() === 1, 10000)
    const page = await browser.context.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/demo-checkout/?spend=20000`)
    const closeButton = label => page.locator(`janice-coupons-launcher button[aria-label="${label}"]`)
    await closeButton('Close').waitFor({ state: 'attached' })

    // A newer build, in which the page button's Close button has another name.
    build('two')
    const launcher = path.join(outDir, 'content', 'launcher.js')
    fs.writeFileSync(launcher, fs.readFileSync(launcher, 'utf8').replace('aria-label="Close"', 'aria-label="Close card"'))
    const reloaded = page.waitForEvent('load')
    assert.equal(reload.setBuild('two'), 1, 'the running copy hears about it')
    await reloaded
    await closeButton('Close card').waitFor({ state: 'attached' })
    await waitUntil(() => reload.clients() === 1, 10000)

    // npm start stopping: the plain build goes back in and Janice reloads with it, and stays disconnected.
    buildExtension({ outDir })
    const plain = browser.context.waitForEvent('serviceworker', worker => worker.url().endsWith('/service-worker.js'))
    assert.equal(reload.finish(), 1)
    await plain
    await waitUntil(() => reload.clients() === 0, 10000)
  } finally {
    await browser.close()
    reload.close()
    server.close()
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})
