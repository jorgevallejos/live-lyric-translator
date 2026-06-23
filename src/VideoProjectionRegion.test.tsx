/** @vitest-environment jsdom */
/**
 * Tests for VideoProjectionRegion transport command reception (§video-transport).
 *
 * Key behaviors under test:
 *   - Does NOT auto-play on mount; video starts paused at trimStart.
 *   - Plays when a 'play' transport command arrives via localStorage storage event.
 *   - Pauses when a 'pause' transport command arrives.
 *   - Seeks to the given time when a 'seek' transport command arrives.
 *   - Ignores unrelated storage keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import type { MediaFile, TimelineEntry, SongItem } from './songState'
import type { ProjectionLayout } from './displayProfile'

vi.mock('./mediaPathStore', () => ({
  absolutePathToFileUrl: (path: string) => `file://${path}`,
}))

const TIMELINE: TimelineEntry[] = [{ start: 0, end: 2 }]
const LINES: SongItem[] = [{ languages: { es: 'Hola', en: 'Hello' } }]
const MEDIA: MediaFile = { type: 'video', src: 'test.mp4', trimStart: 3.0 }
const LAYOUT: ProjectionLayout = {
  animationHeightPx: 400,
  bandHeightPx: 100,
  fontSizePx: 48,
}

let playSpy: ReturnType<typeof vi.fn>
let pauseSpy: ReturnType<typeof vi.fn>
let currentTimeSetter: ReturnType<typeof vi.fn>

beforeEach(() => {
  playSpy = vi.fn(() => Promise.resolve())
  pauseSpy = vi.fn()
  currentTimeSetter = vi.fn()
  HTMLVideoElement.prototype.play = playSpy
  HTMLVideoElement.prototype.pause = pauseSpy
  Object.defineProperty(HTMLVideoElement.prototype, 'currentTime', {
    get: vi.fn(() => 0),
    set: currentTimeSetter,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

async function importRegion() {
  const mod = await import('./VideoProjectionRegion')
  return { VideoProjectionRegion: mod.VideoProjectionRegion, VIDEO_TRANSPORT_KEY: mod.VIDEO_TRANSPORT_KEY }
}

function fireTransport(key: string, action: 'play' | 'pause' | 'seek', time?: number) {
  const payload = JSON.stringify({ action, time, nonce: Date.now() })
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: payload }))
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    absolutePath: '/path/to/video.mp4',
    media: MEDIA,
    timeline: TIMELINE,
    lines: LINES,
    effectiveLang: 'en',
    layout: LAYOUT,
    ...overrides,
  }
}

// ── mount behavior ──────────────────────────────────────────────────────────

describe('VideoProjectionRegion — mount', () => {
  it('does NOT auto-play on mount', async () => {
    const { VideoProjectionRegion } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('seeks to trimStart on mount', async () => {
    const { VideoProjectionRegion } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    expect(currentTimeSetter).toHaveBeenCalledWith(MEDIA.trimStart)
  })
})

// ── transport: play ─────────────────────────────────────────────────────────

describe('VideoProjectionRegion — transport play', () => {
  it('calls video.play() when a play transport command arrives', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    playSpy.mockClear()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores play command on an unrelated storage key', async () => {
    const { VideoProjectionRegion } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    playSpy.mockClear()
    await act(async () => { fireTransport('unrelatedKey', 'play') })
    expect(playSpy).not.toHaveBeenCalled()
  })
})

// ── transport: pause ────────────────────────────────────────────────────────

describe('VideoProjectionRegion — transport pause', () => {
  it('calls video.pause() when a pause transport command arrives', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'pause') })
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })
})

// ── transport: seek ─────────────────────────────────────────────────────────

describe('VideoProjectionRegion — transport seek', () => {
  it('sets video.currentTime when a seek transport command arrives', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    await act(async () => { render(<VideoProjectionRegion {...defaultProps()} />) })
    currentTimeSetter.mockClear()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'seek', 7.5) })
    expect(currentTimeSetter).toHaveBeenCalledWith(7.5)
  })
})
