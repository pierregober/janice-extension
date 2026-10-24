#!/usr/bin/env node
// Zips extension/ into dist/janice-coupons-<version>.zip, manifest.json at
// the root, for handing the unpacked build to someone else. No zip library:
// entries are deflated with node:zlib, and fixed timestamps make the same
// files always give the same archive.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EXTENSION = path.join(__dirname, '..', 'extension')
const DIST = path.join(__dirname, '..', 'dist')
// 2026-01-01 as an MS-DOS date; the time field stays 0 (midnight).
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

// Little-endian fields, as zip stores them.
const u16 = value => {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}
const u32 = value => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

const walk = dir =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))

/** Paths of the extension's files, relative and with forward slashes, sorted; dotfiles are left out. */
function extensionFiles() {
  return walk(EXTENSION)
    .map(file => path.relative(EXTENSION, file).split(path.sep).join('/'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function zip(entries) {
  const records = []
  const directory = []
  let offset = 0
  for (const { name, data } of entries) {
    const fileName = Buffer.from(name, 'utf8')
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const isStored = deflated.length >= data.length
    const body = isStored ? data : deflated
    // The fields the local header and the central directory share, from "version needed" to "extra length".
    const shared = Buffer.concat([
      u16(20), // version needed: 2.0
      u16(0x0800), // names are UTF-8
      u16(isStored ? 0 : 8),
      u16(0),
      u16(DOS_DATE),
      u32(zlib.crc32(data)),
      u32(body.length),
      u32(data.length),
      u16(fileName.length),
      u16(0),
    ])
    const record = Buffer.concat([u32(0x04034b50), shared, fileName, body])
    // Made by Unix 2.0; no comment, disk 0, no internal attributes; a regular rw-r--r-- file.
    directory.push(Buffer.concat([u32(0x02014b50), u16(0x0314), shared, u16(0), u16(0), u16(0), u32(0o100644 * 0x10000), u32(offset), fileName]))
    records.push(record)
    offset += record.length
  }
  const centralDirectory = Buffer.concat(directory)
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralDirectory.length), u32(offset), u16(0)])
  return Buffer.concat([...records, centralDirectory, end])
}

/** Writes the zip and returns its path and the files it holds. */
function packageExtension({ outDir = DIST } = {}) {
  const { version } = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'))
  const files = extensionFiles()
  const archive = zip(files.map(name => ({ name, data: fs.readFileSync(path.join(EXTENSION, name)) })))
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `janice-coupons-${version}.zip`)
  fs.writeFileSync(file, archive)
  return { file, files }
}

if (require.main === module) {
  const { file, files } = packageExtension()
  console.log(`${path.relative(process.cwd(), file)}: ${files.length} files, manifest.json at the root.`)
  console.log('Unzip it and choose the unzipped folder with Load unpacked at chrome://extensions (Developer mode on).')
}

module.exports = { packageExtension, extensionFiles, EXTENSION }
