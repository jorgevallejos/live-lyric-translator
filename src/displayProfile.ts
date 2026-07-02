export type ProfileId = 'big-screen' | 'small-canvas' | 'custom'

/**
 * Where the subtitle sits relative to the video box:
 *  - 'overlay-bottom': superimposed over the video, bottom-centered (big screen).
 *  - 'below-video': centered in the black area below the video box (small canvas).
 */
export type SubtitlePosition = 'overlay-bottom' | 'below-video'

/**
 * The reference frame all geometry is expressed against: both big/small stills were
 * exported from one Premiere sequence at 4752×3168 = 3:2, matching the clean master
 * mp4 (1920×1280 = 3:2). Every profile number below is a percentage of this 3:2 frame,
 * so it's resolution-independent — the frame is `object-fit: contain`-ed into the
 * actual projector viewport (letterboxed only if the projector isn't 3:2).
 */
export const FRAME_ASPECT_RATIO = 3 / 2

export interface DisplayProfile {
  id: ProfileId
  label: string
  /** Uniform scale of the video box relative to the 3:2 frame (100 = fills the frame). */
  videoScalePercent: number
  /** Vertical center of the video box, as % of frame height (50 = centered). */
  videoCenterYPercent: number
  subtitlePosition: SubtitlePosition
  /** Subtitle font size as % of frame height. */
  subtitleFontPercent: number
  /** Bottom margin for an 'overlay-bottom' subtitle, as % of frame height. */
  subtitleBottomMarginPercent: number
}

export interface ProjectionLayout {
  /** The 3:2 frame, contained within the viewport (letterboxed if AR mismatches). */
  frameWidthPx: number
  frameHeightPx: number
  frameLeftPx: number
  frameTopPx: number

  /** The video's on-screen box (scaled/positioned within the frame per profile). */
  videoWidthPx: number
  videoHeightPx: number
  videoLeftPx: number
  videoTopPx: number

  subtitlePosition: SubtitlePosition
  fontSizePx: number
  subtitleBottomMarginPx: number
}

export const BIG_SCREEN_PRESET: DisplayProfile = {
  id: 'big-screen',
  label: 'Big screen (cinema)',
  videoScalePercent: 100,
  videoCenterYPercent: 50,
  subtitlePosition: 'overlay-bottom',
  subtitleFontPercent: (118 / 3168) * 100,
  subtitleBottomMarginPercent: 4.5,
}

export const SMALL_CANVAS_PRESET: DisplayProfile = {
  id: 'small-canvas',
  label: 'Small canvas 130×100',
  // Same full-frame overlay geometry as big screen; differs ONLY in font size.
  videoScalePercent: 100,
  videoCenterYPercent: 50,
  subtitlePosition: 'overlay-bottom',
  subtitleFontPercent: (160 / 3168) * 100,
  subtitleBottomMarginPercent: 4.5,
}

export const DISPLAY_PRESETS: DisplayProfile[] = [BIG_SCREEN_PRESET, SMALL_CANVAS_PRESET]

/**
 * Computes the 3:2 frame containment + video box + subtitle geometry for the
 * projection viewport, per the active display profile. All profile numbers are
 * percentages of the 3:2 frame, so the result is resolution-independent.
 */
export function computeProjectionLayout(
  profile: DisplayProfile,
  viewportWidth: number,
  viewportHeight: number
): ProjectionLayout {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return {
      frameWidthPx: 0,
      frameHeightPx: 0,
      frameLeftPx: 0,
      frameTopPx: 0,
      videoWidthPx: 0,
      videoHeightPx: 0,
      videoLeftPx: 0,
      videoTopPx: 0,
      subtitlePosition: profile.subtitlePosition,
      fontSizePx: 0,
      subtitleBottomMarginPx: 0,
    }
  }

  // Contain the 3:2 frame within the viewport.
  const viewportAspect = viewportWidth / viewportHeight
  let frameWidthPx: number
  let frameHeightPx: number
  if (viewportAspect > FRAME_ASPECT_RATIO) {
    // Viewport is wider than 3:2 -> height-constrained, letterbox left/right.
    frameHeightPx = viewportHeight
    frameWidthPx = Math.round(viewportHeight * FRAME_ASPECT_RATIO)
  } else {
    // Viewport is narrower than (or equal to) 3:2 -> width-constrained, letterbox top/bottom.
    frameWidthPx = viewportWidth
    frameHeightPx = Math.round(viewportWidth / FRAME_ASPECT_RATIO)
  }
  const frameLeftPx = Math.round((viewportWidth - frameWidthPx) / 2)
  const frameTopPx = Math.round((viewportHeight - frameHeightPx) / 2)

  // Video box: uniformly scaled, horizontally centered, vertically positioned per profile.
  const videoWidthPx = Math.round(frameWidthPx * profile.videoScalePercent / 100)
  const videoHeightPx = Math.round(frameHeightPx * profile.videoScalePercent / 100)
  const videoLeftPx = Math.round(frameLeftPx + (frameWidthPx - videoWidthPx) / 2)
  const videoCenterYPx = frameTopPx + (frameHeightPx * profile.videoCenterYPercent) / 100
  const videoTopPx = Math.round(videoCenterYPx - videoHeightPx / 2)

  const fontSizePx = Math.round((frameHeightPx * profile.subtitleFontPercent) / 100)
  const subtitleBottomMarginPx = Math.round((frameHeightPx * profile.subtitleBottomMarginPercent) / 100)

  return {
    frameWidthPx,
    frameHeightPx,
    frameLeftPx,
    frameTopPx,
    videoWidthPx,
    videoHeightPx,
    videoLeftPx,
    videoTopPx,
    subtitlePosition: profile.subtitlePosition,
    fontSizePx,
    subtitleBottomMarginPx,
  }
}
