/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isUsableBpm,
  getTempoScale,
  resolvePerformedBpm,
  scaleTimeline,
  getStoredPerformedBpm,
  setStoredPerformedBpm,
} from './performedTempo'
import { GOLDEN_TIMELINE_ENTRIES } from './fixtures/timelineV2'

/** Libertad's declared tempo — a fact about the recording, never rewritten. */
const DECLARED_BPM = 66.67

describe('isUsableBpm', () => {
  it('accepts positive finite numbers, including fractional tempi', () => {
    expect(isUsableBpm(120)).toBe(true)
    expect(isUsableBpm(66.67)).toBe(true)
  })

  it('rejects values that would produce an Infinity or NaN scale', () => {
    expect(isUsableBpm(0)).toBe(false)
    expect(isUsableBpm(-120)).toBe(false)
    expect(isUsableBpm(NaN)).toBe(false)
    expect(isUsableBpm(Infinity)).toBe(false)
    expect(isUsableBpm(null)).toBe(false)
    expect(isUsableBpm(undefined)).toBe(false)
  })
})

describe('getTempoScale', () => {
  it('is exactly 1 when the performed tempo equals the declared tempo', () => {
    expect(getTempoScale(DECLARED_BPM, DECLARED_BPM)).toBe(1)
  })

  it('is declared / performed — playing faster compresses the timeline', () => {
    // 1.5x the declared tempo → everything happens in 2/3 of the time.
    expect(getTempoScale(60, 90)).toBeCloseTo(2 / 3, 10)
  })

  it('playing slower stretches the timeline', () => {
    expect(getTempoScale(90, 60)).toBeCloseTo(1.5, 10)
  })

  it('is 1 when either side is missing or unusable — no fallback BPM is invented', () => {
    expect(getTempoScale(undefined, 120)).toBe(1)
    expect(getTempoScale(120, undefined)).toBe(1)
    expect(getTempoScale(120, 0)).toBe(1)
    expect(getTempoScale(undefined, undefined)).toBe(1)
  })
})

describe('resolvePerformedBpm', () => {
  it('defaults to the declared tempo when nothing is stored', () => {
    expect(resolvePerformedBpm(DECLARED_BPM, null)).toBe(DECLARED_BPM)
  })

  it('uses the stored performed tempo when there is one', () => {
    expect(resolvePerformedBpm(DECLARED_BPM, 100)).toBe(100)
  })

  it('falls back to the declared tempo when the stored value is junk', () => {
    expect(resolvePerformedBpm(DECLARED_BPM, 0)).toBe(DECLARED_BPM)
    expect(resolvePerformedBpm(DECLARED_BPM, NaN)).toBe(DECLARED_BPM)
  })

  it('is undefined for a song with no tempo block and nothing stored', () => {
    expect(resolvePerformedBpm(undefined, null)).toBeUndefined()
  })
})

