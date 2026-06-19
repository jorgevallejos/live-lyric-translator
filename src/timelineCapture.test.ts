import { describe, it, expect } from 'vitest'
import {
  initTimelineCapture,
  captureAdvance,
  finalizeCapture,
  buildTimelineFromCapture,
} from './timelineCapture'

describe('initTimelineCapture', () => {
  it('returns not-started state', () => {
    const c = initTimelineCapture()
    expect(c.clockStartMs).toBeNull()
    expect(Array.from(c.recordedMs)).toEqual([])
  })
})

describe('captureAdvance', () => {
  it('ignores negative index', () => {
    const c = initTimelineCapture()
    const next = captureAdvance(c, -1, 1000)
    expect(next.clockStartMs).toBeNull()
    expect(Array.from(next.recordedMs)).toEqual([])
  })

  it('first advance (index 0) starts clock at nowMs and records offset 0', () => {
    const c = initTimelineCapture()
    const next = captureAdvance(c, 0, 5000)
    expect(next.clockStartMs).toBe(5000)
    expect(Array.from(next.recordedMs)).toEqual([0])
  })

  it('second advance records elapsed ms since clock start', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 5000)
    c = captureAdvance(c, 1, 8000)
    expect(Array.from(c.recordedMs)).toEqual([0, 3000])
  })

  it('third advance records cumulative elapsed', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 2000)
    c = captureAdvance(c, 2, 5000)
    expect(Array.from(c.recordedMs)).toEqual([0, 2000, 5000])
  })

  it('ignores a backward move (index < recordedMs.length)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 1000)
    c = captureAdvance(c, 1, 2000)
    c = captureAdvance(c, 2, 3000)
    const snapshot = c
    // Simulate going back: index 1 is already recorded
    const after = captureAdvance(c, 1, 4000)
    expect(after).toEqual(snapshot)
  })

  it('ignores re-advance to already-recorded index (index < recordedMs.length)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 1000)
    c = captureAdvance(c, 1, 2000)
    const snapshot = c
    // Re-advancing to index 1 (already recorded)
    const after = captureAdvance(c, 1, 9000)
    expect(after).toEqual(snapshot)
  })

  it('does not mutate input capture', () => {
    const original = initTimelineCapture()
    captureAdvance(original, 0, 1000)
    expect(original.clockStartMs).toBeNull()
  })
})

describe('finalizeCapture', () => {
  it('returns unchanged capture when clock has not started', () => {
    const c = initTimelineCapture()
    const result = finalizeCapture(c, 9000)
    expect(result).toEqual(c)
  })

  it('returns unchanged capture when no advances recorded yet', () => {
    // Edge case: clockStartMs set but recordedMs empty — should not happen via normal API
    // but test defensive behavior
    const c = initTimelineCapture()
    const result = finalizeCapture(c, 9000)
    expect(result).toEqual(c)
  })

  it('appends final offset to recordedMs', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 1000)
    c = captureAdvance(c, 1, 3000)
    const fin = finalizeCapture(c, 8000)
    expect(Array.from(fin.recordedMs)).toEqual([0, 2000, 7000])
  })

  it('does not mutate input capture', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 1000)
    const before = Array.from(c.recordedMs)
    finalizeCapture(c, 5000)
    expect(Array.from(c.recordedMs)).toEqual(before)
  })
})

describe('buildTimelineFromCapture', () => {
  it('returns empty array when totalItems is 0', () => {
    expect(buildTimelineFromCapture(initTimelineCapture(), 0)).toEqual([])
  })

  it('returns all-zero entries when capture was never started', () => {
    const result = buildTimelineFromCapture(initTimelineCapture(), 3)
    expect(result).toHaveLength(3)
    for (const entry of result) {
      expect(entry.start).toBe(0)
      expect(entry.end).toBe(0)
    }
  })

  it('builds correct start/end for all items visited and finalized', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 2000)
    c = captureAdvance(c, 2, 5000)
    c = finalizeCapture(c, 8000)
    const result = buildTimelineFromCapture(c, 3)
    expect(result).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 5 },
      { start: 5, end: 8 },
    ])
  })

  it('produces one entry per item (length matches totalItems)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 1000)
    c = finalizeCapture(c, 3000)
    expect(buildTimelineFromCapture(c, 5)).toHaveLength(5)
  })

  it('pads unvisited items with zero-duration entries at last recorded time', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 3000)
    c = finalizeCapture(c, 6000)
    // 5 items total; only items 0 and 1 visited + finalized
    const result = buildTimelineFromCapture(c, 5)
    expect(result[0]).toEqual({ start: 0, end: 3 })
    expect(result[1]).toEqual({ start: 3, end: 6 })
    expect(result[2]).toEqual({ start: 6, end: 6 })
    expect(result[3]).toEqual({ start: 6, end: 6 })
    expect(result[4]).toEqual({ start: 6, end: 6 })
  })

  it('unfinalized last item gets end equal to start (zero duration)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 2000)
    // No finalizeCapture
    const result = buildTimelineFromCapture(c, 2)
    expect(result[0]).toEqual({ start: 0, end: 2 })
    expect(result[1]).toEqual({ start: 2, end: 2 })
  })

  it('all entries are monotonic (start >= previous end, end >= start)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = captureAdvance(c, 1, 1000)
    c = captureAdvance(c, 2, 2000)
    c = finalizeCapture(c, 3000)
    const result = buildTimelineFromCapture(c, 5)
    let prevEnd = -Infinity
    for (const entry of result) {
      expect(entry.start).toBeGreaterThanOrEqual(prevEnd)
      expect(entry.end).toBeGreaterThanOrEqual(entry.start)
      prevEnd = entry.end
    }
  })

  it('times are in seconds (divided by 1000)', () => {
    let c = captureAdvance(initTimelineCapture(), 0, 0)
    c = finalizeCapture(c, 4500)
    const result = buildTimelineFromCapture(c, 1)
    expect(result[0]).toEqual({ start: 0, end: 4.5 })
  })
})
