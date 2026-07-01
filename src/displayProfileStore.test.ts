/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getActiveDisplayProfile,
  setActiveProfileId,
  setCustomProfile,
  DISPLAY_PROFILE_STORAGE_KEY,
} from './displayProfileStore'
import { BIG_SCREEN_PRESET, SMALL_CANVAS_PRESET } from './displayProfile'

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

describe('getActiveDisplayProfile', () => {
  it('returns big-screen preset when nothing is stored', () => {
    const profile = getActiveDisplayProfile()
    expect(profile.id).toBe('big-screen')
    expect(profile.videoScalePercent).toBe(BIG_SCREEN_PRESET.videoScalePercent)
    expect(profile.subtitleFontPercent).toBe(BIG_SCREEN_PRESET.subtitleFontPercent)
  })

  it('returns small-canvas preset after setActiveProfileId("small-canvas")', () => {
    setActiveProfileId('small-canvas')
    const profile = getActiveDisplayProfile()
    expect(profile.id).toBe('small-canvas')
    expect(profile.videoScalePercent).toBe(SMALL_CANVAS_PRESET.videoScalePercent)
    expect(profile.subtitleFontPercent).toBe(SMALL_CANVAS_PRESET.subtitleFontPercent)
  })

  it('returns big-screen preset after setActiveProfileId("big-screen")', () => {
    setActiveProfileId('small-canvas')
    setActiveProfileId('big-screen')
    expect(getActiveDisplayProfile().id).toBe('big-screen')
  })

  it('returns custom profile after setCustomProfile', () => {
    setCustomProfile({ videoScalePercent: 80, videoCenterYPercent: 45, subtitleFontPercent: 4 })
    const profile = getActiveDisplayProfile()
    expect(profile.id).toBe('custom')
    expect(profile.videoScalePercent).toBe(80)
    expect(profile.videoCenterYPercent).toBe(45)
    expect(profile.subtitleFontPercent).toBe(4)
  })

  it('custom profile label is "Custom"', () => {
    setCustomProfile({ videoScalePercent: 100, videoCenterYPercent: 50, subtitleFontPercent: 3.73 })
    expect(getActiveDisplayProfile().label).toBe('Custom')
  })

  it('custom profile reads back updated values after a second setCustomProfile', () => {
    setCustomProfile({ videoScalePercent: 100, videoCenterYPercent: 50, subtitleFontPercent: 3.73 })
    setCustomProfile({ videoScalePercent: 60, videoCenterYPercent: 35, subtitleFontPercent: 5 })
    const profile = getActiveDisplayProfile()
    expect(profile.videoScalePercent).toBe(60)
    expect(profile.videoCenterYPercent).toBe(35)
    expect(profile.subtitleFontPercent).toBe(5)
  })

  it('stores profile id under DISPLAY_PROFILE_STORAGE_KEY', () => {
    setActiveProfileId('small-canvas')
    expect(localStorage.getItem(DISPLAY_PROFILE_STORAGE_KEY)).toBe('small-canvas')
  })
})
