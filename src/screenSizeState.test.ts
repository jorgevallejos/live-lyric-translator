import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SongMedia } from './songState'
import {
  getAvailableScreenSizes,
  getDefaultScreenSize,
  getProjectionStatusText,
  getStoredScreenSize,
  setStoredScreenSize,
  clearStoredScreenSize,
  type ScreenSize,
} from './screenSizeState'

// ── selector visibility rules ──────────────────────────────────────────────

describe('getAvailableScreenSizes', () => {
  it('returns [] when media is undefined', () => {
    expect(getAvailableScreenSizes(undefined)).toEqual([])
  })

  it('returns [] when media has no slots', () => {
    expect(getAvailableScreenSizes({})).toEqual([])
  })

  it('returns [small] when only small slot present', () => {
    const media: SongMedia = { small: { type: 'video', src: 'song-small.mov' } }
    expect(getAvailableScreenSizes(media)).toEqual(['small'])
  })

  it('returns [big] when only big slot present', () => {
    const media: SongMedia = { big: { type: 'video', src: 'song-big.mov' } }
    expect(getAvailableScreenSizes(media)).toEqual(['big'])
  })

  it('returns [small, big] when both slots present', () => {
    const media: SongMedia = {
      small: { type: 'video', src: 'song-small.mov' },
      big: { type: 'video', src: 'song-big.mov' },
    }
    expect(getAvailableScreenSizes(media)).toEqual(['small', 'big'])
  })
})

// ── default selection ──────────────────────────────────────────────────────

describe('getDefaultScreenSize', () => {
  it('returns null when media is undefined', () => {
    expect(getDefaultScreenSize(undefined)).toBeNull()
  })

  it('returns null when media has no slots', () => {
    expect(getDefaultScreenSize({})).toBeNull()
  })

  it('returns small when small slot present (even if big also present)', () => {
    const withBoth: SongMedia = {
      small: { type: 'video', src: 'song-small.mov' },
      big: { type: 'video', src: 'song-big.mov' },
    }
    expect(getDefaultScreenSize(withBoth)).toBe('small')
  })

  it('returns small when only small slot present', () => {
    const media: SongMedia = { small: { type: 'video', src: 'song-small.mov' } }
    expect(getDefaultScreenSize(media)).toBe('small')
  })

  it('returns big when only big slot present (small absent)', () => {
    const media: SongMedia = { big: { type: 'video', src: 'song-big.mov' } }
    expect(getDefaultScreenSize(media)).toBe('big')
  })
})

// ── status text ────────────────────────────────────────────────────────────

describe('getProjectionStatusText', () => {
  it('returns Closed when not open and no screen size', () => {
    expect(getProjectionStatusText(false, null)).toBe('Closed')
  })

  it('returns Closed when not open even if screen size given', () => {
    expect(getProjectionStatusText(false, 'small')).toBe('Closed')
  })

  it('returns Open when open but no screen size (non-video song)', () => {
    expect(getProjectionStatusText(true, null)).toBe('Open')
  })

  it('returns "Open, Small screen" when open with small screen size', () => {
    expect(getProjectionStatusText(true, 'small')).toBe('Open, Small screen')
  })

  it('returns "Open, Big screen" when open with big screen size', () => {
    expect(getProjectionStatusText(true, 'big')).toBe('Open, Big screen')
  })
})

// ── sessionStorage transitions ─────────────────────────────────────────────

describe('sessionStorage screen size state', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('getStoredScreenSize returns null when nothing stored', () => {
    expect(getStoredScreenSize()).toBeNull()
  })

  it('setStoredScreenSize persists the value and getStoredScreenSize reads it back', () => {
    setStoredScreenSize('small')
    expect(getStoredScreenSize()).toBe('small')
  })

  it('setStoredScreenSize can switch from small to big', () => {
    setStoredScreenSize('small')
    setStoredScreenSize('big')
    expect(getStoredScreenSize()).toBe('big')
  })

  it('clearStoredScreenSize removes the value', () => {
    setStoredScreenSize('big')
    clearStoredScreenSize()
    expect(getStoredScreenSize()).toBeNull()
  })

  it('getStoredScreenSize returns null for an unrecognized stored value', () => {
    sessionStorage.setItem('liveLyricScreenSize', 'medium')
    expect(getStoredScreenSize()).toBeNull()
  })
})
