// npm start's reload channel, spoken to over a bare socket. The browser test
// tests/e2e/dev-reload.test.js has the development build use it in Chromium.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const net = require('node:net')

const { startReloadServer } = require('../scripts/reload-server.js')
const { waitUntil } = require('./helpers/demo.js')

// A WebSocket handshake from origin. Resolves with the response head (null when turned away) and the text of
// every frame received since.
function connect(port, origin) {
  const key = crypto.randomBytes(16).toString('base64')
  const socket = net.connect(port, '127.0.0.1')
  const client = { key, head: null, texts: [], socket }
  let buffer = Buffer.alloc(0)
  return new Promise((resolve, reject) => {
    socket.on('connect', () =>
      socket.write(
        ['GET / HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', `Origin: ${origin}`, '', ''].join('\r\n'),
      ),
    )
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      if (!client.head) {
        const end = buffer.indexOf('\r\n\r\n')
        if (end === -1) return
        client.head = buffer.subarray(0, end).toString()
        buffer = buffer.subarray(end + 4)
        resolve(client)
      }
      // Unmasked text frames shorter than 126 bytes, as the server sends.
      while (buffer.length >= 2 && buffer.length >= 2 + buffer[1]) {
        assert.equal(buffer[0], 0x81, 'a final text frame')
        client.texts.push(buffer.subarray(2, 2 + buffer[1]).toString())
        buffer = buffer.subarray(2 + buffer[1])
      }
    })
    socket.on('close', () => resolve(client))
    socket.on('error', reject)
  })
}

test('reload channel: only extension pages may connect; they hear the current build at once, each new one, and "final"', async () => {
  const reload = await startReloadServer({ port: 0, keepAliveMs: 30 })
  try {
    const page = await connect(reload.port, 'https://example.com')
    assert.equal(page.head, null, 'a web page is turned away')

    reload.setBuild('one')
    const janice = await connect(reload.port, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop')
    const headers = janice.head.split('\r\n')
    assert.equal(headers[0], 'HTTP/1.1 101 Switching Protocols')
    const accept = crypto.createHash('sha1').update(`${janice.key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    assert.ok(headers.includes(`Sec-WebSocket-Accept: ${accept}`))
    assert.equal(reload.clients(), 1)

    const builds = () => janice.texts.filter(text => text !== 'ping')
    await waitUntil(() => builds().length === 1)
    assert.equal(reload.setBuild('two'), 1)
    await waitUntil(() => builds().length === 2)
    await waitUntil(() => janice.texts.includes('ping'), 1000)
    assert.equal(reload.finish(), 1)
    await waitUntil(() => builds().length === 3)
    assert.deepEqual(builds(), ['build:one', 'build:two', 'final'])
    await waitUntil(() => janice.socket.destroyed || janice.socket.readableEnded)
  } finally {
    reload.close()
  }
})
