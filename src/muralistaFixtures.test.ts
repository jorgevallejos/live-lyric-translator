/**
 * **The test that makes the vendored `mapper.js` a cache and not a hand-copy.**
 *
 * It answers the question the old `worstCase.ts` could not: *are these still the bytes Muralista
 * emits its boundary from?* The previous arrangement was a verbatim hand-copy of one stand-in with
 * its numbers typed in beside it. Muralista replaced that stand-in on 2026-08-27 and **nothing
 * here went red** — the copy was a day stale and the suite still reported agreement.
 *
 * This is the third time this repo has faced the same problem and the third time the answer is the
 * one `warp.js` already uses: vendor by tag, record a digest, test the digest, never edit the
 * copy. See `src/vendorWarp.test.ts` for the other half of that pattern.
 *
 * If this test fails, do **not** update the digest to match the file. Either the copy was edited
 * in place — which the folder's README forbids — or a genuine change landed in Muralista, and then
 * the copy, the digest and the tag move together, and the numbers in the vault are re-measured.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import source from './vendor/muralista-fixtures.source.json'
import {
  MURALISTA_FIXTURE_TAG,
  MURALISTA_INTRO_STAND_IN,
  MURALISTA_LYRICS_STAND_IN,
  vendoredMapperSource,
} from './muralistaFixtures'

function vendoredBytes(name: string): Buffer {
  return readFileSync(resolve(process.cwd(), 'src/vendor', name))
}

describe('the vendored Muralista fixtures', () => {
  it('are read out of a file byte-identical to the Muralista copy it records', () => {
    const digest = createHash('sha256').update(vendoredBytes(source.module)).digest('hex')
    expect(digest).toBe(source.sha256)
  })

  it('name the tag they were taken from, not a branch or a date', () => {
    // "main" and "sometime in August" both fail to answer *which Muralista is this meant to
    // match*, which is the only question the digest above is useful for.
    expect(source.owner).toBe('muralista')
    expect(source.path).toBe('mapper/mapper.js')
    expect(source.tag).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(MURALISTA_FIXTURE_TAG).toBe(source.tag)
  })

  it('are the two stand-ins the manifest says they are', () => {
    expect(source.fixtures).toEqual(['LYRICS_PREVIEW_TEXT', 'INTRO_PLACEHOLDER'])
  })
})

describe('reading a stand-in out of the vendored source', () => {
  it('gets the lyrics stand-in as the value Muralista evaluates, escapes and all', () => {
    // Evaluated rather than pattern-matched, so `\n` is a newline here and not two characters.
    // The check is structural: whatever the string is, it is the one the file declares.
    const declared = vendoredMapperSource().includes(
      `const LYRICS_PREVIEW_TEXT =\n  '${MURALISTA_LYRICS_STAND_IN.replace(/\n/g, '\\n')}';`
    )
    expect(declared).toBe(true)
  })

  it('gets all three parts of the intro stand-in', () => {
    const text = vendoredMapperSource()
    for (const part of ['annotation', 'title', 'tagline'] as const) {
      expect(MURALISTA_INTRO_STAND_IN[part].length).toBeGreaterThan(0)
      expect(text).toContain(MURALISTA_INTRO_STAND_IN[part])
    }
  })

  it('keeps the two apart — replacing one must never look like replacing the other', () => {
    expect(MURALISTA_LYRICS_STAND_IN).not.toBe(MURALISTA_INTRO_STAND_IN.tagline)
  })
})
