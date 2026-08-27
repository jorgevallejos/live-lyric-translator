import { describe, it, expect } from 'vitest'
import {
  difficultyOf,
  DUMMY_DIFFICULTY,
  harderThanDummy,
  harderThanDummyWhy,
  MURALISTA_DUMMY_LINE,
} from './worstCase'

describe('Muralista’s stand-in as the worst case', () => {
  it('is the line Muralista actually previews with, byte for byte', () => {
    expect(MURALISTA_DUMMY_LINE).toBe(
      '"Wat een lekkernij zul jij zijn," zucht hij,\nterwijl ik denk aan mijn vertrouwde modderplas.'
    )
  })

  it('is two rows, 91 characters, and an 11-character longest run', () => {
    expect(DUMMY_DIFFICULTY).toEqual({ length: 91, longestWord: 11, hardRows: 2 })
  })

  it('is not harder than itself', () => {
    expect(harderThanDummy(MURALISTA_DUMMY_LINE)).toBe(false)
    expect(harderThanDummyWhy(MURALISTA_DUMMY_LINE)).toEqual([])
  })
})

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

describe('a real line against the stand-in', () => {
  it('passes an ordinary lyric line', () => {
    expect(harderThanDummy('Libertad, que no se compra ni se vende.')).toBe(false)
  })

  it('flags a longer line, and says by how much', () => {
    const long = 'x'.repeat(120)
    expect(harderThanDummy(long)).toBe(true)
    expect(harderThanDummyWhy(long)[0]).toMatch(/120 characters against the stand-in's 91/)
  })

  it('flags a longer unbreakable run even when the line itself is short', () => {
    // The real one, from `quien-fuera.json`'s Dutch: nineteen characters against the stand-in's
    // eleven, in a line the stand-in beats on every other axis.
    expect(harderThanDummy('Was ik maar jouw ontdekkingsreiziger')).toBe(true)
    expect(harderThanDummyWhy('Was ik maar jouw ontdekkingsreiziger')).toEqual([
      "a 19-character unbreakable run against the stand-in's 11",
    ])
  })

  it('flags a third hard row, which the stand-in never had', () => {
    // The real one, from `paso.json`'s English.
    expect(harderThanDummy('You look at me, \nthinking \nof what may come.')).toBe(true)
    expect(harderThanDummyWhy('You look at me, \nthinking \nof what may come.')).toEqual([
      "3 hard rows against the stand-in's 2",
    ])
  })

  it('flags on any axis, not all of them — the boundary has to hold for every line', () => {
    expect(harderThanDummy('a'.repeat(12))).toBe(true)
  })

  it('names every axis a line beats it on, not only the first', () => {
    expect(harderThanDummyWhy(`${'a'.repeat(100)}\nb\nc`)).toHaveLength(3)
  })
})
