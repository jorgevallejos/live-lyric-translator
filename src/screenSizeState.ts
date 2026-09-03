/**
 * **`DisplayMode` and where the projection status text comes from.**
 *
 * ## `ScreenSize` was removed on 2026-09-03, and it was dead end to end
 *
 * `big | small`, its two storage keys, its broadcast, its defaults and its reader all went. **A
 * sweep on 2026-09-03 traced the whole chain and found nothing at the end of it:**
 *
 * - `effectiveScreenSize` reached `getProjectionStatusText` at two call sites, both of which passed
 *   `isVideoMode ? effectiveScreenSize : null`. For a video song the `displayMode` branch was taken
 *   first; for a non-video song it was handed `null`. **It never affected the text.**
 * - Its only other consumer was `setActiveProfileId`, and **nothing read the profile back**:
 *   `getActiveProfile` and `computeProjectionLayout` had no callers outside their own tests, and
 *   `setCustomProfile` had none at all. `displayProfile.ts` and `displayProfileStore.ts` went with
 *   it.
 * - `sendScreenSize` put a `screenSize` message on the WebSocket and the main process relayed it.
 *   **`useWebSocket`'s `onmessage` handles `state` and `command` and nothing else**, so every
 *   receiver ignored it.
 * - The Projection window subscribed to the broadcast as `const [, setProjectionScreenSize]` —
 *   **the value discarded in the destructure.**
 *
 * The Projection window stopped rendering from a profile when the quad became the framing; this is
 * the machinery that was left standing behind it. **A knob nobody has ever moved is a decision
 * pretending to be a question**, and this one could not be moved at all.
 *
 * **`DisplayMode` is a different thing and is not this.** It is also going — format and placement
 * are Muralista's, and whether the video runs tonight is the drive mode — but that waits on the
 * drive-mode design and on a walk.
 */

/** 3-way display mode for the projection column toggle. 'none' means lyric screen only (no video frame). */
export type DisplayMode = 'none' | 'small' | 'big'

export const KEY_DISPLAY_MODE = 'liveLyricDisplayMode'
/** Written to localStorage so the Projection window receives display mode via the cross-window storage event. */
export const KEY_DISPLAY_MODE_BROADCAST = 'liveLyricDisplayModeBroadcast'

export function getProjectionStatusText(
  projectionOpen: boolean,
  displayMode?: DisplayMode
): string {
  if (!projectionOpen) return 'Closed'
  if (displayMode === 'none') return 'Open, No video'
  if (displayMode === 'small') return 'Open, Small'
  if (displayMode === 'big') return 'Open, Big'
  return 'Open'
}

// ── DisplayMode storage ────────────────────────────────────────────────────


/** Returns the default display mode: always 'none' (no video frame) regardless of whether
 * the song has media. The performer opts in to Small/Big video display explicitly via the
 * Videoclip toggle; media presence no longer implies an automatic video display default. */
export function getDefaultDisplayMode(_songHasMedia: boolean): DisplayMode {
  return 'none'
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
