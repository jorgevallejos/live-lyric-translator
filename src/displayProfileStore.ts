import {
  BIG_SCREEN_PRESET,
  SMALL_CANVAS_PRESET,
  type DisplayProfile,
  type ProfileId,
} from './displayProfile'

export const DISPLAY_PROFILE_STORAGE_KEY = 'display_profile_id'
const KEY_CUSTOM_BAND = 'display_profile_custom_band'
const KEY_CUSTOM_SCALE = 'display_profile_custom_scale'

const DEFAULT_CUSTOM_BAND = 20
const DEFAULT_CUSTOM_SCALE = 0.5

export function getActiveDisplayProfile(): DisplayProfile {
  const raw = localStorage.getItem(DISPLAY_PROFILE_STORAGE_KEY) as ProfileId | null
  const id: ProfileId = raw ?? 'big-screen'

  if (id === 'big-screen') return BIG_SCREEN_PRESET
  if (id === 'small-canvas') return SMALL_CANVAS_PRESET

  const rawBand = localStorage.getItem(KEY_CUSTOM_BAND)
  const rawScale = localStorage.getItem(KEY_CUSTOM_SCALE)
  const bandPercent = rawBand !== null ? Number(rawBand) : DEFAULT_CUSTOM_BAND
  const textScale = rawScale !== null ? Number(rawScale) : DEFAULT_CUSTOM_SCALE
  return {
    id: 'custom',
    label: 'Custom',
    bandPercent: isNaN(bandPercent) ? DEFAULT_CUSTOM_BAND : bandPercent,
    textScale: isNaN(textScale) ? DEFAULT_CUSTOM_SCALE : textScale,
  }
}

export function setActiveProfileId(id: Exclude<ProfileId, 'custom'>): void {
  localStorage.setItem(DISPLAY_PROFILE_STORAGE_KEY, id)
}

export function setCustomProfile(bandPercent: number, textScale: number): void {
  localStorage.setItem(DISPLAY_PROFILE_STORAGE_KEY, 'custom')
  localStorage.setItem(KEY_CUSTOM_BAND, String(bandPercent))
  localStorage.setItem(KEY_CUSTOM_SCALE, String(textScale))
}
