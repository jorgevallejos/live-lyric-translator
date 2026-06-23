import { useEffect, useRef, useState } from 'react'
import { getLyricText, isSection, isLyricLine, type SongItem, type MediaFile, type TimelineEntry } from './songState'
import { type ProjectionLayout } from './displayProfile'
import { videoCueLookup } from './videoCueLookup'
import { absolutePathToFileUrl } from './mediaPathStore'

export const VIDEO_SEEK_TARGET_KEY = 'videoSeekTarget'
export const VIDEO_TRANSPORT_KEY = 'videoTransport'

interface VideoSeekTarget {
  time: number
  nonce: number
}

export interface VideoTransportCommand {
  action: 'play' | 'pause' | 'seek'
  time?: number
  nonce: number
}

/** Writes a seek target to localStorage so the projection window can pick it up. */
export function setVideoSeekTarget(time: number): void {
  const payload: VideoSeekTarget = { time, nonce: Date.now() }
  localStorage.setItem(VIDEO_SEEK_TARGET_KEY, JSON.stringify(payload))
}

/** Broadcasts a play/pause/seek transport command to the projection window via localStorage. */
export function setVideoTransportCommand(action: 'play' | 'pause' | 'seek', time?: number): void {
  const payload: VideoTransportCommand = { action, time, nonce: Date.now() }
  localStorage.setItem(VIDEO_TRANSPORT_KEY, JSON.stringify(payload))
}

interface Props {
  absolutePath: string
  media: MediaFile
  timeline: TimelineEntry[]
  lines: SongItem[]
  effectiveLang: string
  layout: ProjectionLayout
}

/**
 * Full-frame video compositor for the projection (audience) window.
 *
 * Renders the animation video (muted, object-fit: contain) in the upper region
 * and overlays the translated subtitle in the black band below. Subtitle tracks
 * video.currentTime + media.offset via the timeline cue windows — no separate timer.
 */
export function VideoProjectionRegion({
  absolutePath,
  media,
  timeline,
  lines,
  effectiveLang,
  layout,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [subtitleText, setSubtitleText] = useState('')
  const [subtitleVisible, setSubtitleVisible] = useState(false)

  // Seek to trimStart when the src or trimStart changes. Does NOT auto-play.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = media.trimStart ?? 0
  }, [absolutePath, media.trimStart])

  // Derive subtitle from video.currentTime via the timeline
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const offset = media.offset ?? 0

    const onTimeUpdate = () => {
      const songTime = video.currentTime + offset
      const idx = videoCueLookup(timeline, songTime)
      if (idx < 0 || idx >= lines.length) {
        setSubtitleVisible(false)
        return
      }
      const item = lines[idx]
      if (isSection(item) || !isLyricLine(item)) {
        setSubtitleVisible(false)
        return
      }
      const text = effectiveLang ? getLyricText(item, effectiveLang) : ''
      if (text) {
        setSubtitleText(text)
        setSubtitleVisible(true)
      } else {
        setSubtitleVisible(false)
      }
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [timeline, lines, effectiveLang, media.offset])

  // Receive seek commands from the legacy seek channel (used by VideoControlPanel)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VIDEO_SEEK_TARGET_KEY || !e.newValue) return
      try {
        const payload = JSON.parse(e.newValue) as VideoSeekTarget
        if (videoRef.current && typeof payload.time === 'number') {
          videoRef.current.currentTime = payload.time
        }
      } catch {
        // ignore malformed payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Receive play/pause/seek transport commands from VideoPerformancePanel
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VIDEO_TRANSPORT_KEY || !e.newValue) return
      try {
        const payload = JSON.parse(e.newValue) as VideoTransportCommand
        const video = videoRef.current
        if (!video) return
        if (payload.action === 'play') {
          video.play().catch(() => {})
        } else if (payload.action === 'pause') {
          video.pause()
        } else if (payload.action === 'seek' && typeof payload.time === 'number') {
          video.currentTime = payload.time
        }
      } catch {
        // ignore malformed payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <>
      <div
        className="projection-animation-region"
        style={{
          position: 'relative',
          width: '100%',
          height: `${layout.animationHeightPx}px`,
          flexShrink: 0,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <video
          ref={videoRef}
          src={absolutePathToFileUrl(absolutePath)}
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>

      <div
        className="projection-subtitle-band"
        style={{
          width: '100%',
          height: `${layout.bandHeightPx}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 1.5rem',
          boxSizing: 'border-box',
        }}
      >
        <span
          className="projection-lyric"
          style={{
            opacity: subtitleVisible ? 1 : 0,
            transition: 'opacity 300ms ease',
            ...(layout.fontSizePx > 0 ? { fontSize: `${layout.fontSizePx}px` } : {}),
          }}
        >
          {subtitleText}
        </span>
      </div>
    </>
  )
}
