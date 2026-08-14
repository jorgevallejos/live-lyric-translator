import type { TimelineEntry } from './songState'

/**
 * P9 — performed-tempo scaling.
 *
 * Jorge may decide to perform a song at a different tempo than the recording. The timeline is a
 * MEASUREMENT OF THE RECORDING — a true statement about that audio file, and it stays true
 * however the song is played on a given night. So the scaling is applied here, at playback;
 * Bombista never rewrites timestamps.
 *
 *   scale      = tempo.bpm (declared, from the recording) / performedBpm
 *   cueTime[i] = timeline[i].start × scale
 *
 * The pulse also runs at performedBpm. Both derive from the same number, so they cannot drift
 * apart.
 *
 * ⚠ NEVER overwrite `tempo.bpm`. That field is a fact about the recording and the anchor the
 * whole scale depends on. Overwrite it once and the scaling silently becomes relative to a past
 * gig, with nothing to detect it. The performed tempo persists under its own key (see
 * `getStoredPerformedBpm`); `tempo.bpm` is untouched, always.
 *
 * Why linear scaling is sound here, when normally it would not be: humans do not slow down
 * uniformly, so error would accumulate — except that P5 puts a click track under the performer
 * at the performed tempo, making him metronomically uniform at that tempo by construction. The
 * honest limit is that this holds while he is on the click; P6 is the escape hatch when he is
 * not.
 *
 * Validating the performer's BPM against the timeline is deliberately out of scope: if he
 * enters a wrong number, the pulse and the scaling are both wrong together, and that is the
 * performer's problem, not the tool's.
 */

const STORAGE_KEY = 'llt.performedBpm.v1'

/**
 * A BPM usable for scaling. Rejects zero, negatives and non-finite values — not as a musical
 * judgment (that is the performer's), but because they would produce an Infinity or NaN scale
 * and silently break cue lookup.
 */
export function isUsableBpm(bpm: number | null | undefined): bpm is number {
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0
}

/**
 * The playback scale factor. Returns exactly 1 (no scaling) whenever either side is unusable,
 * so a song with no tempo block behaves exactly as it does today — no fallback BPM is invented.
 */
export function getTempoScale(
  declaredBpm: number | null | undefined,
  performedBpm: number | null | undefined
): number {
  if (!isUsableBpm(declaredBpm) || !isUsableBpm(performedBpm)) return 1
  return declaredBpm / performedBpm
}

/**
 * The performed tempo actually in force: the stored value when it is usable, otherwise the
 * declared tempo. Default performedBpm === tempo.bpm gives a scale of exactly 1.0 and byte-
 * identical behaviour, so no song changes unless Jorge nudges it.
 */
export function resolvePerformedBpm(
  declaredBpm: number | null | undefined,
  storedBpm: number | null | undefined
): number | undefined {
  if (isUsableBpm(storedBpm)) return storedBpm
  return isUsableBpm(declaredBpm) ? declaredBpm : undefined
}

/**
 * Applies the scale to every cue time. At scale 1 the original array is returned untouched —
 * the "nothing changes unless asked" guarantee, in the strongest form available.
 */
export function scaleTimeline(timeline: TimelineEntry[], scale: number): TimelineEntry[] {
  if (scale === 1 || !Number.isFinite(scale) || scale <= 0) return timeline
  return timeline.map((entry) => ({
    start: entry.start * scale,
    end: entry.end * scale,
  }))
}

// ── Persistence ────────────────────────────────────────────────────────────────────────────
// Deliberately its own store rather than a field on the song in setlistStore: a performed tempo
// is a decision about a PERFORMANCE, not data about the song, and keeping it out of the song
// schema is what makes "never overwrite tempo.bpm" structural rather than a rule to remember.

type PerformedBpmMap = Record<string, number>

function readMap(): PerformedBpmMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as PerformedBpmMap
  } catch {
    return {}
  }
}

function writeMap(map: PerformedBpmMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable in some envs */
  }
}

/** The performed tempo stored for a song, or null when none is set (or the stored value is junk). */
export function getStoredPerformedBpm(songId: string): number | null {
  if (!songId) return null
  const value = readMap()[songId]
  return isUsableBpm(value) ? value : null
}

/** Stores a performed tempo for a song; pass null to clear it and fall back to the declared tempo. */
export function setStoredPerformedBpm(songId: string, bpm: number | null): void {
  if (!songId) return
  const map = readMap()
  if (bpm === null || !isUsableBpm(bpm)) {
    delete map[songId]
  } else {
    map[songId] = bpm
  }
  writeMap(map)
}
