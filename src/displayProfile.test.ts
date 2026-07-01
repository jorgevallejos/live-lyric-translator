/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import {
  computeProjectionLayout,
  BIG_SCREEN_PRESET,
  SMALL_CANVAS_PRESET,
  DISPLAY_PRESETS,
  FRAME_ASPECT_RATIO,
  type DisplayProfile,
} from './displayProfile'

describe('computeProjectionLayout — 3:2 frame containment', () => {
  const makeProfile = (overrides: Partial<DisplayProfile> = {}): DisplayProfile => ({
    id: 'custom',
    label: 'Test',
    videoScalePercent: 100,
    videoCenterYPercent: 50,
    subtitlePosition: 'overlay-bottom',
    subtitleFontPercent: 3.73,
    subtitleBottomMarginPercent: 4.5,
    ...overrides,
  })

  it('when viewport is exactly 3:2, the frame fills the viewport', () => {
    const layout = computeProjectionLayout(makeProfile(), 1920, 1280)
    expect(layout.frameWidthPx).toBe(1920)
    expect(layout.frameHeightPx).toBe(1280)
    expect(layout.frameLeftPx).toBe(0)
    expect(layout.frameTopPx).toBe(0)
  })

  it('when viewport is wider than 3:2, the frame is height-limited and letterboxed left/right', () => {
    // 1920x1080 viewport (16:9) is wider than 3:2 -> height-constrained
    const layout = computeProjectionLayout(makeProfile(), 1920, 1080)
    expect(layout.frameHeightPx).toBe(1080)
    expect(layout.frameWidthPx).toBe(Math.round(1080 * FRAME_ASPECT_RATIO))
    expect(layout.frameLeftPx).toBeGreaterThan(0)
    expect(layout.frameTopPx).toBe(0)
  })

  it('when viewport is narrower than 3:2, the frame is width-limited and letterboxed top/bottom', () => {
    // 1000x1000 viewport (1:1) is narrower than 3:2 -> width-constrained
    const layout = computeProjectionLayout(makeProfile(), 1000, 1000)
    expect(layout.frameWidthPx).toBe(1000)
    expect(layout.frameHeightPx).toBe(Math.round(1000 / FRAME_ASPECT_RATIO))
    expect(layout.frameTopPx).toBeGreaterThan(0)
    expect(layout.frameLeftPx).toBe(0)
  })

  it('videoScalePercent 100 fills the frame exactly', () => {
    const layout = computeProjectionLayout(makeProfile({ videoScalePercent: 100 }), 1920, 1280)
    expect(layout.videoWidthPx).toBe(layout.frameWidthPx)
    expect(layout.videoHeightPx).toBe(layout.frameHeightPx)
  })

  it('videoScalePercent 75.8 scales the video box uniformly within the frame', () => {
    const layout = computeProjectionLayout(makeProfile({ videoScalePercent: 75.8 }), 1920, 1280)
    expect(layout.videoWidthPx).toBe(Math.round(layout.frameWidthPx * 0.758))
    expect(layout.videoHeightPx).toBe(Math.round(layout.frameHeightPx * 0.758))
  })

  it('videoCenterYPercent 50 centers the video box vertically in the frame', () => {
    const layout = computeProjectionLayout(makeProfile({ videoScalePercent: 100, videoCenterYPercent: 50 }), 1920, 1280)
    expect(layout.videoTopPx).toBe(layout.frameTopPx)
  })

  it('videoCenterYPercent 38.3 shifts the video box up, leaving room below for the small-canvas subtitle band', () => {
    const layout = computeProjectionLayout(
      makeProfile({ videoScalePercent: 75.8, videoCenterYPercent: 38.3 }),
      1920,
      1280
    )
    const expectedCenterY = layout.frameTopPx + layout.frameHeightPx * 0.383
    const expectedTop = Math.round(expectedCenterY - layout.videoHeightPx / 2)
    expect(layout.videoTopPx).toBe(expectedTop)
    // bottom edge should leave meaningful room below (roughly the remaining ~24% of frame height)
    const videoBottom = layout.videoTopPx + layout.videoHeightPx
    const frameBottom = layout.frameTopPx + layout.frameHeightPx
    expect(frameBottom - videoBottom).toBeGreaterThan(layout.frameHeightPx * 0.2)
  })

  it('video box is horizontally centered in the frame regardless of scale', () => {
    const layout = computeProjectionLayout(makeProfile({ videoScalePercent: 75.8 }), 1920, 1280)
    const expectedLeft = layout.frameLeftPx + (layout.frameWidthPx - layout.videoWidthPx) / 2
    expect(layout.videoLeftPx).toBe(Math.round(expectedLeft))
  })

  it('font size is subtitleFontPercent of the frame height (rounded)', () => {
    const layout = computeProjectionLayout(makeProfile({ subtitleFontPercent: 3.73 }), 1920, 1280)
    expect(layout.fontSizePx).toBe(Math.round(1280 * 0.0373))
  })

  it('bottom margin is subtitleBottomMarginPercent of the frame height (rounded)', () => {
    const layout = computeProjectionLayout(makeProfile({ subtitleBottomMarginPercent: 4.5 }), 1920, 1280)
    expect(layout.subtitleBottomMarginPx).toBe(Math.round(1280 * 0.045))
  })

  it('subtitlePosition passes through unchanged', () => {
    const overlay = computeProjectionLayout(makeProfile({ subtitlePosition: 'overlay-bottom' }), 1920, 1280)
    const below = computeProjectionLayout(makeProfile({ subtitlePosition: 'below-video' }), 1920, 1280)
    expect(overlay.subtitlePosition).toBe('overlay-bottom')
    expect(below.subtitlePosition).toBe('below-video')
  })

  it('handles zero viewport height gracefully (no negative/NaN values)', () => {
    const layout = computeProjectionLayout(makeProfile(), 1920, 0)
    expect(layout.frameHeightPx).toBe(0)
    expect(layout.frameWidthPx).toBe(0)
    expect(layout.videoWidthPx).toBe(0)
    expect(layout.videoHeightPx).toBe(0)
    expect(layout.fontSizePx).toBe(0)
  })

  it('different viewport sizes at the same aspect ratio produce proportional frames', () => {
    const a = computeProjectionLayout(makeProfile(), 1920, 1280)
    const b = computeProjectionLayout(makeProfile(), 960, 640)
    expect(a.frameWidthPx).toBe(b.frameWidthPx * 2)
    expect(a.frameHeightPx).toBe(b.frameHeightPx * 2)
  })
})

