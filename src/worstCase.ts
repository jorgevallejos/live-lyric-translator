/**
 * **Muralista's stand-ins are the worst case, and that makes them load-bearing.**
 *
 * The decision this file exists to serve (Jorge, 2026-08-27): *Muralista tunes against the worst
 * case and emits a boundary; Pregonero renders the real lyrics inside that boundary.* Muralista
 * never reads song content — it previews with a deliberately nasty stand-in and writes down a
 * `maxSize` that is safe — and Pregonero executes within those guidelines.
 *
 * The relationship is **not replication**, which is why it is not debt. But it does rest on one
 * thing being true: **the stand-in has to actually be the worst case.** A real lyric line harder
 * than it is a line Muralista never tuned against, and the boundary it wrote down is a promise
 * about a case it did not see.
 *
 * So this module says whether a real line is worse than it. **A line that is worse is a Muralista
 * finding, not something to fix in Pregonero** — the answer would be a nastier stand-in over
 * there, not a workaround here.
 *
 * **THE STAND-IN IS NOT WRITTEN DOWN HERE ANY MORE, AND THAT IS THE POINT.** It used to be, as a
 * verbatim hand-copy with its three numbers hardcoded beside it. Muralista replaced it in `v1.5.0`
 * on 2026-08-27 and every test in this repo stayed green — the copy went stale in a day and the
 * tests reported confidence they did not have. It now comes from `muralistaFixtures.ts`, which
 * reads Muralista's own file out of `src/vendor` at a recorded tag with a hash test on it.
 * **Nothing below hardcodes a number the fixture decides.**
 *
 * **TOOLING ONLY — do not import this into the app.** It reaches the vendored source through
 * `node:fs`. Nothing in the running app has ever needed it, and the day something does, the
 * fixture has to arrive some other way.
 */
import { MURALISTA_LYRICS_STAND_IN } from './muralistaFixtures'

/**
 * What makes one string harder to lay out than another, in the two ways the fit can fail.
 *
 * **Total length** drives the wrapped case — more glyphs at a given size need more rows, and rows
 * are what run out of height. **The longest unbreakable run** drives the other one: a single word
 * longer than the box cannot wrap at all, which is the failure `scrollWidth` exists to catch and
 * the reason word-level wrapping can stay the rule.
 *
 * A hard break is counted as a row that is already spent, because it is: the line arrives with a
 * row boundary in it whether the box wanted one or not.
 */
export type LineDifficulty = {
  /** Characters, excluding the hard breaks themselves. */
  length: number
  /** The longest run with no space or break in it. */
  longestWord: number
  /** How many rows the string arrives already committed to. */
  hardRows: number
}

export function difficultyOf(text: string): LineDifficulty {
  const rows = text.split('\n')
  const words = text.split(/[\s]+/).filter((w) => w.length > 0)
  return {
    length: rows.join('').length,
    longestWord: words.reduce((longest, word) => Math.max(longest, word.length), 0),
    hardRows: rows.length,
  }
}

/**
 * Muralista's `LYRICS_PREVIEW_TEXT`, from the vendored copy.
 *
 * Re-exported under this name because *lyrics* is the half of the boundary Pregonero renders
 * inside. It is the only half left; the intro stand-in went with Muralista's intro card.
 */
export const MURALISTA_LYRICS_LINE: string = MURALISTA_LYRICS_STAND_IN

/** The three numbers the lyrics boundary is tuned against. Derived, never typed in. */
export const LYRICS_STAND_IN_DIFFICULTY = difficultyOf(MURALISTA_LYRICS_LINE)

/**
 * **THE INTRO CARD'S THREE SETS OF NUMBERS WERE HERE AND ARE GONE** (2026-09-04). They measured
 * `INTRO_PLACEHOLDER`, the stand-in Muralista's own intro card painted, and that card stopped
 * being a shape type. The finding they produced is still true and still written down in
 * `project-context.md`: the title binds first, not the tagline, because the tagline is 0.28 of the
 * title and an unbreakable run costs it 3.6 times less. **If Pregonero ever previews its own intro
 * against a worst case, that is the arithmetic to start from.**
 */

/**
 * Whether `text` is harder than the lyrics stand-in/**
 * Whether `text` is harder than the lyrics stand-in on **any** axis.
 *
 * Deliberately *any* rather than *all*: the boundary has to hold for every real line, so a line
 * that is shorter overall but carries a word the stand-in never had is still a case Muralista did
 * not tune against.
 */
export function harderThanLyricsStandIn(text: string): boolean {
  const d = difficultyOf(text)
  return (
    d.length > LYRICS_STAND_IN_DIFFICULTY.length ||
    d.longestWord > LYRICS_STAND_IN_DIFFICULTY.longestWord ||
    d.hardRows > LYRICS_STAND_IN_DIFFICULTY.hardRows
  )
}

/** Which axes a line beats the stand-in on, in the words a report uses. Empty when it does not. */
export function harderThanLyricsStandInWhy(text: string): string[] {
  const d = difficultyOf(text)
  const why: string[] = []
  if (d.length > LYRICS_STAND_IN_DIFFICULTY.length) {
    why.push(`${d.length} characters against the stand-in's ${LYRICS_STAND_IN_DIFFICULTY.length}`)
  }
  if (d.longestWord > LYRICS_STAND_IN_DIFFICULTY.longestWord) {
    why.push(
      `a ${d.longestWord}-character unbreakable run against the stand-in's ` +
        `${LYRICS_STAND_IN_DIFFICULTY.longestWord}`
    )
  }
  if (d.hardRows > LYRICS_STAND_IN_DIFFICULTY.hardRows) {
    why.push(`${d.hardRows} hard rows against the stand-in's ${LYRICS_STAND_IN_DIFFICULTY.hardRows}`)
  }
  return why
}
