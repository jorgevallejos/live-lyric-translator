import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getProjectionStatusText,
  getStoredScreenSize,
  setStoredScreenSize,
  clearStoredScreenSize,
  getAvailableScreenSizes,
  getDefaultScreenSize,
  getStoredDisplayMode,
  setStoredDisplayMode,
  clearStoredDisplayMode,
  getDefaultDisplayMode,
  type DisplayMode,
} from './screenSizeState'

// ── DisplayMode type ───────────────────────────────────────────────────────

describe('DisplayMode type', () => {
  it('getDefaultDisplayMode returns "small" when song has media', () => {
    const mode: DisplayMode = getDefaultDisplayMode(true)
    expect(mode).toBe('small')
  })

  it('getDefaultDisplayMode returns "none" when song has no media', () => {
    const mode: DisplayMode = getDefaultDisplayMode(false)
    expect(mode).toBe('none')
  })
})

// ── available screen sizes ─────────────────────────────────────────────────

describe('getDefaultScreenSize', () => {
  it('returns small when song has media', () => {
    expect(getDefaultScreenSize(true)).toBe('small')
  })

  it('returns null when song has no media', () => {
    expect(getDefaultScreenSize(false)).toBeNull()
  })
})

describe('getAvailableScreenSizes', () => {
  it('returns both sizes when song has media', () => {
    expect(getAvailableScreenSizes(true)).toEqual(['big', 'small'])
  })

  it('returns empty array when song has no media', () => {
    expect(getAvailableScreenSizes(false)).toEqual([])
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

  it('returns "Open, Small" when open with small screen size', () => {
    expect(getProjectionStatusText(true, 'small')).toBe('Open, Small')
  })

  it('returns "Open, Big" when open with big screen size', () => {
    expect(getProjectionStatusText(true, 'big')).toBe('Open, Big')
  })
})

// ── getProjectionStatusText with DisplayMode ───────────────────────────────

describe('getProjectionStatusText with DisplayMode', () => {
  it('returns "Open, No video" when open with display mode "none"', () => {
    expect(getProjectionStatusText(true, null, 'none')).toBe('Open, No video')
  })

  it('returns "Open, Small" when open with display mode "small"', () => {
    expect(getProjectionStatusText(true, null, 'small')).toBe('Open, Small')
  })

  it('returns "Open, Big" when open with display mode "big"', () => {
    expect(getProjectionStatusText(true, null, 'big')).toBe('Open, Big')
  })

  it('returns "Closed" when not open, even with display mode', () => {
    expect(getProjectionStatusText(false, null, 'none')).toBe('Closed')
    expect(getProjectionStatusText(false, null, 'small')).toBe('Closed')
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
