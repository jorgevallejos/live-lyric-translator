const http = require('http')
const fs = require('fs')
const path = require('path')

/**
 * **A localhost server, so hosted tool pages get a secure context.**
 *
 * Muralista's page needs the File System Access API, which requires a secure context — and
 * `file://` does not qualify. `file://` also runs into the `webSecurity` block on media that this
 * repo already hit once and solved with the `media://` protocol. Serving over `http://127.0.0.1`
 * sidesteps both, and it is the same engine Muralista already targets.
 *
 * **This is packaging, not architecture.** It serves bytes off disk from a small set of roots the
 * main process names. No API, no state, no channel: hosting a tool's UI changes where the window
 * is, not who writes what. **The file stays the only channel between tools.**
 *
 * Two things it is careful about:
 *
 * - **A request outside its roots is refused, not followed.** `..` in a URL is the oldest trick
 *   there is, and this process can read the whole disk.
 * - **It binds to `127.0.0.1`, never `0.0.0.0`.** The WebSocket server in this app binds to every
 *   interface because a phone on the same wifi drives it; this one has no such reason, and a venue
 *   is somebody else's network.
 */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
}

function contentType(filePath) {
  return TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/**
 * Resolves `/<mount>/<rest>` against the folder mounted at `<mount>`.
 *
 * Null when there is no such mount, or when the path would leave it. Exported because the refusal
 * is the part worth testing on its own.
 */
function resolveRequest(mounts, urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null
  }
  const parts = decoded.split('/').filter((p) => p.length > 0)
  if (parts.length === 0) return null
  const mount = parts[0]
  const root = mounts.get(mount)
  if (!root) return null
  const rest = parts.slice(1).join('/')
  const base = path.resolve(root)
  const resolved = path.resolve(base, rest === '' ? '.' : rest)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}

/**
 * One server for the whole app, started on first use and left running.
 *
 * `mount(name, folder)` makes a folder reachable at `/<name>/…`; mounting the same name again
 * repoints it, which is what happens when the media folder or a staging directory changes.
 */
function createLocalhostServer(options = {}) {
  const mounts = new Map()
  const readFile = options.readFile || fs.readFile
  const statSync = options.statSync || fs.statSync
  let server = null
  let port = null

  function handle(req, res) {
    const resolved = resolveRequest(mounts, req.url || '/')
    if (resolved === null) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    let target = resolved
    try {
      if (statSync(target).isDirectory()) target = path.join(target, 'index.html')
    } catch {
      /* readFile below reports it */
    }
    readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'content-type': contentType(target), 'cache-control': 'no-store' })
      res.end(data)
    })
  }

  return {
    mount(name, folder) {
      mounts.set(name, folder)
    },
    unmount(name) {
      mounts.delete(name)
    },
    /** Starts on an ephemeral port bound to loopback, and resolves to that port. */
    start() {
      if (port !== null) return Promise.resolve(port)
      return new Promise((resolve, reject) => {
        server = http.createServer(handle)
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port
          resolve(port)
        })
      })
    },
    stop() {
      if (server) server.close()
      server = null
      port = null
    },
    get port() {
      return port
    },
    /** Exposed for tests: the request handler and the path resolution, without a socket. */
    handle,
    resolve: (urlPath) => resolveRequest(mounts, urlPath),
  }
}

module.exports = { createLocalhostServer, resolveRequest }
