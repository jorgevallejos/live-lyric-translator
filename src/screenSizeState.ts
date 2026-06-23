import type { SongMedia } from './songState'

export type ScreenSize = 'big' | 'small'

export const KEY_SCREEN_SIZE = 'liveLyricScreenSize'

export function getAvailableScreenSizes(media: SongMedia | undefined): ScreenSize[] {
  if (!media) return []
  const sizes: ScreenSize[] = []
  if (media.small) sizes.push('small')
  if (media.big) sizes.push('big')
  return sizes
}

export function getDefaultScreenSize(media: SongMedia | undefined): ScreenSize | null {
  if (!media) return null
  if (media.small) return 'small'
  if (media.big) return 'big'
  return null
}

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
}

export function clearStoredScreenSize(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(KEY_SCREEN_SIZE)
}
