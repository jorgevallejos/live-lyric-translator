export type ProfileId = 'big-screen' | 'small-canvas' | 'custom'

export interface DisplayProfile {
  id: ProfileId
  label: string
  bandPercent: number
  textScale: number
}

export interface ProjectionLayout {
  /** px height of the subtitle band at the bottom */
  bandHeightPx: number
  /** px height of the animation region above the band */
  animationHeightPx: number
  /** px font size for subtitle text */
  fontSizePx: number
}

export const BIG_SCREEN_PRESET: DisplayProfile = {
  id: 'big-screen',
  label: 'Big screen (cinema)',
  bandPercent: 13,
  textScale: 0.45,
}

export const SMALL_CANVAS_PRESET: DisplayProfile = {
  id: 'small-canvas',
  label: 'Small canvas 130×100',
  bandPercent: 28,
  textScale: 0.45,
}

export const DISPLAY_PRESETS: DisplayProfile[] = [BIG_SCREEN_PRESET, SMALL_CANVAS_PRESET]

export function computeProjectionLayout(
  profile: DisplayProfile,
  _viewportWidth: number,
  viewportHeight: number
): ProjectionLayout {
  const bandHeightPx = Math.round(viewportHeight * profile.bandPercent / 100)
  const animationHeightPx = viewportHeight - bandHeightPx
  const fontSizePx = Math.round(bandHeightPx * profile.textScale)
  return { bandHeightPx, animationHeightPx, fontSizePx }
}
