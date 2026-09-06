import { useEffect, useRef, useState, useCallback } from 'react'
import { bridge } from './bridge'
import { getLyricText, isLyricLine, isSection, type SongItem, type MediaFile, type TimelineEntry } from './songState'
import { videoCueLookup } from './videoCueLookup'
import { absolutePathToMediaUrl, validateVideoForImport, setMediaPath, type MediaValidationWarning } from './mediaPathStore'
import { setVideoSeekTarget } from './videoTransport'
import { chooseFilePath } from './platform'

interface Props {
  absolutePath: string | null
  mediaSrc: string
  media: MediaFile
  timeline: TimelineEntry[]
  lines: SongItem[]
  singingLang: string
  /** Called with the new seek time so the control can also send it via WebSocket. */
  onSeek: (targetTime: number) => void
}

function warningMessage(w: MediaValidationWarning): string {
  if (w === 'mov-or-prores') return 'This file may not be web-playable (ProRes/MOV). A 1080p H.264 MP4 is recommended.'
  if (w === 'large-file') return 'This file is very large (>500 MB). Playback may stutter.'
  return ''
}

/**
 * Performer-facing video control panel shown in the armed ControlView when the
 * current song has a video. Provides:
 *  - Smaller video preview (muted identical to projection, for cue monitoring)
 *  - Current singing-language line + next line greyed
 *  - Position bar
 *  - File-picker / "Locate video…" re-link prompt
 *  - Cue strip toggle (timeline markers + lines, fallback for no-video scenarios)
 */
