/**
 * **Muralista's two stand-ins, read out of the vendored copy rather than typed in again.**
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
 * **THERE ARE TWO STAND-INS AND THEY ARE INDEPENDENT.** That fact is the whole reason this module
 * is plural, and the vault had never written it down:
 *
 * - `LYRICS_PREVIEW_TEXT` — one string, the default of an editable field, seeding a `song-lyrics`
 *   slot. Its one consumer in Muralista is `setLayerType()`.
 * - `INTRO_PLACEHOLDER` — three strings (annotation, title, tagline), and everything
 *   `applySongIntroLayer()` paints. The tagline is the smallest thing on the wall.
 *
 * Replacing one does not move the other, which is why `v1.5.0` fixed the lyrics one and left the
 * intro one un-measured until `v1.6.0`.
 *
 * **TOOLING ONLY — never import this, or `worstCase.ts`, into the app.** It reads a 300 KB file
 * off disk with `node:fs`. It is meant for tests and for the hand-run measurements that decide
 * whether Muralista's boundary still holds.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import source from './vendor/muralista-fixtures.source.json'

export type MuralistaIntroPlaceholder = {
  annotation: string
  title: string
  tagline: string
}

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
function readDeclaration(sourceText: string, name: string): unknown {
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
 * `INTRO_PLACEHOLDER` — the three strings the `song-intro` card paints. Only the title is ever
 * real, and only while a gig is connected and a song is being previewed; the annotation and the
 * tagline live in the song file, which is below Muralista's line.
 */
export const MURALISTA_INTRO_STAND_IN: MuralistaIntroPlaceholder = (() => {
  const value = readDeclaration(vendoredMapperSource(), 'INTRO_PLACEHOLDER')
  const parts = value as Partial<MuralistaIntroPlaceholder>
  for (const key of ['annotation', 'title', 'tagline'] as const) {
    if (typeof parts?.[key] !== 'string') {
      throw new Error(`Muralista’s INTRO_PLACEHOLDER.${key} is missing or is no longer a string.`)
    }
  }
  return parts as MuralistaIntroPlaceholder
})()

/** The tag the two above were taken from, for anything that reports which boundary it checked. */
export const MURALISTA_FIXTURE_TAG: string = source.tag
