import { useEffect, useRef, useState } from 'react'
import {
  getSubtitleState,
  setSubtitleState,
  nudgeT,
  resyncToIndex,
  getDrift,
} from './subtitleState'
import { videoCueLookup } from './videoCueLookup'
import type { TimelineEntry } from './songState'

const TICK_MS = 50

export interface UseSubtitleTimerResult {
  running: boolean
  t: number
  /** Index of the timeline entry that contains t, or -1 if in a gap or not started. */
  activeIndex: number
  /** t − timeline[manualIndex].start: how far the clock has drifted from the line's expected start. */
  drift: number
  startPause: () => void
  stop: () => void
  /** Shifts t by delta seconds, clamped to [0, lastEntry.end]. */
  nudge: (delta: number) => void
  /** Jumps t to timeline[index].start (manual override / re-seize). */
  resync: (index: number) => void
}

/**
 * Drives a subtitle clock against a song timeline.
 *
 * `timeline` is stored in a ref so that new-but-equal array references from
 * callers such as `getLibrarySongById` don't retrigger the tick interval.
 * Effects key only on `currentSongId` (primitive) for song-change resets and on
 * `state.running` (boolean) for interval lifecycle — matching the same pattern
 * used in useBeatClock to avoid render loops.
 */
export function useSubtitleTimer(
  timeline: TimelineEntry[] | undefined,
  currentSongId: string,
  manualIndex: number,
): UseSubtitleTimerResult {
  const [state, setState] = useState(getSubtitleState)

  // Always reflects the latest timeline without being listed in effect deps.
  const timelineRef = useRef<TimelineEntry[] | undefined>(timeline)
  timelineRef.current = timeline

  // Sync from localStorage when the projection window writes (cross-window).
  useEffect(() => {
    const onStorage = () => setState(getSubtitleState())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Reset clock when the song changes.
  useEffect(() => {
    setSubtitleState({ t: 0, lastTickTs: Date.now(), running: false })
    setState(getSubtitleState())
  }, [currentSongId])

  // Tick loop: advance t while running, clamped to last entry end.
  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => {
      const { running, t, lastTickTs } = getSubtitleState()
      if (!running) return
      const tl = timelineRef.current
      const maxT = tl && tl.length > 0 ? tl[tl.length - 1].end : Infinity
      const now = Date.now()
      const newT = Math.min(maxT, t + (now - lastTickTs) / 1000)
      setSubtitleState({ t: newT, lastTickTs: now })
      setState(getSubtitleState())
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state.running])

  const startPause = () => {
    const { running } = getSubtitleState()
    if (running) {
      setSubtitleState({ running: false })
    } else {
      setSubtitleState({ lastTickTs: Date.now(), running: true })
    }
    setState(getSubtitleState())
  }

  const stop = () => {
    setSubtitleState({ t: 0, lastTickTs: Date.now(), running: false })
    setState(getSubtitleState())
  }

  const nudge = (delta: number) => {
    const { t: currentT } = getSubtitleState()
    const tl = timelineRef.current
    const maxT = tl && tl.length > 0 ? tl[tl.length - 1].end : Infinity
    const newT = nudgeT(currentT, delta, maxT)
    setSubtitleState({ t: newT, lastTickTs: Date.now() })
    setState(getSubtitleState())
  }

  const resync = (index: number) => {
    const tl = timelineRef.current
    const newT = resyncToIndex(tl ?? [], index)
    setSubtitleState({ t: newT, lastTickTs: Date.now() })
    setState(getSubtitleState())
  }

  const currentT = state.t
  const currentTimeline = timeline ?? []
  const activeIndex = videoCueLookup(currentTimeline, currentT)
  const drift = getDrift(currentT, currentTimeline, manualIndex)

  return {
    running: state.running,
    t: currentT,
    activeIndex,
    drift,
    startPause,
    stop,
    nudge,
    resync,
  }
}
