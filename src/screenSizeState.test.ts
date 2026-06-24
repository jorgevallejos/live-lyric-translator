import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getProjectionStatusText,
  getStoredScreenSize,
  setStoredScreenSize,
  clearStoredScreenSize,
  getAvailableScreenSizes,
  getDefaultScreenSize,
} from './screenSizeState'

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
