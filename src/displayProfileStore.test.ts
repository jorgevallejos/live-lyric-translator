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
    expect(profile.bandPercent).toBe(BIG_SCREEN_PRESET.bandPercent)
    expect(profile.textScale).toBe(BIG_SCREEN_PRESET.textScale)
  })

  it('returns small-canvas preset after setActiveProfileId("small-canvas")', () => {
    setActiveProfileId('small-canvas')
    const profile = getActiveDisplayProfile()
    expect(profile.id).toBe('small-canvas')
    expect(profile.bandPercent).toBe(SMALL_CANVAS_PRESET.bandPercent)
    expect(profile.textScale).toBe(SMALL_CANVAS_PRESET.textScale)
  })

  it('returns big-screen preset after setActiveProfileId("big-screen")', () => {
    setActiveProfileId('small-canvas')
    setActiveProfileId('big-screen')
    expect(getActiveDisplayProfile().id).toBe('big-screen')
  })

  it('returns custom profile after setCustomProfile', () => {
    setCustomProfile(22, 0.6)
    const profile = getActiveDisplayProfile()
    expect(profile.id).toBe('custom')
    expect(profile.bandPercent).toBe(22)
    expect(profile.textScale).toBe(0.6)
  })

  it('custom profile label is "Custom"', () => {
    setCustomProfile(20, 0.5)
    expect(getActiveDisplayProfile().label).toBe('Custom')
  })

  it('custom profile reads back updated values after a second setCustomProfile', () => {
    setCustomProfile(20, 0.5)
    setCustomProfile(35, 0.7)
    const profile = getActiveDisplayProfile()
    expect(profile.bandPercent).toBe(35)
    expect(profile.textScale).toBe(0.7)
  })

  it('stores profile id under DISPLAY_PROFILE_STORAGE_KEY', () => {
    setActiveProfileId('small-canvas')
    expect(localStorage.getItem(DISPLAY_PROFILE_STORAGE_KEY)).toBe('small-canvas')
  })
})
