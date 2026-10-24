#!/usr/bin/env node
// Copies the user-supplied dataset (data/mock-coupons.json) into the
// extension, which can only read files inside its own folder.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'data', 'mock-coupons.json')
const target = path.join(root, 'extension', 'data', 'mock-coupons.json')

JSON.parse(fs.readFileSync(source, 'utf8')) // refuse to copy malformed data
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.copyFileSync(source, target)
console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`)
