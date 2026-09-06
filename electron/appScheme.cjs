/**
 * **THE SHELL'S OWN ORIGIN.**
 *
 * Tramoya is served from a registered standard scheme rather than loaded from `file://`. **The
 * reason is not tidiness — it is what the framing move needs**, and `file://` was the blocker:
 * Chromium keys storage by top-level site, so a `file://` shell and the http pages it frames or
 * opens share nothing.
 *
 * **Why a scheme and not a port.** The tool server binds an ephemeral port and `localStorage` is
 * keyed by origin **including the port**, so serving the shell from it would make Tramoya forget
 * the artist's name, both folders, the gig list and the setlists **on every launch**. A fixed port
 * repairs that and introduces a new way for the app to fail to launch: something else already has
 * it. **This project has paid for apps that could not start.**
 *
 * **A registered scheme has neither problem, and it was measured before anything was built**
 * (2026-09-06, a spike run twice): the origin is `tramoya://app` with no port and nothing
 * listening; `localStorage` written in one launch is read back in the next; a same-origin frame
 * reaches `window.parent.electronAPI`; and a window that frame opens shares its storage. **The
 * collision failure mode never exists, because nothing listens.**
 *
 * **Nothing is migrated.** The move orphans every key stored under `file://` — the folders, the
 * gig list, the setlists, the languages — which is priced and accepted: the first launch after it
 * is a machine that has answered nothing.
 */
const path = require('node:path')

const APP_SCHEME = 'tramoya'
/** **One host, because a second host would be a second origin and a second `localStorage`.** */
const APP_HOST = 'app'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/**
 * **Registered privileged, or the scheme is not an origin at all.** `standard` is what gives it
 * origin semantics and therefore storage; `secure` is what keeps the File System Access API and
 * the rest of the secure-context surface available, exactly as `http://127.0.0.1` would.
 */
const APP_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
}

/** The one page, with the route in the hash as the app already carries it. */
function appUrl(hash = '') {
  return `${APP_ORIGIN}/index.html${hash}`
}

/**
 * **Which file in the served root a request names, or `null`.**
 *
 * The two refusals are `localhostServer.cjs`'s, for the same reason: a served root is a root, and a
 * request that would leave it is refused rather than followed. The host is checked too — a second
 * host is a second origin, which is the failure the port had.
 */
function resolveAppRequest(root, requestUrl) {
  let url
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${APP_SCHEME}:`) return null
  if (url.hostname !== APP_HOST) return null

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname === '' || pathname === '/') pathname = '/index.html'

  const target = path.resolve(root, `.${pathname}`)
  const rooted = path.resolve(root)
  if (target !== rooted && !target.startsWith(rooted + path.sep)) return null
  return target
}

module.exports = { APP_SCHEME, APP_HOST, APP_ORIGIN, APP_PRIVILEGES, appUrl, resolveAppRequest }