describe('scaleTimeline — the P9 acceptance, on Libertad\'s 20 lines', () => {
  it('ACCEPTANCE: with performedBpm == tempo.bpm, every cue time is identical to today', () => {
    const scale = getTempoScale(DECLARED_BPM, DECLARED_BPM)
    const scaled = scaleTimeline(GOLDEN_TIMELINE_ENTRIES, scale)

    expect(scaled).toHaveLength(20)
    expect(scaled).toEqual(GOLDEN_TIMELINE_ENTRIES)
    // Strongest available form of "nothing changed": not even a new array.
    expect(scaled).toBe(GOLDEN_TIMELINE_ENTRIES)
  })

  it('ACCEPTANCE: at 1.5x the declared tempo every cue time scales by 2/3', () => {
    const performed = DECLARED_BPM * 1.5
    const scale = getTempoScale(DECLARED_BPM, performed)
    const scaled = scaleTimeline(GOLDEN_TIMELINE_ENTRIES, scale)

    expect(scaled).toHaveLength(GOLDEN_TIMELINE_ENTRIES.length)
    GOLDEN_TIMELINE_ENTRIES.forEach((entry, i) => {
      expect(scaled[i].start).toBeCloseTo(entry.start * (2 / 3), 6)
      expect(scaled[i].end).toBeCloseTo(entry.end * (2 / 3), 6)
    })
    // Spot-check the two ends against hand-computed values, so a wrong-direction scale
    // (performed/declared instead of declared/performed) cannot pass.
    expect(scaled[0].start).toBe(0)
    expect(scaled[19].start).toBeCloseTo(76.64 * (2 / 3), 6) // 51.093…
    expect(scaled[19].end).toBeCloseTo(98.84 * (2 / 3), 6) // 65.893…
  })

  it('line 0 always starts at 0 whatever the scale — the cue is the origin', () => {
    const scaled = scaleTimeline(GOLDEN_TIMELINE_ENTRIES, 0.5)
    expect(scaled[0].start).toBe(0)
  })

  it('stays monotonic after scaling', () => {
    const scaled = scaleTimeline(GOLDEN_TIMELINE_ENTRIES, 2 / 3)
    for (let i = 1; i < scaled.length; i++) {
      expect(scaled[i].start).toBeGreaterThanOrEqual(scaled[i - 1].end - 1e-9)
    }
  })

  it('does not mutate the source timeline', () => {
    const before = JSON.parse(JSON.stringify(GOLDEN_TIMELINE_ENTRIES))
    scaleTimeline(GOLDEN_TIMELINE_ENTRIES, 2 / 3)
    expect(GOLDEN_TIMELINE_ENTRIES).toEqual(before)
  })

  it('leaves the timeline alone for a nonsense scale rather than producing NaN cue times', () => {
    expect(scaleTimeline(GOLDEN_TIMELINE_ENTRIES, 0)).toBe(GOLDEN_TIMELINE_ENTRIES)
    expect(scaleTimeline(GOLDEN_TIMELINE_ENTRIES, NaN)).toBe(GOLDEN_TIMELINE_ENTRIES)
  })

  it('handles an empty timeline (an un-timed song) without inventing entries', () => {
    expect(scaleTimeline([], 2 / 3)).toEqual([])
  })
})

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

describe('performed tempo persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('returns null when nothing has been stored', () => {
    expect(getStoredPerformedBpm('libertad')).toBeNull()
  })

  it('round-trips a stored performed tempo per song', () => {
    setStoredPerformedBpm('libertad', 100)
    setStoredPerformedBpm('duelo', 75)
    expect(getStoredPerformedBpm('libertad')).toBe(100)
    expect(getStoredPerformedBpm('duelo')).toBe(75)
  })

  it('clears with null, falling back to the declared tempo', () => {
    setStoredPerformedBpm('libertad', 100)
    setStoredPerformedBpm('libertad', null)
    expect(getStoredPerformedBpm('libertad')).toBeNull()
  })

  it('never persists an unusable BPM', () => {
    setStoredPerformedBpm('libertad', 0)
    expect(getStoredPerformedBpm('libertad')).toBeNull()
    setStoredPerformedBpm('libertad', -5)
    expect(getStoredPerformedBpm('libertad')).toBeNull()
  })

  it('survives junk in storage rather than throwing', () => {
    localStorage.setItem('llt.performedBpm.v1', 'not json')
    expect(getStoredPerformedBpm('libertad')).toBeNull()
    localStorage.setItem('llt.performedBpm.v1', '[1,2,3]')
    expect(getStoredPerformedBpm('libertad')).toBeNull()
  })

  it('does not touch any song data — the store is keyed by song id and holds only numbers', () => {
    setStoredPerformedBpm('libertad', 100)
    const raw = JSON.parse(localStorage.getItem('llt.performedBpm.v1') as string)
    expect(raw).toEqual({ libertad: 100 })
  })
})
