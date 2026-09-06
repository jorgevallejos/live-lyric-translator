/** @vitest-environment node */
/**
 * **THE SHELL'S OWN ORIGIN**, and the reason it is a registered scheme rather than a port.
 *
 * **Measured before anything was built** (2026-09-06), because the alternative had a failure mode
 * this project has already paid for eight times in one week — an app that will not start.
 *
 * The http spike proved that serving the shell from a local origin removes both framing blockers:
 * a same-origin frame shares `localStorage` with the projection window it opens, and reaches
 * `window.parent.electronAPI` directly. **But its server binds an ephemeral port, and
 * `localStorage` is keyed by origin INCLUDING the port** — so Tramoya would forget the artist's
 * name, both folders, the gig list and the setlists on every launch. A fixed port repairs that and
 * **introduces a new way for the app to fail to launch: something else already has it.**
 *
 * **A registered standard scheme has neither problem, and it was measured rather than assumed.**
 * A second spike, run twice:
 *
 * | | |
 * |---|---|
 * | shell origin | `tramoya://app` — **no port, nothing listening** |
 * | `localStorage` written in one launch, read in the next | **yes** |
 * | a same-origin frame reaching `window.parent.electronAPI` | **`pong-from-main-process`** |
 * | a window opened by that frame sharing its `localStorage` | **yes** |
 *
 * **So the collision failure mode never exists.** Nothing listens; there is no port to take.
 *
 * **What this module is:** the origin, the URL the windows load, and the one question the handler
 * asks — *which file in the served root does this request name, and does it stay inside it*.
 */
import { describe, it, expect } from 'vitest'
import { sep, join } from 'node:path'
import {
  APP_HOST,
  APP_ORIGIN,
  APP_SCHEME,
  appUrl,
  playerUrl,
  resolveAppRequest,
} from './appScheme.cjs'

const ROOT = join(sep, 'app', 'dist')

describe('the origin', () => {
  it('is a scheme and a host, with no port for anything to collide with', () => {
    expect(APP_SCHEME).toBe('tramoya')
    expect(APP_HOST).toBe('app')
    expect(APP_ORIGIN).toBe('tramoya://app')
    expect(APP_ORIGIN).not.toMatch(/:\d/)
  })

  it('names two pages on one origin, and carries the route in the hash', () => {
    // **Two pages, because there are two products** — and one origin, because that is what lets
    // the frame reach the embedder's bridge and share storage with the projection window.
    expect(appUrl()).toBe('tramoya://app/index.html')
    expect(playerUrl()).toBe('tramoya://app/player.html')
    expect(playerUrl('#/projection')).toBe('tramoya://app/player.html#/projection')
    expect(new URL(appUrl()).origin).toBe(new URL(playerUrl()).origin)
  })
})

describe('what a request names', () => {
  it('serves the entry for the root', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/')).toBe(join(ROOT, 'index.html'))
    expect(resolveAppRequest(ROOT, 'tramoya://app')).toBe(join(ROOT, 'index.html'))
  })

  it('serves the player’s page, which is the frame’s src and the wall’s url', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/player.html')).toBe(join(ROOT, 'player.html'))
  })

  it('serves a built asset by its own path', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/assets/index-abc.js')).toBe(
      join(ROOT, 'assets', 'index-abc.js')
    )
    expect(resolveAppRequest(ROOT, 'tramoya://app/fonts/eb-garamond/a.woff2')).toBe(
      join(ROOT, 'fonts', 'eb-garamond', 'a.woff2')
    )
  })

  it('decodes a percent-encoded name, because a real file has spaces in it', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/icons/a%20b.png')).toBe(
      join(ROOT, 'icons', 'a b.png')
    )
  })

  it('ignores a query and a hash, which are the page’s and not the file’s', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/index.html#/projection')).toBe(
      join(ROOT, 'index.html')
    )
    expect(resolveAppRequest(ROOT, 'tramoya://app/index.html?x=1')).toBe(join(ROOT, 'index.html'))
  })

  /**
   * **The refusal `localhostServer.cjs` makes, for the same reason**: a served root is a root, and
   * a request that would leave it is refused rather than followed.
   *
   * **Most traversals cannot reach here at all**, and that is worth writing down rather than
   * assuming. `new URL` normalises a standard scheme's path first, and the URL spec treats `%2e`
   * as a dot segment — so `../`, `%2e%2e/` and every mixture of them arrive already flattened to
   * `/secrets`, inside the root.
   *
   * **What survives is an encoded SLASH.** `%2f` is not a separator to the parser, so
   * `/%2e%2e%2f%2e%2e%2fsecrets` reaches this module intact and becomes `../../secrets` the moment
   * it is decoded. **That is why the check is after the decode**, and it is the one case the guard
   * is actually for.
   */
  it('sees traversals already flattened by the URL parser, dots and %2e alike', () => {
    for (const attempt of [
      'tramoya://app/../secrets',
      'tramoya://app/assets/../../secrets',
      'tramoya://app/%2e%2e/secrets',
      'tramoya://app/a/%2e%2e/%2e%2e/secrets',
    ]) {
      expect(resolveAppRequest(ROOT, attempt), attempt).toBe(join(ROOT, 'secrets'))
    }
  })

  it('refuses the one form that reaches it intact: an encoded slash', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://app/%2e%2e%2f%2e%2e%2fsecrets')).toBeNull()
    expect(resolveAppRequest(ROOT, 'tramoya://app/assets%2f..%2f..%2fsecrets')).toBeNull()
  })

  /**
   * **One host, because the origin is the whole point.** `tramoya://elsewhere/` is a different
   * origin, and a second origin is a second `localStorage` — the exact failure the port had.
   */
  it('refuses any host but its own', () => {
    expect(resolveAppRequest(ROOT, 'tramoya://elsewhere/index.html')).toBeNull()
    expect(resolveAppRequest(ROOT, 'tramoya://app.evil/index.html')).toBeNull()
  })

  it('refuses another scheme outright rather than guessing', () => {
    expect(resolveAppRequest(ROOT, 'file:///app/dist/index.html')).toBeNull()
    expect(resolveAppRequest(ROOT, 'http://app/index.html')).toBeNull()
  })

  it('refuses something that is not a URL at all', () => {
    expect(resolveAppRequest(ROOT, 'not a url')).toBeNull()
    expect(resolveAppRequest(ROOT, '')).toBeNull()
  })
})
