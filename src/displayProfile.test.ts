/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import {
  computeProjectionLayout,
  BIG_SCREEN_PRESET,
  SMALL_CANVAS_PRESET,
  DISPLAY_PRESETS,
  type DisplayProfile,
} from './displayProfile'

describe('computeProjectionLayout', () => {
  const makeProfile = (bandPercent: number, textScale: number): DisplayProfile => ({
    id: 'custom',
    label: 'Test',
    bandPercent,
    textScale,
  })

  it('band height is rounded percent of viewport height', () => {
    const layout = computeProjectionLayout(makeProfile(13, 0.5), 1920, 1080)
    expect(layout.bandHeightPx).toBe(Math.round(1080 * 0.13)) // 140
  })

  it('animation height is viewport height minus band height', () => {
    const layout = computeProjectionLayout(makeProfile(13, 0.5), 1920, 1080)
    expect(layout.animationHeightPx).toBe(1080 - layout.bandHeightPx)
  })

  it('band height + animation height equals viewport height exactly', () => {
    const layout = computeProjectionLayout(makeProfile(28, 0.45), 1920, 1080)
    expect(layout.bandHeightPx + layout.animationHeightPx).toBe(1080)
  })

  it('font size is textScale times band height (rounded)', () => {
    const layout = computeProjectionLayout(makeProfile(13, 0.5), 1920, 1080)
    expect(layout.fontSizePx).toBe(Math.round(layout.bandHeightPx * 0.5))
  })

  it('different viewport heights produce proportional band heights', () => {
    const a = computeProjectionLayout(makeProfile(20, 0.5), 1920, 1080)
    const b = computeProjectionLayout(makeProfile(20, 0.5), 1920, 768)
    expect(a.bandHeightPx).toBe(Math.round(1080 * 0.20))
    expect(b.bandHeightPx).toBe(Math.round(768 * 0.20))
  })

  it('viewport width does not affect band height', () => {
    const narrow = computeProjectionLayout(makeProfile(15, 0.5), 800, 600)
    const wide = computeProjectionLayout(makeProfile(15, 0.5), 3840, 600)
    expect(narrow.bandHeightPx).toBe(wide.bandHeightPx)
    expect(narrow.animationHeightPx).toBe(wide.animationHeightPx)
    expect(narrow.fontSizePx).toBe(wide.fontSizePx)
  })

  it('handles zero viewport height gracefully (no negative values)', () => {
    const layout = computeProjectionLayout(makeProfile(13, 0.5), 1920, 0)
    expect(layout.bandHeightPx).toBe(0)
    expect(layout.animationHeightPx).toBe(0)
    expect(layout.fontSizePx).toBe(0)
  })

  it('100% band leaves animation height of 0', () => {
    const layout = computeProjectionLayout(makeProfile(100, 0.5), 1920, 1080)
    expect(layout.bandHeightPx).toBe(1080)
    expect(layout.animationHeightPx).toBe(0)
  })

  it('0% band leaves full viewport as animation region', () => {
    const layout = computeProjectionLayout(makeProfile(0, 0.5), 1920, 1080)
    expect(layout.bandHeightPx).toBe(0)
    expect(layout.animationHeightPx).toBe(1080)
    expect(layout.fontSizePx).toBe(0)
  })
})

describe('BIG_SCREEN_PRESET', () => {
  it('has id big-screen', () => {
    expect(BIG_SCREEN_PRESET.id).toBe('big-screen')
  })

  it('band is approximately 13% of viewport height', () => {
    const layout = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1080)
    expect(layout.bandHeightPx).toBe(Math.round(1080 * 0.13))
  })

  it('animation region takes the remainder at 1080p', () => {
    const layout = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1080)
    expect(layout.animationHeightPx).toBe(1080 - Math.round(1080 * 0.13))
  })
})

describe('SMALL_CANVAS_PRESET', () => {
  it('has id small-canvas', () => {
    expect(SMALL_CANVAS_PRESET.id).toBe('small-canvas')
  })

  it('band is approximately 28% of viewport height', () => {
    const layout = computeProjectionLayout(SMALL_CANVAS_PRESET, 1920, 1080)
    expect(layout.bandHeightPx).toBe(Math.round(1080 * 0.28))
  })

  it('small canvas band is taller than big screen band at same resolution', () => {
    const big = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1080)
    const small = computeProjectionLayout(SMALL_CANVAS_PRESET, 1920, 1080)
    expect(small.bandHeightPx).toBeGreaterThan(big.bandHeightPx)
  })

  it('small canvas has larger absolute font size than big screen at 1080p', () => {
    const big = computeProjectionLayout(BIG_SCREEN_PRESET, 1920, 1080)
    const small = computeProjectionLayout(SMALL_CANVAS_PRESET, 1920, 1080)
    expect(small.fontSizePx).toBeGreaterThan(big.fontSizePx)
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
