import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getProjectionStatusText,
  getStoredDisplayMode,
  setStoredDisplayMode,
  clearStoredDisplayMode,
  getDefaultDisplayMode,
  type DisplayMode,
} from './screenSizeState'

// ── DisplayMode type ───────────────────────────────────────────────────────

describe('DisplayMode type', () => {
  it('getDefaultDisplayMode returns "none" when song has media (default is always None)', () => {
    const mode: DisplayMode = getDefaultDisplayMode(true)
    expect(mode).toBe('none')
  })

  it('getDefaultDisplayMode returns "none" when song has no media', () => {
    const mode: DisplayMode = getDefaultDisplayMode(false)
    expect(mode).toBe('none')
  })
})

// ── available screen sizes ─────────────────────────────────────────────────

/**
 * **`ScreenSize` went on 2026-09-03 and its tests went with it.** `getDefaultScreenSize`,
 * `getAvailableScreenSizes`, the four storage helpers and the two-argument shape of
 * `getProjectionStatusText` were all part of a chain a sweep proved dead end to end — the value
 * never reached this text, the profile it also wrote was never read back, and the WebSocket
 * message it sent was handled by nobody.
 *
 * **`DisplayMode` is what remains, and it is a different thing.** It is also going, and it waits
 * on the drive-mode design.
 */
describe('getProjectionStatusText', () => {
  it('returns Closed when not open, whatever the mode', () => {
    expect(getProjectionStatusText(false)).toBe('Closed')
    expect(getProjectionStatusText(false, 'big')).toBe('Closed')
  })

  it('returns a bare Open when there is no mode to report', () => {
    // A non-video song is handed no mode at all, which is what this answers.
    expect(getProjectionStatusText(true)).toBe('Open')
  })
})

describe('getProjectionStatusText with DisplayMode', () => {
  it('returns "Open, No video" when open with display mode "none"', () => {
    expect(getProjectionStatusText(true, 'none')).toBe('Open, No video')
  })

  it('returns "Open, Small" when open with display mode "small"', () => {
    expect(getProjectionStatusText(true, 'small')).toBe('Open, Small')
  })

  it('returns "Open, Big" when open with display mode "big"', () => {
    expect(getProjectionStatusText(true, 'big')).toBe('Open, Big')
  })

  it('returns "Closed" when not open, even with display mode', () => {
    expect(getProjectionStatusText(false, 'none')).toBe('Closed')
    expect(getProjectionStatusText(false, 'small')).toBe('Closed')
  })
})

// ── sessionStorage display mode state ─────────────────────────────────────

describe('sessionStorage display mode state', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('getStoredDisplayMode returns null when nothing stored', () => {
    expect(getStoredDisplayMode()).toBeNull()
  })

  it('setStoredDisplayMode persists "none" and getStoredDisplayMode reads it back', () => {
    setStoredDisplayMode('none')
    expect(getStoredDisplayMode()).toBe('none')
  })

  it('setStoredDisplayMode persists "small" and reads back', () => {
    setStoredDisplayMode('small')
    expect(getStoredDisplayMode()).toBe('small')
  })

  it('setStoredDisplayMode persists "big" and reads back', () => {
    setStoredDisplayMode('big')
    expect(getStoredDisplayMode()).toBe('big')
  })

  it('clearStoredDisplayMode removes the value', () => {
    setStoredDisplayMode('big')
    clearStoredDisplayMode()
    expect(getStoredDisplayMode()).toBeNull()
  })

  it('getStoredDisplayMode returns null for an unrecognized stored value', () => {
    sessionStorage.setItem('liveLyricDisplayMode', 'medium')
    expect(getStoredDisplayMode()).toBeNull()
  })
})

// ── sessionStorage transitions ─────────────────────────────────────────────
