#!/usr/bin/env node
// Writes the extension Chrome loads to build/, like the usual extension
// boilerplates:
//   npm run build  →  build once: exactly the files of extension/ (the list
//                     npm run package zips), the build the browser tests load
//   npm start      →  a development build that reloads itself in Chrome after
//                     every change in extension/ (dev-reload.js through
//                     reload-server.js) and also runs on the local Demo
//                     checkout, which it serves with the UI preview
//                     (serve-fixtures.js)
// There is nothing to compile, so a build is a copy.
const fs = require('node:fs')
const path = require('node:path')

const { EXTENSION, extensionFiles } = require('./package.js')
const { serveFixtures } = require('./serve-fixtures.js')
const { startReloadServer } = require('./reload-server.js')

const BUILD = path.join(__dirname, '..', 'build')
const RELOAD_PORT = 4301
const DEV_WORKER = 'dev-reload.js'
// What the development build may also reach: the Demo checkout npm start serves.
const DEMO_ORIGINS = ['http://127.0.0.1/*']

// Deletes what dir holds beyond the kept files (an older build's leftovers, .DS_Store), then emptied folders.
function prune(dir, keep) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      prune(full, keep)
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full)
    } else if (!keep.has(full)) {
      fs.rmSync(full)
    }
  }
}

// The development build's manifest: the reloader as the service worker's entry, and the page button on the
// Demo checkout too.
function devManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'))
  const [launcher, ...others] = manifest.content_scripts
  return {
    ...manifest,
    host_permissions: [...manifest.host_permissions, ...DEMO_ORIGINS],
    content_scripts: [{ ...launcher, matches: [...launcher.matches, ...DEMO_ORIGINS] }, ...others],
    background: { ...manifest.background, service_worker: DEV_WORKER },
  }
}

/**
 * Makes outDir hold exactly the extension's files and returns them. The folder is updated in place, so a build
 * Chrome has loaded never goes missing; a folder that isn't a build is left alone. With dev ({ reloadPort,
 * buildId }) it is npm start's development build.
 */
function buildExtension({ outDir = BUILD, dev = null } = {}) {
  const files = dev ? [...extensionFiles(), DEV_WORKER].sort() : extensionFiles()
  if (fs.existsSync(outDir)) {
    const names = fs.readdirSync(outDir)
    if (names.length > 0 && !names.includes('manifest.json')) {
      throw new Error(`${outDir} is not an extension build (it has no manifest.json), so it was left alone. Move it away and build again.`)
    }
    prune(outDir, new Set(files.map(name => path.join(outDir, name))))
  }
  for (const name of files) {
    const target = path.join(outDir, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (dev && name === 'manifest.json') {
      fs.writeFileSync(target, `${JSON.stringify(devManifest(), null, 2)}\n`)
    } else if (name === DEV_WORKER) {
      const header = `const RELOAD_URL = ${JSON.stringify(`ws://127.0.0.1:${dev.reloadPort}/`)}\nconst BUILD_ID = ${JSON.stringify(dev.buildId)}\n`
      fs.writeFileSync(target, header + fs.readFileSync(path.join(__dirname, DEV_WORKER), 'utf8'))
    } else {
      fs.copyFileSync(path.join(EXTENSION, name), target)
    }
  }
  return { dir: outDir, files }
}

// Rebuilds shortly after the last change in a burst, naming the files that changed; rebuild() says what follows.
// Returns a function that stops watching, a pending rebuild included.
function watch(rebuild) {
  let changed = new Set()
  let timer
  const watcher = fs.watch(EXTENSION, { recursive: true }, (event, name) => {
    if (name && name.split(/[\\/]/).some(part => part.startsWith('.'))) return
    if (name) changed.add(name.split(path.sep).join('/'))
    clearTimeout(timer)
    timer = setTimeout(() => {
      const names = [...changed].join(', ')
      changed = new Set()
      const time = new Date().toLocaleTimeString()
      try {
        const next = rebuild()
        console.log(`${time} Rebuilt build/${names ? ` (${names})` : ''}. ${next}`)
      } catch (error) {
        console.error(`${time} Build failed: ${error.message}`)
      }
    }, 100)
  })
  return () => {
    watcher.close()
    clearTimeout(timer)
  }
}

function printLoadSteps(count, note = '') {
  console.log(`Built build/ from extension/ (${count} files)${note}.

Load it in Chrome, once:
  1. Go to chrome://extensions
  2. Turn on Developer mode
  3. Click Load unpacked
  4. Select ${BUILD}
`)
}

// npm start: the development build, rebuilt and reloaded in Chrome after every change, and the Demo pages.
async function start() {
  const reload = await startReloadServer({ port: RELOAD_PORT }).catch(error => {
    const reason = error.code === 'EADDRINUSE' ? `port ${RELOAD_PORT} is in use (is npm start already running?)` : error.message
    console.log(`Auto-reload is off: ${reason}.\n`)
    return null
  })
  const nextDev = () => reload && { reloadPort: reload.port, buildId: Date.now().toString(36) }

  let dev = nextDev()
  printLoadSteps(buildExtension({ dev }).files.length, reload ? ', with auto-reload' : '')
  if (reload) reload.setBuild(dev.buildId)
  const stopWatching = watch(() => {
    dev = nextDev()
    buildExtension({ dev })
    if (!reload) return 'Click the reload arrow on Janice Coupons in chrome://extensions.'
    return reload.setBuild(dev.buildId) ? 'Reloading Janice in Chrome.' : "Janice isn't connected: click its reload arrow in chrome://extensions once."
  })

  // Stopping puts the plain build back and switches Chrome to it, so nothing keeps trying to reach npm start.
  let isStopping = false
  const stop = () => {
    if (isStopping) return
    isStopping = true
    stopWatching()
    buildExtension()
    const reached = reload?.finish() ?? 0
    console.log(
      `\nStopped. build/ holds the plain build again${reached ? ', and Janice reloaded with it.' : ": click Janice's reload arrow in chrome://extensions to load it."}`,
    )
    setTimeout(() => process.exit(0), 200)
  }
  // Under npm, Ctrl+C arrives twice (from the terminal and forwarded by npm); a handler that stays registered keeps
  // the second from ending the process with the default action halfway through.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop)

  const port = Number(process.env.PORT ?? 4300)
  try {
    await serveFixtures({ port })
    console.log(`Demo checkout: http://127.0.0.1:${port}/demo-checkout/?spend=20000`)
    console.log(`UI preview:    http://127.0.0.1:${port}/ui-preview/`)
  } catch (error) {
    const reason = error.code === 'EADDRINUSE' ? `port ${port} is in use (is npm start or npm run demo already running?)` : error.message
    console.log(`Not serving the Demo checkout and UI preview: ${reason}.`)
  }
  console.log(
    reload
      ? '\nWatching extension/. After each change Janice reloads itself in Chrome, along with open Sharper Image and\nDemo checkout tabs. If Janice was already loaded, click its reload arrow once to connect it. Ctrl+C stops.'
      : '\nWatching extension/. After each rebuild, click the reload arrow on Janice Coupons in chrome://extensions. Ctrl+C stops.',
  )
}

if (require.main === module) {
  if (process.argv.includes('--watch')) {
    void start()
  } else {
    printLoadSteps(buildExtension().files.length)
    console.log('Already loaded? Click the reload arrow on its card in chrome://extensions.')
  }
}

module.exports = { buildExtension, RELOAD_PORT }
