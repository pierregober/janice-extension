#!/usr/bin/env node
// Draws the toolbar icons (a white price tag on a tile of Janice's blue accent) as PNGs,
// with no image library: shapes are sampled 4×4 per pixel and encoded
// with node:zlib.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const BLUE = [0x25, 0x57, 0xd6]
const WHITE = [0xff, 0xff, 0xff]
const SAMPLES = 4
const TAG = [
  [0.2, 0.5],
  [0.36, 0.3],
  [0.8, 0.3],
  [0.8, 0.7],
  [0.36, 0.7],
]
const ANGLE = (-35 * Math.PI) / 180

function inRoundedSquare(x, y, radius = 0.22) {
  const dx = Math.max(radius - x, 0, x - (1 - radius))
  const dy = Math.max(radius - y, 0, y - (1 - radius))
  return dx * dx + dy * dy <= radius * radius
}

function inPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inTag(x, y) {
  // Rotate the sample back into the tag's unrotated frame around the centre.
  const cx = x - 0.5
  const cy = y - 0.5
  const ux = cx * Math.cos(-ANGLE) - cy * Math.sin(-ANGLE) + 0.5
  const uy = cx * Math.sin(-ANGLE) + cy * Math.cos(-ANGLE) + 0.5
  const isHole = (ux - 0.37) ** 2 + (uy - 0.5) ** 2 < 0.055 ** 2
  return inPolygon(ux, uy, TAG) && !isHole
}

function draw(size) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tile = 0
      let tag = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size
          const y = (py + (sy + 0.5) / SAMPLES) / size
          if (!inRoundedSquare(x, y)) continue
          tile++
          if (inTag(x, y)) tag++
        }
      }
      const offset = (py * size + px) * 4
      const share = tile === 0 ? 0 : tag / tile
      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(BLUE[channel] * (1 - share) + WHITE[channel] * share)
      }
      pixels[offset + 3] = Math.round((255 * tile) / (SAMPLES * SAMPLES))
    }
  }
  return pixels
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA, no interlace
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, '..', 'extension', 'icons')
fs.mkdirSync(outDir, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, draw(size)))
}
console.log(`Wrote icons to ${path.relative(process.cwd(), outDir) || outDir}`)
