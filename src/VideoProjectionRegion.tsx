import { useEffect, useRef, useState } from 'react'
import { getLyricText, isSection, isLyricLine, type SongItem, type MediaMetadata, type TimelineEntry } from './songState'
import { type ProjectionLayout } from './displayProfile'
import { videoCueLookup } from './videoCueLookup'
import { absolutePathToFileUrl } from './mediaPathStore'

export const VIDEO_SEEK_TARGET_KEY = 'videoSeekTarget'

interface VideoSeekTarget {
  time: number
  nonce: number
}

/** Writes a seek target to localStorage so the projection window can pick it up. */
export function setVideoSeekTarget(time: number): void {
  const payload: VideoSeekTarget = { time, nonce: Date.now() }
  localStorage.setItem(VIDEO_SEEK_TARGET_KEY, JSON.stringify(payload))
}

interface Props {
  absolutePath: string
  media: MediaMetadata
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

  // Start at trimStart when the src or trimStart changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = media.trimStart ?? 0
    video.play().catch(() => {})
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

  // Receive seek commands broadcast via localStorage by the control window
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
