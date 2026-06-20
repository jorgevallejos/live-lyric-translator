/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSubtitleTimer } from './useSubtitleTimer'
import type { TimelineEntry } from './songState'

const TIMELINE: TimelineEntry[] = [
  { start: 0, end: 3 },
  { start: 3, end: 6 },
  { start: 6, end: 10 },
]

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

beforeAll(() => {
  if (
    typeof globalThis.localStorage === 'undefined' ||
    typeof globalThis.localStorage.clear !== 'function'
  ) {
    vi.stubGlobal('localStorage', createStorage())
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('useSubtitleTimer — initial state', () => {
  it('starts stopped with t=0; activeIndex=0 because first entry starts at t=0', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    expect(result.current.running).toBe(false)
    expect(result.current.t).toBe(0)
    // videoCueLookup(TIMELINE, 0) → entry[0] contains [0,3), so activeIndex=0
    expect(result.current.activeIndex).toBe(0)
  })

  it('activeIndex is -1 when t is before the first entry start', () => {
    const lateTimeline: TimelineEntry[] = [
      { start: 5, end: 8 },
      { start: 8, end: 12 },
    ]
    const { result } = renderHook(() => useSubtitleTimer(lateTimeline, 'song-1', -1))
    expect(result.current.activeIndex).toBe(-1)
  })

  it('drift is 0 when stopped at t=0 and manualIndex=-1', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    expect(result.current.drift).toBe(0)
  })
})

describe('useSubtitleTimer — startPause / stop', () => {
  it('startPause toggles running on', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.startPause() })
    expect(result.current.running).toBe(true)
  })

  it('startPause toggles running off when already running', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.startPause() })
    act(() => { result.current.startPause() })
    expect(result.current.running).toBe(false)
  })

  it('stop resets t to 0 and stops running', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.stop() })
    expect(result.current.running).toBe(false)
    expect(result.current.t).toBeCloseTo(0)
  })
})

describe('useSubtitleTimer — activeIndex driven by timeline', () => {
  it('activeIndex is -1 before the first entry start', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    act(() => { result.current.startPause() })
    // t=0 is inside first entry [0,3)
    // advance to 0ms first — we start right at 0 which is exactly in [0,3)
    act(() => { vi.advanceTimersByTime(0) })
    // t=0 falls in entry [0,3), so activeIndex should be 0
    expect(result.current.activeIndex).toBe(0)
  })

  it('activeIndex advances as time passes the entry boundary', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    act(() => { result.current.startPause() })
    // Advance 3100ms to ensure we're solidly past the [0,3)→[3,6) boundary
    // (floating-point accumulation of 60×50ms ticks can leave t at 2.9999…)
    act(() => { vi.advanceTimersByTime(3100) })
    // t≈3.1s → in entry [3,6) → index 1
    expect(result.current.activeIndex).toBe(1)
  })

  it('activeIndex reaches the third entry', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(7100) })
    // t≈7.1s → in entry [6,10) → index 2
    expect(result.current.activeIndex).toBe(2)
  })

  it('activeIndex is -1 when t falls in a gap between entries', () => {
    const gappedTimeline: TimelineEntry[] = [
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]
    const { result } = renderHook(() => useSubtitleTimer(gappedTimeline, 'song-1', -1))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(3000) })
    // t≈3s → gap between [0,2) and [4,6) → -1
    expect(result.current.activeIndex).toBe(-1)
  })

  it('t does not advance past the last entry end', () => {
    const shortTimeline: TimelineEntry[] = [{ start: 0, end: 2 }]
    const { result } = renderHook(() => useSubtitleTimer(shortTimeline, 'song-1', -1))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(result.current.t).toBeCloseTo(2)
  })

  it('re-render with new-but-equal timeline object does not reset t', () => {
    const { result, rerender } = renderHook(
      ({ tl }: { tl: TimelineEntry[] }) => useSubtitleTimer(tl, 'song-1', -1),
      { initialProps: { tl: TIMELINE } }
    )
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(1000) })
    const tBefore = result.current.t

    // New array reference with same content
    rerender({ tl: [...TIMELINE] })

    act(() => { vi.advanceTimersByTime(500) })
    // Clock should have continued advancing, not restarted
    expect(result.current.t).toBeGreaterThan(tBefore)
    expect(result.current.t).toBeCloseTo(1.5, 0)
  })
})

describe('useSubtitleTimer — nudge', () => {
  it('nudge(+0.25) advances t by 0.25s', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    // stopped at t=0
    act(() => { result.current.nudge(0.25) })
    expect(result.current.t).toBeCloseTo(0.25)
  })

  it('nudge(-0.25) reduces t by 0.25s', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.nudge(1) })
    act(() => { result.current.nudge(-0.25) })
    expect(result.current.t).toBeCloseTo(0.75)
  })

  it('nudge cannot push t below 0', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.nudge(-5) })
    expect(result.current.t).toBe(0)
  })

  it('nudge cannot push t above the last entry end', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.nudge(999) })
    // last entry ends at 10
    expect(result.current.t).toBeCloseTo(10)
  })
})

describe('useSubtitleTimer — resync (manual override)', () => {
  it('resync(1) jumps t to timeline[1].start', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 1))
    act(() => { result.current.resync(1) })
    expect(result.current.t).toBeCloseTo(3)
  })

  it('resync resyncs while running and clock continues from new position', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 2))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(1000) })
    act(() => { result.current.resync(2) })
    // After resync to index 2, t should be ~6
    expect(result.current.t).toBeCloseTo(6)
    act(() => { vi.advanceTimersByTime(1000) })
    // Clock continued: t should be ~7
    expect(result.current.t).toBeCloseTo(7, 0)
  })
})

describe('useSubtitleTimer — drift', () => {
  it('drift is 0 when t equals the manual index start exactly', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 1))
    act(() => { result.current.resync(1) })
    expect(result.current.drift).toBeCloseTo(0)
  })

  it('drift is positive when t is past the manual index start', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 0))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(1500) })
    // t≈1.5, manualIndex=0, timeline[0].start=0 → drift≈1.5
    expect(result.current.drift).toBeGreaterThan(1)
  })

  it('drift is negative when t is before the manual index start', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', 2))
    // t=0, manualIndex=2, timeline[2].start=6 → drift=-6
    expect(result.current.drift).toBeCloseTo(-6)
  })

  it('drift is 0 when manualIndex is -1', () => {
    const { result } = renderHook(() => useSubtitleTimer(TIMELINE, 'song-1', -1))
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.drift).toBe(0)
  })
})

describe('useSubtitleTimer — song change resets clock', () => {
  it('resets t to 0 when currentSongId changes', () => {
    const { result, rerender } = renderHook(
      ({ songId }: { songId: string }) => useSubtitleTimer(TIMELINE, songId, -1),
      { initialProps: { songId: 'song-1' } }
    )
    act(() => { result.current.startPause() })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.t).toBeGreaterThan(0)

    rerender({ songId: 'song-2' })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.t).toBe(0)
    expect(result.current.running).toBe(false)
  })
})
