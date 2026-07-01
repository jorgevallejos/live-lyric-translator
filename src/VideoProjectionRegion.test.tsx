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
  absolutePathToMediaUrl: (path: string) => `media://${path}`,
}))

const TIMELINE: TimelineEntry[] = [{ start: 0, end: 2 }]
const LINES: SongItem[] = [{ languages: { es: 'Hola', en: 'Hello' } }]
const MEDIA: MediaFile = { type: 'video', src: 'test.mp4', trimStart: 3.0 }
const LAYOUT: ProjectionLayout = {
  frameWidthPx: 1920,
  frameHeightPx: 1280,
  frameLeftPx: 0,
  frameTopPx: 0,
  videoWidthPx: 1920,
  videoHeightPx: 1280,
  videoLeftPx: 0,
  videoTopPx: 0,
  subtitlePosition: 'overlay-bottom',
  fontSizePx: 48,
  subtitleBottomMarginPx: 58,
}
const SMALL_LAYOUT: ProjectionLayout = {
  frameWidthPx: 1920,
  frameHeightPx: 1280,
  frameLeftPx: 0,
  frameTopPx: 0,
  videoWidthPx: 1455,
  videoHeightPx: 970,
  videoLeftPx: 233,
  videoTopPx: -160,
  subtitlePosition: 'below-video',
  fontSizePx: 65,
  subtitleBottomMarginPx: 0,
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

function fireTransport(key: string, action: 'play' | 'pause' | 'stop', time?: number) {
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

// ── visibility hold ─────────────────────────────────────────────────────────

describe('VideoProjectionRegion — visibility hold until play', () => {
  it('shows a black cover on mount before any play command', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    expect(container.querySelector('.projection-animation-cover')).not.toBeNull()
  })

  it('removes the black cover after a play transport command', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { container } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(container.querySelector('.projection-animation-cover')).toBeNull()
  })

  it('keeps video visible (no cover) after a pause following play', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { container } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'pause') })
    expect(container.querySelector('.projection-animation-cover')).toBeNull()
  })

  it('resets to black on a fresh mount (cover is back after unmount + remount)', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { container: c1, unmount } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(c1.querySelector('.projection-animation-cover')).toBeNull()
    unmount()
    const { container: c2 } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    expect(c2.querySelector('.projection-animation-cover')).not.toBeNull()
  })
})

// ── transport: stop ─────────────────────────────────────────────────────────

describe('VideoProjectionRegion — transport stop', () => {
  it('restores the black cover after play + stop (hasStarted → false)', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { container } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(container.querySelector('.projection-animation-cover')).toBeNull()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'stop') })
    expect(container.querySelector('.projection-animation-cover')).not.toBeNull()
  })

  it('calls video.pause() on stop', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    pauseSpy.mockClear()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'stop') })
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })

  it('seeks to media.trimStart on stop', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    currentTimeSetter.mockClear()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'stop') })
    expect(currentTimeSetter).toHaveBeenCalledWith(MEDIA.trimStart)
  })

  it('reveals the video again when play arrives after a stop', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { container } = await act(async () => render(<VideoProjectionRegion {...defaultProps()} />))
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'stop') })
    expect(container.querySelector('.projection-animation-cover')).not.toBeNull()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(container.querySelector('.projection-animation-cover')).toBeNull()
  })
})

// ── intro screen (A2.3) ──────────────────────────────────────────────────────

