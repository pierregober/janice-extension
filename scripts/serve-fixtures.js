#!/usr/bin/env node
// Serves fixtures/ on 127.0.0.1 for manual Demo runs and the browser tests,
// and extension/ under /extension/ for the UI preview:
//   npm run demo   →  http://127.0.0.1:4300/demo-checkout/?spend=20000
//                     http://127.0.0.1:4300/ui-preview/
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const FIXTURES = path.join(__dirname, '..', 'fixtures')
const ROOTS = [
  ['/extension/', path.join(__dirname, '..', 'extension')],
  ['/', FIXTURES],
]
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

function serveFixtures({ port = 4300, host = '127.0.0.1' } = {}) {
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://fixtures.invalid')
    const [prefix, root] = ROOTS.find(([prefix]) => pathname.startsWith(prefix))
    const file = path.normalize(path.join(root, decodeURIComponent(pathname.slice(prefix.length)), pathname.endsWith('/') ? 'index.html' : ''))
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return
    }
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(response)
  })
  return new Promise((resolve, reject) => server.once('error', reject).listen(port, host, () => resolve(server)))
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4300)
  serveFixtures({ port })
    .then(() => {
      console.log(`UI preview (no extension needed): http://127.0.0.1:${port}/ui-preview/`)
      console.log(`Demo checkout: http://127.0.0.1:${port}/demo-checkout/?spend=20000`)
      console.log('Open the Demo checkout in Chrome with Janice Coupons loaded, then use the toolbar button. Ctrl+C stops the server.')
    })
    .catch(error => {
      console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use: is npm start or npm run demo already running?` : error.message)
      process.exitCode = 1
    })
}

module.exports = { serveFixtures }
