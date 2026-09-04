/**
 * **Muralista's stand-in text, read out of the vendored copy rather than typed in again.**
 *
 * This module exists because typing them in again is exactly what went wrong. `worstCase.ts` used
 * to carry a hand-copy of `LYRICS_PREVIEW_TEXT` with its numbers hardcoded beside it. Muralista
 * replaced that string on 2026-08-27 (`v1.5.0`) and **every test here stayed green** — Pregonero
 * spent a day validating against a boundary that no longer existed, and nothing could have said
 * so. A test that cannot notice its fixture changed is worse than no test, because it reports
 * confidence it does not have.
 *
 * So the fixtures come from `src/vendor/mapper.js`, which is Muralista's file byte for byte at the
 * tag recorded in `src/vendor/muralista-fixtures.source.json`, and `src/muralistaFixtures.test.ts`
 * hashes it. Same shape as the warp: **a cache, not a fork.** A fix goes into Muralista and comes
 * back across; nothing in `src/vendor` is ever edited here.
 *
 * **THERE WERE TWO STAND-INS AND THEY WERE INDEPENDENT**, which is why this module is plural:
 *
 * - `LYRICS_PREVIEW_TEXT` — one string, the default of an editable field, seeding a `song-lyrics`
 *   slot. Its one consumer in Muralista is `setLayerType()`. **This is the one that is left.**
 * - `INTRO_PLACEHOLDER` — three strings, everything Muralista's intro card painted. Gone with the
 *   card on 2026-09-04, along with the type it belonged to.
 *
 * Replacing one never moved the other, which is why `v1.5.0` fixed the lyrics one and left the
 * intro one un-measured until `v1.6.0`.
 *
 * **TOOLING ONLY — never import this, or `worstCase.ts`, into the app.** It reads a 300 KB file
 * off disk with `node:fs`. It is meant for tests and for the hand-run measurements that decide
 * whether Muralista's boundary still holds.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import source from './vendor/muralista-fixtures.source.json'

/** The vendored bytes on disk — what is checked in, not what a bundler made of it. */
export function vendoredMapperSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/vendor', source.module), 'utf8')
}

/**
 * Evaluates one top-level `const` declaration out of the vendored file.
 *
 * **Evaluated rather than pattern-matched**, because the values carry escapes (`\n` in the lyrics
 * stand-in) and quote marks, and a regex that re-implements JavaScript string literals would be a
 * third place for the fixture to go quietly wrong. `new Function` on a hashed, checked-in file is
 * the narrow version of that risk, and it runs only in tests.
 *
 * It takes the **shortest prefix ending at a `;` that parses as an expression**, so it survives
 * reformatting, a value gaining a line, or a `;` appearing inside a string. What it does not
 * survive is the declaration disappearing or changing shape — and that should throw, loudly,
 * rather than fall back to something.
 */
export function readDeclaration(sourceText: string, name: string): unknown {
  const head = `\nconst ${name} =`
  const start = sourceText.indexOf(head)
  if (start < 0) {
    throw new Error(
      `Muralista's \`${name}\` is not in the vendored ${source.module}. Either it was renamed or ` +
        `removed upstream, or the wrong file was vendored — check ${source.owner} ${source.tag}.`
    )
  }
  const body = sourceText.slice(start + head.length)
  for (let end = body.indexOf(';'); end >= 0; end = body.indexOf(';', end + 1)) {
    try {
      return new Function(`return (${body.slice(0, end)})`)()
    } catch {
      // Not a complete expression yet — the `;` was inside a string or a nested literal.
    }
  }
  throw new Error(`Could not evaluate Muralista's \`${name}\` out of the vendored ${source.module}.`)
}

/**
 * `LYRICS_PREVIEW_TEXT` — the stand-in a `song-lyrics` slot is seeded with, and the one the
 * boundary in `shapeTextLayout.ts` is tuned against.
 */
export const MURALISTA_LYRICS_STAND_IN: string = (() => {
  const value = readDeclaration(vendoredMapperSource(), 'LYRICS_PREVIEW_TEXT')
  if (typeof value !== 'string') {
    throw new Error('Muralista’s LYRICS_PREVIEW_TEXT is no longer a string.')
  }
  return value
})()

/**
 * **THE INTRO STAND-IN WAS THE SECOND OF THE TWO AND IT IS GONE** (2026-09-04). `INTRO_PLACEHOLDER`
 * was three strings — annotation, title, tagline — and everything the intro card painted *in
 * Muralista*. The card stopped being a shape type there, so the declaration went with it, and
 * `readDeclaration` would now throw rather than return a stale value. That is the module working:
 * a fixture that disappears upstream is loud here, which is the whole reason this file exists.
 *
 * **Pregonero's own intro card is unaffected.** It never used these strings — all three of its
 * parts come from the song file. What is lost is the measured worst case the *preview* was tuned
 * against, and that mattered only while Muralista drew one.
 */

/** The tag the one above was taken from/** The tag the two above were taken from, for anything that reports which boundary it checked. */
export const MURALISTA_FIXTURE_TAG: string = source.tag
