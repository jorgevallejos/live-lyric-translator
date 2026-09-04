/**
 * **Every expectation about the stand-ins is derived from the stand-ins.**
 *
 * The previous version of this file asserted `{ length: 91, longestWord: 11, hardRows: 2 }` and
 * the exact text of the line, typed in by hand. Muralista replaced that line on 2026-08-27 and
 * these tests **kept passing** — which is the worst outcome available, because green meant
 * "Pregonero is checked against Muralista's boundary" and it was not. Nothing below hardcodes a
 * number the fixture decides; the literals that remain are inputs to `difficultyOf`, which is
 * Pregonero's own function and is what these tests are for.
 */
import { describe, it, expect } from 'vitest'
import {
  difficultyOf,
  harderThanLyricsStandIn,
  harderThanLyricsStandInWhy,
  LYRICS_STAND_IN_DIFFICULTY,
  MURALISTA_LYRICS_LINE,
} from './worstCase'

/** A string of `n` characters with no space in it — harder than anything on two axes at once. */
const run = (n: number) => 'x'.repeat(n)

describe('what makes a line harder', () => {
  it('counts characters without the hard breaks themselves', () => {
    expect(difficultyOf('ab\ncd').length).toBe(4)
  })

  it('counts the longest run with no space in it — the one wrapping cannot help', () => {
    expect(difficultyOf('a bb ccc').longestWord).toBe(3)
    expect(difficultyOf('ontdekkingsreiziger').longestWord).toBe(19)
  })

  it('counts the rows a line arrives already committed to', () => {
    expect(difficultyOf('a\nb\nc').hardRows).toBe(3)
  })

  it('is empty rather than negative for an empty string', () => {
    expect(difficultyOf('')).toEqual({ length: 0, longestWord: 0, hardRows: 1 })
  })
})

describe('the lyrics stand-in, as Muralista currently emits it', () => {
  it('is measured, not asserted: the numbers come from the vendored fixture', () => {
    expect(LYRICS_STAND_IN_DIFFICULTY).toEqual(difficultyOf(MURALISTA_LYRICS_LINE))
  })

  it('is a real stand-in and not an empty string that would pass everything', () => {
    // The one guard that has to be absolute: a fixture that failed to extract would arrive as ''
    // and then no real line could ever be flagged, silently.
    expect(MURALISTA_LYRICS_LINE.length).toBeGreaterThan(0)
    expect(LYRICS_STAND_IN_DIFFICULTY.longestWord).toBeGreaterThan(0)
  })

  it('is not harder than itself', () => {
    expect(harderThanLyricsStandIn(MURALISTA_LYRICS_LINE)).toBe(false)
    expect(harderThanLyricsStandInWhy(MURALISTA_LYRICS_LINE)).toEqual([])
  })
})

describe('a real line against the stand-in', () => {
  it('passes a line the stand-in beats on every axis', () => {
    const easy = 'ab '.repeat(3).trim()
    expect(harderThanLyricsStandIn(easy)).toBe(false)
  })

  it('flags a longer line, and says by how much', () => {
    const long = `${run(LYRICS_STAND_IN_DIFFICULTY.length)} ${run(2)}`
    expect(harderThanLyricsStandIn(long)).toBe(true)
    expect(harderThanLyricsStandInWhy(long)).toContain(
      `${LYRICS_STAND_IN_DIFFICULTY.length + 3} characters against the stand-in's ` +
        `${LYRICS_STAND_IN_DIFFICULTY.length}`
    )
  })

  it('flags a longer unbreakable run even when the line itself is short', () => {
    const word = run(LYRICS_STAND_IN_DIFFICULTY.longestWord + 1)
    expect(difficultyOf(word).length).toBeLessThanOrEqual(LYRICS_STAND_IN_DIFFICULTY.length)
    expect(harderThanLyricsStandIn(word)).toBe(true)
    expect(harderThanLyricsStandInWhy(word)).toEqual([
      `a ${LYRICS_STAND_IN_DIFFICULTY.longestWord + 1}-character unbreakable run against the ` +
        `stand-in's ${LYRICS_STAND_IN_DIFFICULTY.longestWord}`,
    ])
  })

  it('flags one more hard row than the stand-in arrives with', () => {
    const rows = 'a\n'.repeat(LYRICS_STAND_IN_DIFFICULTY.hardRows) + 'a'
    expect(harderThanLyricsStandIn(rows)).toBe(true)
    expect(harderThanLyricsStandInWhy(rows)).toEqual([
      `${LYRICS_STAND_IN_DIFFICULTY.hardRows + 1} hard rows against the stand-in's ` +
        `${LYRICS_STAND_IN_DIFFICULTY.hardRows}`,
    ])
  })

  it('flags on any axis, not all of them — the boundary has to hold for every line', () => {
    // Short overall, one word too long: the case that made 36 of 1088 catalogue lines beat the
    // stand-in Muralista shipped before v1.5.0.
    const onlyTheRun = run(LYRICS_STAND_IN_DIFFICULTY.longestWord + 1)
    expect(difficultyOf(onlyTheRun).length).toBeLessThan(LYRICS_STAND_IN_DIFFICULTY.length)
    expect(harderThanLyricsStandIn(onlyTheRun)).toBe(true)
  })

  it('names every axis a line beats it on, not only the first', () => {
    const worst = `${run(LYRICS_STAND_IN_DIFFICULTY.length + 1)}\n${'b\n'.repeat(
      LYRICS_STAND_IN_DIFFICULTY.hardRows
    )}c`
    expect(harderThanLyricsStandInWhy(worst)).toHaveLength(3)
  })
})
