// The unpacked extension as Chrome loads it: manifest, permissions, files.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const { ROOT, read, CONTENT_SCRIPTS } = require('./helpers/demo.js')
const { packageExtension, extensionFiles } = require('../scripts/package.js')
const { buildExtension } = require('../scripts/build.js')

const manifest = JSON.parse(read('extension/manifest.json'))
const extensionFile = file => path.join(ROOT, 'extension', file)

test('Manifest V3 named from the editable defaults, opened from the toolbar', () => {
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.name, 'Janice Coupons')
  assert.equal(manifest.action.default_popup, 'popup/popup.html')
  assert.equal(manifest.background.service_worker, 'service-worker.js')
})

test('minimal permissions: activeTab, scripting and storage; host access to sharperimage.com only, where the page button runs', () => {
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage'])
  assert.deepEqual(manifest.host_permissions, ['https://sharperimage.com/*'])
  assert.equal(manifest.optional_host_permissions, undefined)
  assert.equal(manifest.web_accessible_resources, undefined)
  assert.equal(manifest.externally_connectable, undefined)

  // The only script that runs by itself is the page button, in the top frame of the store's pages; the checkout
  // logic is still injected only when the popup or the button's card asks.
  assert.equal(manifest.content_scripts.length, 1)
  const [launcher] = manifest.content_scripts
  assert.deepEqual(launcher.matches, ['https://sharperimage.com/*'])
  assert.deepEqual(launcher.js, ['shared/money.js', 'shared/messages.js', 'shared/icons.js', 'content/stores.js', 'content/launcher.js', 'content/launcher-main.js'])
  assert.equal(launcher.run_at, 'document_idle')
  assert.equal(launcher.all_frames, undefined)
  assert.equal(launcher.css, undefined)
})

test('only the store and the local Demo hosts are ever injected into', () => {
  const { isCandidateHost } = require('../extension/content/stores.js')
  for (const host of ['sharperimage.com', 'www.sharperimage.com', 'SharperImage.com', 'localhost', '127.0.0.1']) assert.equal(isCandidateHost(host), true, host)
  for (const host of ['example.com', 'sharperimage.com.example.net', 'shop.sharperimage.co', '[::1]', '']) assert.equal(isCandidateHost(host), false, host)
})

test('every file the extension loads exists', () => {
  const imported = /importScripts\(([^)]*)\)/.exec(read('extension/service-worker.js'))[1].match(/'[^']+'/g).map(name => name.slice(1, -1))
  const popupScripts = [...read('extension/popup/popup.html').matchAll(/src="\.\.\/([^"]+)"|src="([^"]+)"/g)].map(match => match[1] ?? `popup/${match[2]}`)
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    'popup/popup.css',
    'data/mock-coupons.json',
    ...Object.values(manifest.icons),
    ...imported,
    ...CONTENT_SCRIPTS,
    'content/main.js',
    ...manifest.content_scripts.flatMap(script => script.js),
    ...popupScripts,
  ]
  for (const file of files) assert.ok(fs.existsSync(extensionFile(file)), `${file} is missing`)
})

test('all executable code is bundled: no remote scripts, eval or network calls', () => {
  const sources = []
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(js|html)$/.test(entry.name)) {
        const code = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        sources.push([path.relative(ROOT, full), code])
      }
    }
  }
  walk(path.join(ROOT, 'extension'))
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /<script[^>]+src="https?:/i, file)
    assert.doesNotMatch(source, /\beval\(|new Function\(/, file)
    for (const call of source.match(/fetch\([^)]*\)/g) ?? []) {
      assert.match(call, /chrome\.runtime\.getURL/, `${file}: only bundled files are fetched (${call})`)
    }
  }
})

// Reads a zip's entries back through its central directory, checking each CRC.
function readZip(archive) {
  const end = archive.length - 22
  assert.equal(archive.readUInt32LE(end), 0x06054b50, 'end of central directory')
  const entries = []
  let cursor = archive.readUInt32LE(end + 16)
  for (let index = 0; index < archive.readUInt16LE(end + 10); index++) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50, 'central directory entry')
    const method = archive.readUInt16LE(cursor + 10)
    const crc = archive.readUInt32LE(cursor + 16)
    const size = archive.readUInt32LE(cursor + 20)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const local = archive.readUInt32LE(cursor + 42)
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28)
    const body = archive.subarray(start, start + size)
    const data = method === 8 ? zlib.inflateRawSync(body) : body
    assert.equal(zlib.crc32(data), crc, `${name}: CRC`)
    entries.push({ name, data })
    cursor += 46 + nameLength + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32)
  }
  return entries
}

