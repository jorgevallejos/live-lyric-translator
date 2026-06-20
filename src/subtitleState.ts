import type { TimelineEntry } from './songState'

const KEY_RUNNING = 'subtitle_running'
const KEY_T = 'subtitle_t'
const KEY_LAST_TICK = 'subtitle_lastTickTs'

export interface SubtitleState {
  running: boolean
  t: number
  lastTickTs: number
}

export function getSubtitleState(): SubtitleState {
  const running = localStorage.getItem(KEY_RUNNING) === 'true'
  const t = Number(localStorage.getItem(KEY_T) ?? 0)
  const lastTickTs = Number(localStorage.getItem(KEY_LAST_TICK) ?? 0)
  return { running, t, lastTickTs }
}

export function setSubtitleState(partial: Partial<SubtitleState>): void {
  if (partial.running !== undefined) {
    localStorage.setItem(KEY_RUNNING, String(partial.running))
  }
  if (partial.t !== undefined) {
    localStorage.setItem(KEY_T, String(partial.t))
  }
  if (partial.lastTickTs !== undefined) {
    localStorage.setItem(KEY_LAST_TICK, String(partial.lastTickTs))
  }
}

/** Applies delta to t, clamped to [0, maxT]. */
export function nudgeT(t: number, delta: number, maxT: number): number {
  return Math.max(0, Math.min(maxT, t + delta))
}

/**
 * Returns the clock position (seconds) corresponding to the start of
 * `timeline[index]`. Returns 0 for out-of-range or empty timeline.
 */
export function resyncToIndex(timeline: TimelineEntry[], index: number): number {
  if (index < 0 || index >= timeline.length) return 0
  return timeline[index].start
}

/**
 * Returns t − timeline[index].start: how many seconds the clock has
 * drifted past the expected start of the given line.
 * Positive = clock is running late (we're past where we should be).
 * Negative = clock arrived early.
 * Returns 0 for out-of-range index or empty timeline.
 */
export function getDrift(t: number, timeline: TimelineEntry[], index: number): number {
  if (index < 0 || index >= timeline.length) return 0
  return t - timeline[index].start
}
