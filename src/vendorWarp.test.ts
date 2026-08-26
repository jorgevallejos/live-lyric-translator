/**
 * **The test that makes the vendored `warp.js` a cache and not a fork.**
 *
 * It answers one question and only one: *are these still the bytes that were taken from the tag
 * written down beside them?* It cannot answer whether those bytes are **correct** — only Muralista
 * can, because only Muralista has the camera and can close the loop against a real wall. A hash
 * test is meaningful precisely because the file it hashes was verified where it was written, which
 * is why Muralista runs the contract test in its own CI from `v1.4.1` and why this repo running it
 * was never a substitute for that.
 *
 * The other half of the enforcement is `src/vendor/warp.test.mjs` — Muralista's own contract test,
 * vendored unchanged and run by `npm run test:warp`. Together: the maths has not changed, and the
 * two copies are the same maths.
 *
 * If this test fails, do **not** update the digest to match the file. Either the copy was edited in
 * place — which the folder's README forbids — or a genuine change landed in Muralista, and then the
 * copy and the tag move together.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import source from './vendor/warp.source.json'

// The real bytes on disk, not the module graph's view of them: `import`ing `warp.js` would tell
// us what a bundler made of it, and the question here is what is checked in.
function vendoredBytes(name: string): Buffer {
  return readFileSync(resolve(process.cwd(), 'src/vendor', name))
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('the vendored warp module', () => {
  it('is byte-identical to the Muralista copy it records', () => {
    expect(sha256(vendoredBytes(source.module))).toBe(source.sha256)
  })

  it('names the tag it was taken from, not a branch or a date', () => {
    // "main" and "sometime in August" both fail to answer *which Muralista is this meant to
    // match*, which is the only question the digest above is useful for.
    expect(source.owner).toBe('muralista')
    expect(source.path).toBe('mapper/warp.js')
    expect(source.tag).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('carries Muralista’s own contract test, from the same tag', () => {
    expect(source.testTag).toBe(source.tag)
    expect(vendoredBytes(source.test).length).toBeGreaterThan(0)
  })
})