test('npm run package: a zip of exactly the extension, byte for byte, with manifest.json at the root', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-package-'))
  try {
    const { file, files } = packageExtension({ outDir })
    assert.equal(path.basename(file), `janice-coupons-${manifest.version}.zip`)
    const entries = readZip(fs.readFileSync(file))
    assert.deepEqual(entries.map(entry => entry.name), files)
    assert.ok(files.includes('manifest.json'), 'manifest.json at the root')
    assert.ok(files.includes('popup/popup.html') && files.includes('content/panel.js'))
    assert.ok(!files.some(name => name.startsWith('.') || name.includes('/.')), 'no hidden files')
    for (const { name, data } of entries) assert.ok(data.equals(fs.readFileSync(extensionFile(name))), `${name} differs`)
    assert.ok(fs.readFileSync(file).equals(fs.readFileSync(packageExtension({ outDir }).file)), 'the same files give the same zip')
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})

// Every file under dir, hidden ones included, as sorted forward-slash paths.
const filesIn = dir =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()

test('npm run build: build/ holds exactly the extension, byte for byte, and a rebuild updates it in place', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-build-'))
  try {
    const { files } = buildExtension({ outDir })
    assert.deepEqual(filesIn(outDir), files)
    assert.ok(files.includes('manifest.json') && files.includes('popup/popup.html'), 'manifest.json at the root')
    for (const name of files) assert.ok(fs.readFileSync(path.join(outDir, name)).equals(fs.readFileSync(extensionFile(name))), `${name} differs`)

    // An older build's leftovers go and edited files are put back, without replacing the folder Chrome loaded.
    const folder = fs.statSync(outDir).ino
    fs.writeFileSync(path.join(outDir, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(outDir, 'popup', '.DS_Store'), '')
    fs.mkdirSync(path.join(outDir, 'old', 'nested'), { recursive: true })
    fs.writeFileSync(path.join(outDir, 'old', 'nested', 'removed.js'), '')
    buildExtension({ outDir })
    assert.deepEqual(filesIn(outDir), files)
    assert.equal(fs.existsSync(path.join(outDir, 'old')), false, 'emptied folders are removed')
    assert.equal(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'), read('extension/manifest.json'))
    assert.equal(fs.statSync(outDir).ino, folder)
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})

test('npm run build leaves alone a folder that is not a build', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-build-'))
  try {
    fs.writeFileSync(path.join(outDir, 'notes.txt'), 'keep me')
    assert.throws(() => buildExtension({ outDir }), /not an extension build/)
    assert.deepEqual(fs.readdirSync(outDir), ['notes.txt'])
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})

test('npm start: the development build adds only the reloader, and the Demo checkout for the page button', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'janice-build-'))
  try {
    const { files } = buildExtension({ outDir, dev: { reloadPort: 4999, buildId: 'test-build' } })
    assert.deepEqual(files, [...extensionFiles(), 'dev-reload.js'].sort())
    assert.deepEqual(filesIn(outDir), files)
    for (const name of files.filter(name => !['manifest.json', 'dev-reload.js'].includes(name))) {
      assert.ok(fs.readFileSync(path.join(outDir, name)).equals(fs.readFileSync(extensionFile(name))), `${name} differs`)
    }
    const [launcher] = manifest.content_scripts
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')), {
      ...manifest,
      host_permissions: ['https://sharperimage.com/*', 'http://127.0.0.1/*'],
      content_scripts: [{ ...launcher, matches: ['https://sharperimage.com/*', 'http://127.0.0.1/*'] }],
      background: { service_worker: 'dev-reload.js' },
    })
    const worker = fs.readFileSync(path.join(outDir, 'dev-reload.js'), 'utf8')
    assert.ok(worker.startsWith('const RELOAD_URL = "ws://127.0.0.1:4999/"\nconst BUILD_ID = "test-build"\n'))
    assert.match(worker, /^importScripts\('service-worker\.js'\)$/m, 'the real service worker runs inside it')

    // A plain build over it, as when npm start stops, takes all of that out again.
    buildExtension({ outDir })
    assert.deepEqual(filesIn(outDir), extensionFiles())
    assert.equal(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'), read('extension/manifest.json'))
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
})