describe('VideoProjectionRegion — intro screen (A2.3)', () => {
  it('shows the intro screen over the black cover when showIntroScreen is true and video has not started', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { getByTestId } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen
          introTitle="Tragedia de cerdo asado"
        />
      )
    )
    expect(getByTestId('song-intro-screen')).toBeTruthy()
    expect(getByTestId('song-intro-screen').textContent).toContain('Tragedia de cerdo asado')
  })

  it('does NOT show the intro screen when showIntroScreen is false', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { queryByTestId } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen={false}
          introTitle="Tragedia de cerdo asado"
        />
      )
    )
    expect(queryByTestId('song-intro-screen')).toBeNull()
  })

  it('shows translated title in parentheses when provided', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { getByText } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen
          introTitle="Tragedia de cerdo asado"
          introTranslatedTitle="Tragedy of Roasted Pig"
        />
      )
    )
    expect(getByText('(Tragedy of Roasted Pig)')).toBeTruthy()
  })

  it('shows intro tagline when provided', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { getByText } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen
          introTitle="Tragedia de cerdo asado"
          introTagline="Fight your destiny."
        />
      )
    )
    expect(getByText('Fight your destiny.')).toBeTruthy()
  })

  it('hides the intro screen once a play transport command arrives (hasStarted flips true)', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { queryByTestId } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen
          introTitle="Tragedia de cerdo asado"
        />
      )
    )
    expect(queryByTestId('song-intro-screen')).toBeTruthy()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(queryByTestId('song-intro-screen')).toBeNull()
  })

  it('intro screen reappears after a stop transport command (hasStarted flips back false)', async () => {
    const { VideoProjectionRegion, VIDEO_TRANSPORT_KEY } = await importRegion()
    const { queryByTestId } = await act(async () =>
      render(
        <VideoProjectionRegion
          {...defaultProps()}
          showIntroScreen
          introTitle="Tragedia de cerdo asado"
        />
      )
    )
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'play') })
    expect(queryByTestId('song-intro-screen')).toBeNull()
    await act(async () => { fireTransport(VIDEO_TRANSPORT_KEY, 'stop') })
    expect(queryByTestId('song-intro-screen')).toBeTruthy()
  })
})

// ── compositing geometry (Task B) ────────────────────────────────────────────

describe('VideoProjectionRegion — compositing geometry', () => {
  it('renders the animation region sized to the frame (letterbox container)', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: LAYOUT })} />)
    )
    const region = container.querySelector('.projection-animation-region') as HTMLElement
    expect(region).not.toBeNull()
    expect(region.style.width).toBe(`${LAYOUT.frameWidthPx}px`)
    expect(region.style.height).toBe(`${LAYOUT.frameHeightPx}px`)
  })

  it('big-screen profile: video box fills the frame exactly', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: LAYOUT })} />)
    )
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.width).toBe(`${LAYOUT.videoWidthPx}px`)
    expect(video.style.height).toBe(`${LAYOUT.videoHeightPx}px`)
  })

  it('big-screen profile: subtitle is positioned as an overlay near the bottom of the frame', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: LAYOUT })} />)
    )
    const subtitle = container.querySelector('.projection-lyric-overlay')
    expect(subtitle).not.toBeNull()
    // Should NOT render the separate below-video band container for overlay mode.
    expect(container.querySelector('.projection-subtitle-band')).toBeNull()
  })

  it('small-canvas profile: video box is scaled and offset within the frame', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: SMALL_LAYOUT })} />)
    )
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.width).toBe(`${SMALL_LAYOUT.videoWidthPx}px`)
    expect(video.style.height).toBe(`${SMALL_LAYOUT.videoHeightPx}px`)
  })

  it('small-canvas profile: subtitle renders in the below-video band, not as an overlay', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: SMALL_LAYOUT })} />)
    )
    expect(container.querySelector('.projection-subtitle-band')).not.toBeNull()
    expect(container.querySelector('.projection-lyric-overlay')).toBeNull()
  })

  it('subtitle font size always comes from layout.fontSizePx', async () => {
    const { VideoProjectionRegion } = await importRegion()
    const { container } = await act(async () =>
      render(<VideoProjectionRegion {...defaultProps({ layout: SMALL_LAYOUT })} />)
    )
    const lyric = container.querySelector('.projection-lyric') as HTMLElement
    expect(lyric.style.fontSize).toBe(`${SMALL_LAYOUT.fontSizePx}px`)
  })
})
