// The reload channel npm start serves for its development build: a minimal
// WebSocket server on 127.0.0.1. It tells each connected copy of Janice the
// current build when it connects and again after every rebuild; a copy
// running an older build reloads itself (scripts/dev-reload.js). "final"
// tells it to reload once more, into the plain build npm start leaves when
// it stops. Only extension pages may connect, and nothing they send is acted
// on. A "ping" every 20 s keeps Chrome from stopping the connected service
// worker.
const crypto = require('node:crypto')
const http = require('node:http')

const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

// A final, unmasked text frame; every message here is shorter than 126 bytes.
const textFrame = text => Buffer.concat([Buffer.from([0x81, Buffer.byteLength(text)]), Buffer.from(text)])
const CLOSE_FRAME = Buffer.from([0x88, 0x00])

/** Resolves once listening, with setBuild(id) and finish(), each → how many copies it reached, clients() and close(). */
function startReloadServer({ port = 4301, host = '127.0.0.1', keepAliveMs = 20000 } = {}) {
  const sockets = new Set()
  let build = null
  const send = message => {
    for (const socket of sockets) socket.write(textFrame(message))
    return sockets.size
  }

  const server = http.createServer((request, response) => response.writeHead(426, { 'Content-Type': 'text/plain' }).end('WebSocket only'))
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key']
    if (!key || request.headers.upgrade?.toLowerCase() !== 'websocket' || !String(request.headers.origin).startsWith('chrome-extension://')) {
      socket.destroy()
      return
    }
    const accept = crypto.createHash('sha1').update(key + HANDSHAKE_GUID).digest('base64')
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'))
    sockets.add(socket)
    if (build) socket.write(textFrame(`build:${build}`))
    // The extension sends nothing but a close frame, which is answered by closing.
    socket.on('data', chunk => (chunk[0] & 0x0f) === 0x8 && socket.end(CLOSE_FRAME))
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => sockets.delete(socket))
  })

  const keepAlive = setInterval(() => send('ping'), keepAliveMs)
  keepAlive.unref()
  return new Promise((resolve, reject) =>
    server.once('error', reject).listen(port, host, () =>
      resolve({
        port: server.address().port,
        setBuild(id) {
          build = id
          return send(`build:${id}`)
        },
        finish() {
          clearInterval(keepAlive)
          const reached = sockets.size
          for (const socket of sockets) socket.end(textFrame('final'))
          server.close()
          return reached
        },
        clients: () => sockets.size,
        close() {
          clearInterval(keepAlive)
          for (const socket of sockets) socket.destroy()
          server.close()
        },
      }),
    ),
  )
}

module.exports = { startReloadServer }
