import { useEffect, useRef, useState } from 'react'
import { getLyricText, isSection, isLyricLine, type SongItem, type MediaFile, type TimelineEntry } from './songState'
import { type ProjectionLayout } from './displayProfile'
import { videoCueLookup } from './videoCueLookup'
import { absolutePathToMediaUrl } from './mediaPathStore'

export const VIDEO_SEEK_TARGET_KEY = 'videoSeekTarget'
export const VIDEO_TRANSPORT_KEY = 'videoTransport'

interface VideoSeekTarget {
  time: number
  nonce: number
}

export interface VideoTransportCommand {
  action: 'play' | 'pause' | 'stop'
  time?: number
  nonce: number
}

/** Writes a seek target to localStorage so the projection window can pick it up. */
export function setVideoSeekTarget(time: number): void {
  const payload: VideoSeekTarget = { time, nonce: Date.now() }
  localStorage.setItem(VIDEO_SEEK_TARGET_KEY, JSON.stringify(payload))
}

/** Broadcasts a transport command to the projection window via localStorage. */
export function setVideoTransportCommand(action: 'play' | 'pause' | 'stop'): void {
  const payload: VideoTransportCommand = { action, nonce: Date.now() }
  localStorage.setItem(VIDEO_TRANSPORT_KEY, JSON.stringify(payload))
}

interface Props {
  absolutePath: string
  media: MediaFile
  timeline: TimelineEntry[]
  lines: SongItem[]
  effectiveLang: string
  layout: ProjectionLayout
  /** Show the title/intro overlay over the black pre-play cover (armed, video not yet started). */
  showIntroScreen?: boolean
  introTitle?: string
  introTranslatedTitle?: string
  introTagline?: string
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
  showIntroScreen = false,
  introTitle,
  introTranslatedTitle,
  introTagline,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [subtitleText, setSubtitleText] = useState('')
  const [subtitleVisible, setSubtitleVisible] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

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

  // Receive play/pause/seek/stop transport commands from VideoPerformancePanel
  useEffect(() => {
    const trimStart = media.trimStart ?? 0
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VIDEO_TRANSPORT_KEY || !e.newValue) return
      try {
        const payload = JSON.parse(e.newValue) as VideoTransportCommand
        const video = videoRef.current
        if (!video) return
        if (payload.action === 'play') {
          setHasStarted(true)
          video.play().catch(() => {})
        } else if (payload.action === 'pause') {
          video.pause()
        } else if (payload.action === 'stop') {
          setHasStarted(false)
          video.pause()
          video.currentTime = trimStart
        }
      } catch {
        // ignore malformed payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [media.trimStart])

  const isOverlay = layout.subtitlePosition === 'overlay-bottom'

  const lyricSpan = (
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
  )

  return (
    <div
      className="projection-animation-region"
      style={{
        position: 'absolute',
        left: `${layout.frameLeftPx}px`,
        top: `${layout.frameTopPx}px`,
        width: `${layout.frameWidthPx}px`,
        height: `${layout.frameHeightPx}px`,
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <video
        ref={videoRef}
        src={absolutePathToMediaUrl(absolutePath)}
        muted
        playsInline
        style={{
          position: 'absolute',
          left: `${layout.videoLeftPx - layout.frameLeftPx}px`,
          top: `${layout.videoTopPx - layout.frameTopPx}px`,
          width: `${layout.videoWidthPx}px`,
          height: `${layout.videoHeightPx}px`,
          display: 'block',
        }}
      />

      {isOverlay ? (
        <div
          className="projection-lyric-overlay"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${layout.subtitleBottomMarginPx}px`,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 1.5rem',
            boxSizing: 'border-box',
          }}
        >
          {lyricSpan}
        </div>
      ) : (
        <div
          className="projection-subtitle-band"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${layout.videoTopPx - layout.frameTopPx + layout.videoHeightPx}px`,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 1.5rem',
            boxSizing: 'border-box',
          }}
        >
          {lyricSpan}
        </div>
      )}

      {!hasStarted && (
        <div
          className="projection-animation-cover"
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {showIntroScreen && introTitle && (
            <div
              data-testid="song-intro-screen"
              className="projection-intro-screen"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25em',
                textAlign: 'center',
                padding: '0 2em',
              }}
            >
              <span className="projection-intro-title">{introTitle}</span>
              {introTranslatedTitle && (
                <span className="projection-intro-translated-title">
                  ({introTranslatedTitle})
                </span>
              )}
              {introTagline && (
                <span className="projection-intro-tagline">{introTagline}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
