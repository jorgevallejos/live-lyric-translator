export type ScreenSize = 'big' | 'small'

export const KEY_SCREEN_SIZE = 'liveLyricScreenSize'
/** Written to localStorage so the Projection window receives it via the cross-window storage event. */
export const KEY_SCREEN_SIZE_BROADCAST = 'liveLyricScreenSizeBroadcast'

export function getProjectionStatusText(projectionOpen: boolean, screenSize: ScreenSize | null): string {
  if (!projectionOpen) return 'Closed'
  if (screenSize === null) return 'Open'
  return `Open, ${screenSize === 'small' ? 'Small' : 'Big'} screen`
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

/** Read the broadcast value from localStorage (used by the Projection window). */
export function getBroadcastScreenSize(): ScreenSize | null {
  try {
    const val = localStorage.getItem(KEY_SCREEN_SIZE_BROADCAST)
    if (val === 'big' || val === 'small') return val
  } catch { /* unavailable in some envs */ }
  return null
}
