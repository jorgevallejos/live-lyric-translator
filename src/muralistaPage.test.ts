/**
 * **Muralista's page is a cache, not a fork.**
 *
 * The four files it takes to serve `mapper.html` are Muralista's, byte for byte, at the tag in
 * `src/vendor/muralista-page.source.json`. **This test is what demotes the copy from a fork to a
 * cache** — the same device that already covers `warp.js` and the stand-ins, for the same reason:
 * a copy nobody can prove is current is a fork that has not been noticed yet.
 *
 * **Never edit these files here.** A fix goes into Muralista and is re-vendored; the tag is what
 * moves. If this test fails, either the vendored copy was edited — which is the thing it exists to
 * catch — or Muralista moved and the tag has not.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import page from './vendor/muralista-page.source.json'
import warp from './vendor/warp.source.json'
import fixtures from './vendor/muralista-fixtures.source.json'

const here = dirname(fileURLToPath(import.meta.url))

function sha256(name: string): string {
  return createHash('sha256').update(readFileSync(join(here, 'vendor', name))).digest('hex')
}

describe('the vendored Muralista page', () => {
  it('is byte for byte what the recorded tag holds', () => {
    for (const [name, expected] of Object.entries(page.files)) {
      expect(`${name}:${sha256(name)}`).toBe(`${name}:${expected}`)
    }
  })

  it('names the whole page, so another file cannot arrive unrecorded', () => {
    // **This is the assertion that earned itself three times.** `stageCapture.js` arrived at
    // Muralista's `v1.8.0`, `modes.js` at `v1.19.0`, and `assetName.js` at `v1.22.0` — and
    // `mapper.js` imports each of them the way it imports `warp.js`, so a page served without one
    // throws on load with every other hash green. **A list asserted whole is what turns that into
    // a red test instead of a blank window at a projector.**
    expect(Object.keys(page.files).sort()).toEqual([
      'assetName.js',
      'mapper.css',
      'mapper.html',
      'mapper.js',
      'modes.js',
      'stageCapture.js',
      'warp.js',
    ])
  })

  it('holds every vendored file at ONE tag', () => {
    // `mapper.js` imports `./warp.js`, so a served page whose two halves came from different tags
    // is a page running against a module it was never tested with. Vendoring the page is what
    // forced this into the open: mapper.js was at v1.6.0 while warp.js was recorded at v1.4.0.
    expect(warp.tag).toBe(page.tag)
    expect(fixtures.tag).toBe(page.tag)
  })

  it('serves the page and nothing but the page', () => {
    // `media/` is 90 MB of Muralista's own test clips and `white.html` is a test page. Vendoring
    // the page is what stops them being served at all.
    expect(page.notVendored).toContain('media/')
    expect(() => readFileSync(join(here, 'vendor', 'white.html'))).toThrow()
  })
})