export function VideoControlPanel({
  absolutePath,
  mediaSrc,
  media,
  timeline,
  lines,
  singingLang,
  onSeek,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeCueIndex, setActiveCueIndex] = useState(-1)
  const [showCueStrip, setShowCueStrip] = useState(false)
  const [linkWarnings, setLinkWarnings] = useState<MediaValidationWarning[]>([])

  const offset = media.offset ?? 0
  const trimStart = media.trimStart ?? 0

  // Start video at trimStart when src changes
  useEffect(() => {
    if (!absolutePath) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = trimStart
    video.play().catch(() => {})
  }, [absolutePath, trimStart])

  // Track currentTime and derive active cue
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTimeUpdate = () => {
      const t = video.currentTime
      setCurrentTime(t)
      const songTime = t + offset
      setActiveCueIndex(videoCueLookup(timeline, songTime))
    }
    const onLoadedMetadata = () => setDuration(video.duration)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [timeline, offset])

  // Compute current and next lyric lines from the active cue index
  const currentLine =
    activeCueIndex >= 0 && activeCueIndex < lines.length && isLyricLine(lines[activeCueIndex])
      ? lines[activeCueIndex]
      : null
  const currentText = currentLine ? (getLyricText(currentLine, singingLang) || '') : ''

  // Next lyric line after the active cue
  let nextText = ''
  for (let i = activeCueIndex + 1; i < lines.length; i++) {
    const item = lines[i]
    if (isLyricLine(item) && !isSection(item)) {
      nextText = getLyricText(item, singingLang) || ''
      break
    }
  }

  const seekTo = useCallback((targetTime: number) => {
    if (videoRef.current) videoRef.current.currentTime = targetTime
    setVideoSeekTarget(targetTime)
    onSeek(targetTime)
  }, [onSeek])

  // Manual advance: find next cue's start time and seek to it
  const handleSeekNext = () => {
    const nextCueIdx = activeCueIndex < 0 ? 0 : activeCueIndex + 1
    if (nextCueIdx >= timeline.length) return
    const targetSongTime = timeline[nextCueIdx].start
    seekTo(targetSongTime - offset)
  }

  // Manual back: find previous cue's start time
  const handleSeekPrev = () => {
    const prevCueIdx = activeCueIndex <= 0 ? 0 : activeCueIndex - 1
    if (prevCueIdx >= timeline.length) return
    const targetSongTime = timeline[prevCueIdx].start
    seekTo(targetSongTime - offset)
  }

  // File-picker: link or re-link the video
  const handleLocateVideo = async () => {
    const api = bridge()
    if (!api) return
    const chosen = await chooseFilePath('video')
    if (!chosen) return
    const stats = await api.getFileStats(chosen)
    const warnings = validateVideoForImport(chosen, stats.exists ? stats.size : undefined)
    setLinkWarnings(warnings)
    setMediaPath(mediaSrc, chosen)
    // Force the video to reload by re-triggering effect via src change is handled by parent re-render
    // but we can seek to trimStart here immediately
    if (videoRef.current) {
      videoRef.current.src = absolutePathToMediaUrl(chosen)
      videoRef.current.currentTime = trimStart
      videoRef.current.play().catch(() => {})
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!absolutePath) {
    return (
      <div className="ctrl-video-panel ctrl-video-panel-nopath">
        <p className="ctrl-video-nopath-msg">
          Video not linked yet.
        </p>
        {bridge() && (
          <button type="button" className="ctrl-btn ctrl-arm" onClick={handleLocateVideo}>
            Locate video…
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="ctrl-video-panel">
      {/* Row 1: video preview + current/next lines */}
      <div className="ctrl-video-top-row">
        <div className="ctrl-video-preview-wrap">
          <video
            ref={videoRef}
            src={absolutePathToMediaUrl(absolutePath)}
            muted
            playsInline
            className="ctrl-video-preview"
          />
          {/* Position bar overlay at bottom of preview */}
          {duration > 0 && (
            <div className="ctrl-video-position-bar-wrap">
              <input
                type="range"
                className="ctrl-video-position-bar"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Video position"
              />
            </div>
          )}
        </div>

        <div className="ctrl-video-lyric-col">
          <span className="ctrl-video-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <p className="ctrl-video-current-line">
            {currentText || (activeCueIndex === -1 ? '—' : '')}
          </p>
          <p className="ctrl-video-next-line">
            {nextText}
          </p>
        </div>
      </div>

      {/* Row 2: seek buttons + strip toggle + re-link */}
      <div className="ctrl-video-action-row">
        <button type="button" className="ctrl-btn" onClick={handleSeekPrev}>
          ← Cue
        </button>
        <button type="button" className="ctrl-btn" onClick={handleSeekNext}>
          Cue →
        </button>
        <button
          type="button"
          className={`ctrl-btn ${showCueStrip ? 'ctrl-arm' : ''}`}
          onClick={() => setShowCueStrip((v) => !v)}
        >
          {showCueStrip ? 'Hide strip' : 'Cue strip'}
        </button>
        {bridge() && (
          <button type="button" className="ctrl-btn" onClick={handleLocateVideo}>
            Locate video…
          </button>
        )}
      </div>

      {/* Format warnings */}
      {linkWarnings.length > 0 && (
        <div className="ctrl-video-warnings" role="alert">
          {linkWarnings.map((w) => (
            <p key={w} className="ctrl-video-warning">{warningMessage(w)}</p>
          ))}
        </div>
      )}

      {/* Cue strip (fallback thumbnail-strip view) */}
      {showCueStrip && (
        <div className="ctrl-video-cue-strip" aria-label="Cue strip">
          {timeline.map((entry, idx) => {
            const item = lines[idx]
            const lineText = item && isLyricLine(item) ? (getLyricText(item, singingLang) || '') : ''
            const isActive = idx === activeCueIndex
            const nextItem = lines.find((l, i) => i > idx && isLyricLine(l))
            const nextLineText = nextItem && isLyricLine(nextItem) ? (getLyricText(nextItem, singingLang) || '') : ''
            return (
              <button
                key={idx}
                type="button"
                className={`ctrl-video-cue-marker ${isActive ? 'ctrl-video-cue-marker-active' : ''}`}
                onClick={() => seekTo(entry.start - offset)}
                aria-label={`Seek to cue ${idx + 1} at ${formatTime(entry.start)}`}
              >
                <span className="ctrl-video-cue-time">{formatTime(entry.start)}</span>
                <span className="ctrl-video-cue-line">{lineText || (item && isSection(item) ? `[${(item as { label: string }).label}]` : '—')}</span>
                {lineText && nextLineText && (
                  <span className="ctrl-video-cue-next">{nextLineText}</span>
                )}
              </button>
            )
          })}
          {timeline.length === 0 && (
            <p className="ctrl-video-cue-empty">No timeline recorded for this song.</p>
          )}
        </div>
      )}
    </div>
  )
}

// Re-export lyricLines for potential consumers (unused here but consistent with module pattern)
export type { Props as VideoControlPanelProps }
