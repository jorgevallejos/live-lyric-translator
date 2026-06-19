import type { TimelineEntry } from './songState'

export interface TimelineCapture {
  readonly clockStartMs: number | null
  readonly recordedMs: readonly number[]
}

export function initTimelineCapture(): TimelineCapture {
  return { clockStartMs: null, recordedMs: [] }
}

/**
 * Returns updated capture after an advance to `itemIndex` at wall-clock `nowMs`.
 * Starts the clock on the first advance (index 0 gets offset 0).
 * Silently ignores negative indices and backward moves (index < recordedMs.length).
 */
export function captureAdvance(
  capture: TimelineCapture,
  itemIndex: number,
  nowMs: number
): TimelineCapture {
  if (itemIndex < 0) return capture
  if (itemIndex < capture.recordedMs.length) return capture

  if (capture.clockStartMs === null) {
    return { clockStartMs: nowMs, recordedMs: [0] }
  }

  const offsetMs = nowMs - capture.clockStartMs
  const newRecordedMs = [...capture.recordedMs]
  while (newRecordedMs.length < itemIndex) {
    newRecordedMs.push(offsetMs)
  }
  newRecordedMs.push(offsetMs)
  return { ...capture, recordedMs: newRecordedMs }
}

/**
 * Appends a final timestamp as the end-marker for the last visited item.
 * Call this when recording stops (user unarms). No-op if the clock was never started.
 */
export function finalizeCapture(
  capture: TimelineCapture,
  nowMs: number
): TimelineCapture {
  if (capture.clockStartMs === null || capture.recordedMs.length === 0) return capture
  const offsetMs = nowMs - capture.clockStartMs
  return { ...capture, recordedMs: [...capture.recordedMs, offsetMs] }
}

/**
 * Builds a TimelineEntry[] with exactly `totalItems` entries from the capture.
 * Entry[i].start = when item i was first advanced to (seconds from clock start).
 * Entry[i].end   = when item i+1 was advanced to, or the finalize time.
 * Unvisited items get zero-duration entries at the last recorded time.
 */
export function buildTimelineFromCapture(
  capture: TimelineCapture,
  totalItems: number
): TimelineEntry[] {
  if (totalItems === 0) return []

  const lastMs =
    capture.recordedMs.length > 0
      ? capture.recordedMs[capture.recordedMs.length - 1]
      : 0

  const entries: TimelineEntry[] = []
  for (let i = 0; i < totalItems; i++) {
    const startMs = i < capture.recordedMs.length ? capture.recordedMs[i] : lastMs
    const nextMs =
      i + 1 < capture.recordedMs.length ? capture.recordedMs[i + 1] : startMs
    const endMs = Math.max(startMs, nextMs)
    entries.push({ start: startMs / 1000, end: endMs / 1000 })
  }
  return entries
}
