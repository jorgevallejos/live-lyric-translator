/**
 * **Muralista's dummy line is the worst case, and that makes it load-bearing.**
 *
 * The decision this file exists to serve (Jorge, 2026-08-27): *Muralista tunes against the worst
 * case and emits a boundary; Pregonero renders the real lyrics inside that boundary.* Muralista
 * never reads song content — it previews with a deliberately nasty stand-in and writes down a
 * `maxSize` that is safe — and Pregonero executes within those guidelines.
 *
 * The relationship is **not replication**, which is why it is not debt. But it does rest on one
 * thing being true: **the stand-in has to actually be the worst case.** A real lyric line harder
 * than the dummy is a line Muralista never tuned against, and the boundary it wrote down is a
 * promise about a case it did not see.
 *
 * So the dummy is reproduced here **verbatim**, and this module says whether a real line is worse
 * than it. **A line that is worse is a Muralista finding, not something to fix in Pregonero** —
 * the answer would be a nastier stand-in over there, not a workaround here.
 */

/**
 * Muralista's `LYRICS_PREVIEW_TEXT`, byte for byte (`mapper.js`, the TEXT LAYER section).
 *
 * Two lines, a hard break, quote marks, 89 characters. Deliberately nasty: legibility at a wall
 * from the back of a room is the top untested assumption in the whole design, and a short
 * stand-in makes the tuning feel finished while having tested nothing.
 */
export const MURALISTA_DUMMY_LINE =
  '"Wat een lekkernij zul jij zijn," zucht hij,\nterwijl ik denk aan mijn vertrouwde modderplas.'

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

export const DUMMY_DIFFICULTY = difficultyOf(MURALISTA_DUMMY_LINE)

/**
 * Whether `text` is harder than the stand-in on **any** axis.
 *
 * Deliberately *any* rather than *all*: the boundary has to hold for every real line, so a line
 * that is shorter overall but carries a word the dummy never had is still a case Muralista did not
 * tune against.
 */
export function harderThanDummy(text: string): boolean {
  const d = difficultyOf(text)
  return (
    d.length > DUMMY_DIFFICULTY.length ||
    d.longestWord > DUMMY_DIFFICULTY.longestWord ||
    d.hardRows > DUMMY_DIFFICULTY.hardRows
  )
}

/** Which axes a line beats the stand-in on, in the words a report uses. Empty when it does not. */
export function harderThanDummyWhy(text: string): string[] {
  const d = difficultyOf(text)
  const why: string[] = []
  if (d.length > DUMMY_DIFFICULTY.length) {
    why.push(`${d.length} characters against the stand-in's ${DUMMY_DIFFICULTY.length}`)
  }
  if (d.longestWord > DUMMY_DIFFICULTY.longestWord) {
    why.push(
      `a ${d.longestWord}-character unbreakable run against the stand-in's ${DUMMY_DIFFICULTY.longestWord}`
    )
  }
  if (d.hardRows > DUMMY_DIFFICULTY.hardRows) {
    why.push(`${d.hardRows} hard rows against the stand-in's ${DUMMY_DIFFICULTY.hardRows}`)
  }
  return why
}
