import {
  BIG_SCREEN_PRESET,
  SMALL_CANVAS_PRESET,
  type DisplayProfile,
  type ProfileId,
  type SubtitlePosition,
} from './displayProfile'

export const DISPLAY_PROFILE_STORAGE_KEY = 'display_profile_id'
const KEY_CUSTOM_SCALE = 'display_profile_custom_scale'
const KEY_CUSTOM_CENTER_Y = 'display_profile_custom_center_y'
const KEY_CUSTOM_FONT = 'display_profile_custom_font'
const KEY_CUSTOM_POSITION = 'display_profile_custom_position'
const KEY_CUSTOM_BOTTOM_MARGIN = 'display_profile_custom_bottom_margin'

const DEFAULT_CUSTOM_SCALE = 100
const DEFAULT_CUSTOM_CENTER_Y = 50
const DEFAULT_CUSTOM_FONT = 3.73
const DEFAULT_CUSTOM_POSITION: SubtitlePosition = 'overlay-bottom'
const DEFAULT_CUSTOM_BOTTOM_MARGIN = 4.5

export interface CustomProfileInput {
  videoScalePercent: number
  videoCenterYPercent: number
  subtitleFontPercent: number
  subtitlePosition?: SubtitlePosition
  subtitleBottomMarginPercent?: number
}

export function getActiveDisplayProfile(): DisplayProfile {
  const raw = localStorage.getItem(DISPLAY_PROFILE_STORAGE_KEY) as ProfileId | null
  const id: ProfileId = raw ?? 'big-screen'

  if (id === 'big-screen') return BIG_SCREEN_PRESET
  if (id === 'small-canvas') return SMALL_CANVAS_PRESET

  const videoScalePercent = numberOr(localStorage.getItem(KEY_CUSTOM_SCALE), DEFAULT_CUSTOM_SCALE)
  const videoCenterYPercent = numberOr(localStorage.getItem(KEY_CUSTOM_CENTER_Y), DEFAULT_CUSTOM_CENTER_Y)
  const subtitleFontPercent = numberOr(localStorage.getItem(KEY_CUSTOM_FONT), DEFAULT_CUSTOM_FONT)
  const subtitleBottomMarginPercent = numberOr(
    localStorage.getItem(KEY_CUSTOM_BOTTOM_MARGIN),
    DEFAULT_CUSTOM_BOTTOM_MARGIN
  )
  const rawPosition = localStorage.getItem(KEY_CUSTOM_POSITION) as SubtitlePosition | null
  const subtitlePosition: SubtitlePosition = rawPosition ?? DEFAULT_CUSTOM_POSITION

  return {
    id: 'custom',
    label: 'Custom',
    videoScalePercent,
    videoCenterYPercent,
    subtitlePosition,
    subtitleFontPercent,
    subtitleBottomMarginPercent,
  }
}

export function setActiveProfileId(id: Exclude<ProfileId, 'custom'>): void {
  localStorage.setItem(DISPLAY_PROFILE_STORAGE_KEY, id)
}

export function setCustomProfile(input: CustomProfileInput): void {
  localStorage.setItem(DISPLAY_PROFILE_STORAGE_KEY, 'custom')
  localStorage.setItem(KEY_CUSTOM_SCALE, String(input.videoScalePercent))
  localStorage.setItem(KEY_CUSTOM_CENTER_Y, String(input.videoCenterYPercent))
  localStorage.setItem(KEY_CUSTOM_FONT, String(input.subtitleFontPercent))
  if (input.subtitlePosition !== undefined) {
    localStorage.setItem(KEY_CUSTOM_POSITION, input.subtitlePosition)
  }
  if (input.subtitleBottomMarginPercent !== undefined) {
    localStorage.setItem(KEY_CUSTOM_BOTTOM_MARGIN, String(input.subtitleBottomMarginPercent))
  }
}

function numberOr(raw: string | null, fallback: number): number {
  if (raw === null) return fallback
  const n = Number(raw)
  return isNaN(n) ? fallback : n
}
