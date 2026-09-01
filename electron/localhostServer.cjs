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
 *
 * ## The one write path, and the three conditions on it (2026-09-01)
 *
 * A mount may be declared **writable for exactly one file name**, and a `PUT` of that name into
 * that mount is the only request here that touches the disk. It exists because a hosted Muralista
 * cannot be handed a folder — a `FileSystemDirectoryHandle` is only mintable by
 * `showDirectoryPicker` under a user gesture — so it was being asked, every gig, for a folder
 * Pregonero created and already knows. **A question with one knowable answer is not a question**,
 * and its failure is silent: one level too high and `visuals.json` lands where Pregonero never
 * looks.
 *
 * This is rule 2 of the contract as amended: when Pregonero **hosts** a preparing tool it may also
 * be that tool's **write path**. Rule 1 — *the handoff carries no data* — survives on one condition,
 * and it is enforced here rather than promised:
 *
 * **The bytes are written verbatim, unread.** This server never parses, merges, validates or
 * repairs what arrives. It has no idea what a visuals file contains, and Pregonero learns the
 * mapping afterwards the way it always has, by reading the file. So the wire carries no data *to
 * Pregonero*: it is a write path, not a handoff, and the file is still the truth. **The moment
 * anything here reads the body, this is rule 1 broken rather than bent.**
 *
 * **It refuses anything that is not that file at that place.** Not a writable mount, not a `PUT`,
 * a name that is not the declared one, a path with anything else in it, a body over the cap — all
 * refused, none written.
 */

/**
 * **The cap on a written body.** `visuals.json` is shapes, quads and an assignment table; the
 * backdrop photo and the media are deliberately not in it, so a real one is kilobytes. Sixteen
 * megabytes is far past anything honest and still small enough that a runaway writer is stopped
 * rather than filling a disk.
 */
const MAX_WRITE_BYTES = 16 * 1024 * 1024

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
/** `/a/b/c?x` → `['a','b','c']`, or null when it will not decode. */
function requestParts(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null
  }
  const parts = decoded.split('/').filter((p) => p.length > 0)
  return parts.length === 0 ? null : parts
}

function resolveRequest(mounts, urlPath) {
  const parts = requestParts(urlPath)
  if (parts === null) return null
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
  /** mount name → the one file name a `PUT` may write into it. Absent means read-only. */
  const writable = new Map()
  const readFile = options.readFile || fs.readFile
  const writeFile = options.writeFile || fs.writeFile
  const statSync = options.statSync || fs.statSync
  let server = null
  let port = null

  function refuse(res, status, message) {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(message)
  }

  /**
   * `PUT /<mount>/<the one writable name>` — and nothing else, ever.
   *
   * **The body is never looked at.** It is collected and written. Every check below is about
   * *where* it goes; none of them is about what is in it, which is what keeps this a write path
   * rather than a handoff.
   */
  function handleWrite(req, res) {
    const parts = requestParts(req.url || '/')
    if (parts === null || parts.length !== 2) return refuse(res, 404, 'Not found')
    const allowedName = writable.get(parts[0])
    if (!allowedName) return refuse(res, 405, 'Not writable')
    if (parts[1] !== allowedName) return refuse(res, 403, 'Not the file this mount accepts')
    const target = resolveRequest(mounts, req.url || '/')
    if (target === null) return refuse(res, 404, 'Not found')

    const chunks = []
    let size = 0
    let refused = false
    req.on('data', (chunk) => {
      if (refused) return
      size += chunk.length
      if (size > MAX_WRITE_BYTES) {
        refused = true
        refuse(res, 413, 'Too large')
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (refused) return
      writeFile(target, Buffer.concat(chunks), (err) => {
        if (err) return refuse(res, 500, (err && err.message) || 'Write failed')
        res.writeHead(204)
        res.end()
      })
    })
  }

  function handle(req, res) {
    const method = req.method || 'GET'
    if (method === 'PUT') return handleWrite(req, res)
    if (method !== 'GET' && method !== 'HEAD') return refuse(res, 405, 'Method not allowed')
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
    /**
     * Makes a folder reachable at `/<name>/…`, read-only.
     *
     * `writableFile` opts the mount into the one write path: a `PUT` of exactly that name into
     * exactly this mount. Omit it and the mount cannot be written to at all, which is what every
     * other mount in this app is.
     */
    mount(name, folder, writableFile) {
      mounts.set(name, folder)
      if (writableFile) writable.set(name, writableFile)
      else writable.delete(name)
    },
    unmount(name) {
      mounts.delete(name)
      writable.delete(name)
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

module.exports = { createLocalhostServer, resolveRequest, MAX_WRITE_BYTES }
