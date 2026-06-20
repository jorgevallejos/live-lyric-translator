import { describe, it, expect } from 'vitest'
import { nudgeT, resyncToIndex, getDrift } from './subtitleState'
import type { TimelineEntry } from './songState'

const TIMELINE: TimelineEntry[] = [
  { start: 0, end: 3 },
  { start: 3, end: 6 },
  { start: 6, end: 10 },
]

describe('nudgeT', () => {
  it('adds positive delta', () => {
    expect(nudgeT(5, 0.25, 20)).toBeCloseTo(5.25)
  })

  it('subtracts negative delta', () => {
    expect(nudgeT(5, -0.25, 20)).toBeCloseTo(4.75)
  })

  it('clamps to 0 when result would be negative', () => {
    expect(nudgeT(0.1, -0.25, 20)).toBe(0)
  })

  it('clamps to maxT when result exceeds it', () => {
    expect(nudgeT(19.9, 0.25, 20)).toBe(20)
  })

  it('returns 0 when t is already 0 and delta is negative', () => {
    expect(nudgeT(0, -0.25, 20)).toBe(0)
  })

  it('returns maxT when t equals maxT and delta is positive', () => {
    expect(nudgeT(20, 0.25, 20)).toBe(20)
  })

  it('applies zero delta unchanged', () => {
    expect(nudgeT(7.5, 0, 20)).toBeCloseTo(7.5)
  })
})

describe('resyncToIndex', () => {
  it('returns start of the entry at the given index', () => {
    expect(resyncToIndex(TIMELINE, 0)).toBe(0)
    expect(resyncToIndex(TIMELINE, 1)).toBe(3)
    expect(resyncToIndex(TIMELINE, 2)).toBe(6)
  })

  it('returns 0 for index -1', () => {
    expect(resyncToIndex(TIMELINE, -1)).toBe(0)
  })

  it('returns 0 for index beyond the timeline length', () => {
    expect(resyncToIndex(TIMELINE, 99)).toBe(0)
  })

  it('returns 0 for empty timeline', () => {
    expect(resyncToIndex([], 0)).toBe(0)
  })
})

describe('getDrift', () => {
  it('returns t minus the start of the given index', () => {
    expect(getDrift(4.5, TIMELINE, 1)).toBeCloseTo(1.5)
  })

  it('returns negative drift when t is before the entry start', () => {
    expect(getDrift(2, TIMELINE, 1)).toBeCloseTo(-1)
  })

  it('returns 0 when t equals the entry start exactly', () => {
    expect(getDrift(3, TIMELINE, 1)).toBe(0)
  })

  it('returns 0 for index -1', () => {
    expect(getDrift(5, TIMELINE, -1)).toBe(0)
  })

  it('returns 0 for index beyond timeline length', () => {
    expect(getDrift(5, TIMELINE, 99)).toBe(0)
  })

  it('returns 0 for empty timeline', () => {
    expect(getDrift(5, [], 0)).toBe(0)
  })
})