describe('BIG_SCREEN_PRESET', () => {
  it('has id big-screen', () => {
    expect(BIG_SCREEN_PRESET.id).toBe('big-screen')
  })

  it('fills the frame at native scale (no crop, no split)', () => {
    expect(BIG_SCREEN_PRESET.videoScalePercent).toBe(100)
    expect(BIG_SCREEN_PRESET.videoCenterYPercent).toBe(50)
  })

  it('overlays the subtitle over the bottom of the video', () => {
    expect(BIG_SCREEN_PRESET.subtitlePosition).toBe('overlay-bottom')
  })

  it('subtitle font is ~3.73% of frame height (118/3168)', () => {
    expect(BIG_SCREEN_PRESET.subtitleFontPercent).toBeCloseTo(118 / 3168 * 100, 2)
  })

  it('produces a full-frame video box at 1920x1280', () => {
    const layout = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1280)
    expect(layout.videoWidthPx).toBe(layout.frameWidthPx)
    expect(layout.videoHeightPx).toBe(layout.frameHeightPx)
  })
})

describe('SMALL_CANVAS_PRESET', () => {
  it('has id small-canvas', () => {
    expect(SMALL_CANVAS_PRESET.id).toBe('small-canvas')
  })

  it('scales the video to 75.8% of the frame', () => {
    expect(SMALL_CANVAS_PRESET.videoScalePercent).toBe(75.8)
  })

  it('shifts the video center up to 38.3% of frame height', () => {
    expect(SMALL_CANVAS_PRESET.videoCenterYPercent).toBeCloseTo(1213.4 / 3168 * 100, 2)
  })

  it('centers the subtitle in the bottom black area', () => {
    expect(SMALL_CANVAS_PRESET.subtitlePosition).toBe('below-video')
  })

  it('subtitle font is ~5.05% of frame height (160/3168), larger than big screen', () => {
    expect(SMALL_CANVAS_PRESET.subtitleFontPercent).toBeCloseTo(160 / 3168 * 100, 2)
    expect(SMALL_CANVAS_PRESET.subtitleFontPercent).toBeGreaterThan(BIG_SCREEN_PRESET.subtitleFontPercent)
  })

  it('leaves the bottom ~23.8% of the frame black below the video at 1920x1280', () => {
    const layout = computeProjectionLayout(SMALL_CANVAS_PRESET, 1920, 1280)
    const videoBottom = layout.videoTopPx + layout.videoHeightPx
    const frameBottom = layout.frameTopPx + layout.frameHeightPx
    const blackBandPx = frameBottom - videoBottom
    expect(blackBandPx / layout.frameHeightPx).toBeCloseTo(0.238, 1)
  })

  it('has a smaller video box than big screen at the same resolution', () => {
    const big = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1280)
    const small = computeProjectionLayout(SMALL_CANVAS_PRESET, 1920, 1280)
    expect(small.videoWidthPx).toBeLessThan(big.videoWidthPx)
    expect(small.videoHeightPx).toBeLessThan(big.videoHeightPx)
  })
})

describe('DISPLAY_PRESETS', () => {
  it('contains exactly big-screen and small-canvas', () => {
    const ids = DISPLAY_PRESETS.map((p) => p.id)
    expect(ids).toContain('big-screen')
    expect(ids).toContain('small-canvas')
    expect(DISPLAY_PRESETS).toHaveLength(2)
  })
})
