export type ScreenSize = 'big' | 'small'

/** 3-way display mode for the projection column toggle. 'none' means lyric screen only (no video frame). */
export type DisplayMode = 'none' | 'small' | 'big'

export const KEY_SCREEN_SIZE = 'liveLyricScreenSize'
/** Written to localStorage so the Projection window receives it via the cross-window storage event. */
export const KEY_SCREEN_SIZE_BROADCAST = 'liveLyricScreenSizeBroadcast'

export const KEY_DISPLAY_MODE = 'liveLyricDisplayMode'
/** Written to localStorage so the Projection window receives display mode via the cross-window storage event. */
export const KEY_DISPLAY_MODE_BROADCAST = 'liveLyricDisplayModeBroadcast'

export function getProjectionStatusText(
  projectionOpen: boolean,
  screenSize: ScreenSize | null,
  displayMode?: DisplayMode
): string {
  if (!projectionOpen) return 'Closed'
  // If a displayMode is provided, it takes precedence over the legacy screenSize param
  if (displayMode !== undefined) {
    if (displayMode === 'none') return 'Open, No video'
    if (displayMode === 'small') return 'Open, Small'
    if (displayMode === 'big') return 'Open, Big'
  }
  if (screenSize === null) return 'Open'
  return `Open, ${screenSize === 'small' ? 'Small' : 'Big'}`
}

export function getStoredScreenSize(): ScreenSize | null {
  if (typeof sessionStorage === 'undefined') return null
  const val = sessionStorage.getItem(KEY_SCREEN_SIZE)
  if (val === 'big' || val === 'small') return val
  return null
}

export function setStoredScreenSize(size: ScreenSize): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(KEY_SCREEN_SIZE, size)
  try { localStorage.setItem(KEY_SCREEN_SIZE_BROADCAST, size) } catch { /* unavailable in some envs */ }
}

export function clearStoredScreenSize(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(KEY_SCREEN_SIZE)
  try { localStorage.removeItem(KEY_SCREEN_SIZE_BROADCAST) } catch { /* unavailable in some envs */ }
}

/** Returns both sizes when the song has media, empty array otherwise. */
export function getAvailableScreenSizes(songHasMedia: boolean): ScreenSize[] {
  return songHasMedia ? ['big', 'small'] : []
}

/** Returns the default size (small) when the song has media, null otherwise. */
export function getDefaultScreenSize(songHasMedia: boolean): ScreenSize | null {
  return songHasMedia ? 'small' : null
}

/** Read the broadcast value from localStorage (used by the Projection window). */
export function getBroadcastScreenSize(): ScreenSize | null {
  try {
    const val = localStorage.getItem(KEY_SCREEN_SIZE_BROADCAST)
    if (val === 'big' || val === 'small') return val
  } catch { /* unavailable in some envs */ }
  return null
}

// ── DisplayMode storage ────────────────────────────────────────────────────

/** Returns the default display mode: 'small' when song has media, 'none' otherwise. */
export function getDefaultDisplayMode(songHasMedia: boolean): DisplayMode {
  return songHasMedia ? 'small' : 'none'
}

export function getStoredDisplayMode(): DisplayMode | null {
  if (typeof sessionStorage === 'undefined') return null
  const val = sessionStorage.getItem(KEY_DISPLAY_MODE)
  if (val === 'none' || val === 'small' || val === 'big') return val
  return null
}

export function setStoredDisplayMode(mode: DisplayMode): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(KEY_DISPLAY_MODE, mode)
  try { localStorage.setItem(KEY_DISPLAY_MODE_BROADCAST, mode) } catch { /* unavailable in some envs */ }
}

export function clearStoredDisplayMode(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(KEY_DISPLAY_MODE)
  try { localStorage.removeItem(KEY_DISPLAY_MODE_BROADCAST) } catch { /* unavailable in some envs */ }
}

/** Read the broadcast display mode from localStorage (used by the Projection window). */
export function getBroadcastDisplayMode(): DisplayMode | null {
  try {
    const val = localStorage.getItem(KEY_DISPLAY_MODE_BROADCAST)
    if (val === 'none' || val === 'small' || val === 'big') return val
  } catch { /* unavailable in some envs */ }
  return null
}
