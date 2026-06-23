import { useSongNavigation } from './useSongNavigation'
import {
  computeProjectionLayout,
  DISPLAY_PRESETS,
  type DisplayProfile,
  type ProfileId,
} from './displayProfile'
import {
  getActiveDisplayProfile,
  setActiveProfileId,
  setCustomProfile,
} from './displayProfileStore'
import { isSection, getSongIndex, getBlank, setSongLines, setSongIndex, setBlank, setCurrentSongId, setCurrentSongTitle, setProjectionLanguage, setSingingLanguage, getEffectiveProjectionLanguage, getEffectiveSingingLanguage, getAvailableLanguages, getAvailableSingingLanguages, getSongLines, getCurrentSongId, getLyricText, getSingingLanguage, getProjectionLanguage, getLastLyricIndex, isLyricLine } from './songState'
import { getMediaPath } from './mediaPathStore'
import { VideoProjectionRegion } from './VideoProjectionRegion'
import { VideoControlPanel } from './VideoControlPanel'
import { usePerformanceState } from './performanceState'
import { useWebSocket } from './useWebSocket'
import { useProjectionOpenState } from './useProjectionOpenState'
import { useConcertSessionTimer } from './concertSessionState'
import { useHoldToConfirm, useRestartKeyHold } from './useHoldToConfirm'
import {
  getPerformanceControlState,
  tryArm,
  isNavigationEnabled,
  type PerformanceControlPrerequisites,
} from './performanceControlStateMachine'
import { KEY_ARMED_BROADCAST } from './performanceState'
import { useEndCardState, getEndCardVisible, KEY_END_CARD_VISIBLE } from './endCardState'
import { useEffect, useState, useRef, useCallback } from 'react'
import { BeatIndicator } from './BeatIndicator'
import { useBeatClock } from './useBeatClock'
import { useSubtitleTimer } from './useSubtitleTimer'
import { ManageSetlistsView } from './ManageSetlistsView'
import {
  autoSelectFirstSongForActiveSetlist,
  ensureSongLibraryHydrated,
  getActiveSetlistId,
  getActiveMediaFile,
  getLibrarySongById,
  getOrderedSongsForActiveSetlist,
  getSetlists,
  hasValidActiveSetlist,
  loadSetlistStore,
  type LibrarySong,
} from './setlistStore'
import { addPlayedSong, getPlayedSongIds } from './playedSongsState'
import type { LyricLine, SongItem } from './songState'
import { updateSongTimeline } from './setlistStore'
import {
  initTimelineCapture,
  captureAdvance,
  finalizeCapture,
  buildTimelineFromCapture,
  type TimelineCapture,
} from './timelineCapture'
import './control.css'

function formatTimedT(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const d = Math.floor((t % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${d}`
}

function timedDriftClass(drift: number): string {
  const abs = Math.abs(drift)
  if (abs >= 4) return 'ctrl-timed-drift ctrl-timed-drift-alert'
  if (abs >= 1.5) return 'ctrl-timed-drift ctrl-timed-drift-warn'
  return 'ctrl-timed-drift'
}

/** v0.5: labels from performance control state machine (SETUP | READY_TO_ARM | ARMED) */
const CONTROL_STATE_LABELS: Record<'SETUP' | 'READY_TO_ARM' | 'ARMED', string> = {
  SETUP: 'Performance: Setup',
  READY_TO_ARM: 'Performance: Ready to Arm',
  ARMED: 'Performance: Armed',
}
const NEXT_SONG_TILE_DELAY_MS = 6_000

function ConcertSessionTimerRunner() {
  // Keep the concert/session timer hook alive across route transitions.
  // This prevents "time stops updating while ControlView is unmounted" issues (including under fake timers).
  useConcertSessionTimer()
  return null
}

/** Build state-machine prerequisites from current app state (no new data model). */
function buildPerformanceControlPrerequisites(
  currentSongId: string,
  lines: SongItem[],
  effectiveLang: string,
  effectiveSingingLang: string,
  projectionOpen: boolean
): PerformanceControlPrerequisites {
  return {
    songSelected: currentSongId !== '' && lines.length > 0,
    translationLanguageSelected: effectiveLang.length > 0,
    singingLanguageSelected: lines.length > 0 && effectiveSingingLang.length > 0,
    projectionOpen,
  }
}

type ControlViewStateInput = {
  currentSongId: string
  lines: SongItem[]
  effectiveLang: string
  effectiveSingingLang: string
  projectionOpen: boolean
  armed: boolean
  arm: () => void
  unarm: () => void
  lineCount: number
  currentIndex: number
}

/** Encapsulates performance control state machine and readiness; keeps UI from duplicating logic. */
function usePerformanceControlViewState({
  currentSongId,
  lines,
  effectiveLang,
  effectiveSingingLang,
  projectionOpen,
  armed,
  arm,
  unarm,
  lineCount,
  currentIndex,
}: ControlViewStateInput) {
  const prereqs = buildPerformanceControlPrerequisites(
    currentSongId,
    lines,
    effectiveLang,
    effectiveSingingLang,
    projectionOpen
  )
  const controlState = getPerformanceControlState(prereqs, armed)
  const controlStateLabel = CONTROL_STATE_LABELS[controlState]
  const canArm = controlState === 'READY_TO_ARM'
  const canUnarm = controlState === 'ARMED'
  const navEnabled = isNavigationEnabled(controlState)
  const nextDisabled =
    lineCount === 0 ||
    !navEnabled ||
    (controlState === 'ARMED' && currentIndex >= lineCount - 1)

  const handleArmClick = () => {
    if (tryArm(prereqs, armed)) arm()
  }

  const handleUnarmClick = () => {
    if (canUnarm) unarm()
  }

  return {
    controlState,
    controlStateLabel,
    canArm,
    canUnarm,
    navEnabled,
    nextDisabled,
    handleArmClick,
    handleUnarmClick,
  }
}

declare global {
  interface Window {
    electronAPI?: {
      openProjection: () => Promise<void>
      closeProjection: () => Promise<void>
      isProjectionOpen: () => Promise<boolean>
      onProjectionOpened: (cb: () => void) => () => void
      onProjectionClosed: (cb: () => void) => () => void
      openFileDialog: () => Promise<string | null>
      getFileStats: (filePath: string) => Promise<{ exists: boolean; size: number }>
    }
  }
}

function ProjectionButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean
  onToggle: () => void
}) {
  const api = window.electronAPI
  if (!api) return null

  if (isOpen) {
    return (
      <button
        type="button"
        className="ctrl-btn ctrl-projection"
        onClick={onToggle}
      >
        Close
      </button>
    )
  }

  return (
    <button type="button" className="ctrl-btn ctrl-projection" onClick={onToggle}>
      Open
    </button>
  )
}

function applySelectedSongToSetup(song: LibrarySong) {
  setSongLines(song.items)
  setSongIndex(-1)
  setBlank(true)
  setCurrentSongId(song.id)
  setCurrentSongTitle(song.title)
}

function ControlView() {
  const { projectionOpen, openProjection, closeProjection } = useProjectionOpenState(
    typeof window !== 'undefined' ? window.electronAPI : undefined
  )

  const {
    lines,
    index,
    blank,
    currentItem,
    currentSongTitle,
    goNext,
    goPrev,
    goRestart,
    setBlankState,
    loadLines,
    loadError,
    applyRemoteState,
    applyCommand,
    nextLyricLine,
  } = useSongNavigation()
  const effectiveLang = getEffectiveProjectionLanguage(lines)
  const effectiveSingingLang = getEffectiveSingingLanguage(lines)
  const { state: performanceState, arm, unarm } = usePerformanceState(
    projectionOpen,
    lines,
    effectiveLang,
    index
  )
  const { visible: endCardVisible, toggle: toggleEndCard, hide: hideEndCard } = useEndCardState()
  const currentSongId = getCurrentSongId()

  const [recordingMode, setRecordingMode] = useState(false)
  const [capture, setCapture] = useState<TimelineCapture>(initTimelineCapture)
  const [pendingSaveCapture, setPendingSaveCapture] = useState<TimelineCapture | null>(null)
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0)

  const concertTimer = useConcertSessionTimer()
  const elapsedMinutes = concertTimer.elapsedMinutes
  const timerPaused = concertTimer.paused
  const armWithConcertSessionStart = () => {
    concertTimer.startIfNeeded()
    arm()
  }
  const [timerActionsVisible, setTimerActionsVisible] = useState(false)
  const timerCircleContainerRef = useRef<HTMLButtonElement | null>(null)
  const timerActionsContainerRef = useRef<HTMLDivElement | null>(null)
  const songNotes = currentSongId ? getLibrarySongById(currentSongId)?.notes ?? '' : ''
  const currentLibrarySong = currentSongId ? getLibrarySongById(currentSongId) : undefined
  const songIntro = currentLibrarySong?.intro?.[effectiveLang] ?? ''
  const activeMedia = currentLibrarySong ? getActiveMediaFile(currentLibrarySong) : undefined
  const isVideoMode = activeMedia?.type === 'video'
  const resolvedVideoPath = isVideoMode ? getMediaPath(activeMedia!.src) : null
  const armed = performanceState === 'armed' || performanceState === 'performing'
  const {
    controlState,
    controlStateLabel,
    canArm,
    canUnarm,
    nextDisabled: nextDisabledFromControlState,
    handleArmClick,
    handleUnarmClick,
  } = usePerformanceControlViewState({
    currentSongId,
    lines,
    effectiveLang,
    effectiveSingingLang,
    projectionOpen,
    armed,
    arm: armWithConcertSessionStart,
    unarm,
    lineCount: lines.length,
    currentIndex: index,
  })
  const { sendCommandWithState, sendSeek } = useWebSocket({
    index,
    blank,
    applyRemoteState,
    applyCommand,
  })

  /** Tracked user-facing config (storage); avoids false positives when only derived effectiveLang changes. */
  const prevUserConfigRef = useRef<{
    songId: string
    proj: string
    sing: string
  } | null>(null)

  // Internal concert flow sets song id while already armed; in that case we should not unarm
  // just to restart the UI.
  const skipAutoUnarmOnNextSongTransitionRef = useRef(false)

  useEffect(() => {
    const next = {
      songId: getCurrentSongId(),
      proj: getProjectionLanguage(),
      sing: getSingingLanguage(),
    }
    const prev = prevUserConfigRef.current
    if (prev === null) {
      prevUserConfigRef.current = next
      return
    }

    const userConfigChanged =
      prev.songId !== next.songId || prev.proj !== next.proj || prev.sing !== next.sing

    if (userConfigChanged) {
      const skipUnarm = skipAutoUnarmOnNextSongTransitionRef.current
      if (controlState === 'ARMED' && !skipUnarm) {
        unarm()
      }
      skipAutoUnarmOnNextSongTransitionRef.current = false
      goRestart()
      sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
    }

    prevUserConfigRef.current = next
  }, [controlState, unarm, goRestart, sendCommandWithState])

  const handleNext = () => {
    goNext()
    const newIndex = getSongIndex()
    if (recordingMode) {
      setCapture((prev) => captureAdvance(prev, newIndex, Date.now()))
    }
    if (timedTimer.running && songTimeline) {
      timedTimer.resync(newIndex)
    }
    sendCommandWithState('next', undefined, {
      currentIndex: newIndex,
      blank: getBlank(),
    })
  }
  const handlePrev = () => {
    goPrev()
    const prevIdx = getSongIndex()
    if (timedTimer.running && songTimeline) {
      timedTimer.resync(prevIdx)
    }
    sendCommandWithState('prev', undefined, { currentIndex: prevIdx, blank: getBlank() })
  }
  const handleRestart = () => {
    goRestart()
    sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
  }
  const handleToggleProjection = () => {
    if (projectionOpen) {
      closeProjection()
    } else {
      openProjection()
    }
  }
  const handleBlankToggle = () => {
    setBlankState(!blank)
    sendCommandWithState('blankToggle', undefined, { currentIndex: getSongIndex(), blank: getBlank() })
  }

  const handleRecordingAwareUnarm = () => {
    hideEndCard()
    if (recordingMode && capture.clockStartMs !== null) {
      setPendingSaveCapture(finalizeCapture(capture, Date.now()))
    }
    setRecordingMode(false)
    setCapture(initTimelineCapture())
    handleUnarmClick()
  }

  const handleSaveTimeline = () => {
    if (!pendingSaveCapture || !currentSongId) return
    const timeline = buildTimelineFromCapture(pendingSaveCapture, lines.length)
    updateSongTimeline(currentSongId, timeline)
    setPendingSaveCapture(null)
  }

  const handleDiscardTimeline = () => {
    setPendingSaveCapture(null)
  }

  const goToSongs = () => {
    window.location.hash = '#/songs'
  }

  const goToLanguages = () => {
    window.location.hash = '#/languages'
  }

  const orderedSongs = getOrderedSongsForActiveSetlist()
  const currentSongPosition = currentSongId
    ? orderedSongs.findIndex((song) => song.id === currentSongId)
    : -1
  const nextSongForTile =
    currentSongPosition >= 0 && currentSongPosition < orderedSongs.length - 1
      ? orderedSongs[currentSongPosition + 1]
      : null
  const [showNextSongTile, setShowNextSongTile] = useState(false)

  const isEndOfSong =
    controlState === 'ARMED' &&
    lines.length > 0 &&
    index >= 0 &&
    index < lines.length &&
    isLyricLine(lines[index]) &&
    index === getLastLyricIndex(lines)
  const nextDisabled = nextDisabledFromControlState

  const handleStartNextSongInConcertSession = () => {
    if (!nextSongForTile) return
    if (currentSongId) addPlayedSong(currentSongId)

    // This is an internal concert-flow transition (already armed), so we must not auto-unarm
    // just because the user-facing song id changes.
    skipAutoUnarmOnNextSongTransitionRef.current = true

    loadLines(nextSongForTile.items)
    setCurrentSongId(nextSongForTile.id)
    setCurrentSongTitle(nextSongForTile.title)
    setShowNextSongTile(false)
  }

  // When re-arming mid-song, restart so the performer sees the intro screen first.
  const handleArmAndRestart = () => {
    if (index >= 0) {
      goRestart()
      sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
    }
    handleArmClick()
  }

  const restartKeyHold = useRestartKeyHold(handleRestart)

  const handlersRef = useRef({
    handleNext,
    handlePrev,
    handleRestart,
    handleBlankToggle,
    goToSongs,
    goToLanguages,
    arm: handleArmAndRestart,
    unarm: handleRecordingAwareUnarm,
    controlState,
    nextDisabled,
  })
  handlersRef.current = {
    handleNext,
    handlePrev,
    handleRestart,
    handleBlankToggle,
    goToSongs,
    goToLanguages,
    arm: handleArmAndRestart,
    unarm: handleRecordingAwareUnarm,
    controlState,
    nextDisabled,
  }
  const restartKeyHoldRef = useRef(restartKeyHold)
  restartKeyHoldRef.current = restartKeyHold

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { handleNext: next, handlePrev: prev, handleBlankToggle: blankToggle, goToSongs: toSongs, goToLanguages: toLangs, arm: doArm, unarm: doUnarm, controlState: cState, nextDisabled: nextDisabledRef } = handlersRef.current
      const { onKeyDown: restartKeyDown } = restartKeyHoldRef.current
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        if (!nextDisabledRef) next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        restartKeyDown()
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        if (cState === 'READY_TO_ARM') doArm()
        else if (cState === 'ARMED') doUnarm()
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        toSongs()
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        toLangs()
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        blankToggle()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        restartKeyHoldRef.current.onKeyUp()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      restartKeyHoldRef.current.onKeyUp()
    }
  }, [])

  const currentEs =
    currentItem && !isSection(currentItem)
      ? (() => {
          const line = currentItem as LyricLine
          const lang =
            effectiveSingingLang ||
            (Object.keys(line.languages).sort()[0] ?? '')
          return getLyricText(line, lang)
        })()
      : ''
  const notStarted = index === -1
  const displayText = notStarted
    ? songNotes
    : currentEs || (loadError ? loadError : '—')

  const nextPreviewText =
    nextLyricLine
      ? (() => {
          const lang =
            effectiveSingingLang ||
            (Object.keys(nextLyricLine.languages).sort()[0] ?? '')
          return getLyricText(nextLyricLine, lang)
        })()
      : ''

  const restartHold = useHoldToConfirm(handleRestart)
  const unarmHold = useHoldToConfirm(handleRecordingAwareUnarm)

  const showSetupPanel = controlState === 'SETUP' || controlState === 'READY_TO_ARM'
  const showArmedShell = controlState === 'ARMED'

  // Timed mode: timer-driven subtitle advancement when a song timeline exists.
  // Keys on currentSongId (primitive) rather than the timeline object to avoid
  // render-loop issues (getLibrarySongById returns a new object on every call).
  const songTimeline = currentLibrarySong?.timeline
  const timedTimer = useSubtitleTimer(songTimeline, currentSongId, index)

  // Auto-advance song navigation when timer drives to a new line.
  const prevTimerActiveIndexRef = useRef(-1)
  useEffect(() => {
    if (!timedTimer.running) {
      prevTimerActiveIndexRef.current = -1
      return
    }
    if (timedTimer.activeIndex < 0) return
    if (timedTimer.activeIndex === prevTimerActiveIndexRef.current) return
    prevTimerActiveIndexRef.current = timedTimer.activeIndex
    applyCommand('setIndex', timedTimer.activeIndex)
    sendCommandWithState('setIndex', timedTimer.activeIndex, {
      currentIndex: timedTimer.activeIndex,
      blank: false,
    })
  }, [timedTimer.running, timedTimer.activeIndex])

  // Reset prevTimerActiveIndexRef when leaving armed state.
  useEffect(() => {
    if (!showArmedShell) {
      prevTimerActiveIndexRef.current = -1
    }
  }, [showArmedShell])

  // Beat clock: performer view only, never the projection window.
  const songTempo = currentLibrarySong?.tempo
  const { phase: beatPhase, beginFiredOnce, reset: resetBeatClock } = useBeatClock(
    songTempo,
    showArmedShell
  )
  const [beatPulseVisible, setBeatPulseVisible] = useState(true)
  const handleToggleBeatPulse = useCallback(() => setBeatPulseVisible((v) => !v), [])

  // When count-in ends, auto-advance to the first lyric (begin event).
  const prevBeginFiredRef = useRef(false)
  useEffect(() => {
    if (beginFiredOnce && !prevBeginFiredRef.current && index === -1) {
      prevBeginFiredRef.current = true
      handleNext()
    }
    if (!beginFiredOnce) {
      prevBeginFiredRef.current = false
    }
  }, [beginFiredOnce, index])

  // Reset beat clock when leaving the armed shell.
  useEffect(() => {
    if (!showArmedShell) {
      resetBeatClock()
      prevBeginFiredRef.current = false
      setBeatPulseVisible(true)
    }
  }, [showArmedShell, resetBeatClock])

  const languagesDisplay =
    effectiveSingingLang && effectiveLang
      ? `${effectiveSingingLang.toUpperCase()} → ${effectiveLang.toUpperCase()}`
      : effectiveLang
        ? effectiveLang.toUpperCase()
        : ''
  useEffect(() => {
    if (showArmedShell) return
    setTimerActionsVisible(false)
    // Stop recording when leaving armed state
    setRecordingMode(false)
    setCapture(initTimelineCapture())
  }, [showArmedShell])

  // Update the recording elapsed display every second while recording is active
  useEffect(() => {
    if (!recordingMode || capture.clockStartMs === null) {
      setRecordingElapsedSec(0)
      return
    }
    const interval = setInterval(() => {
      setRecordingElapsedSec(Math.floor((Date.now() - capture.clockStartMs!) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [recordingMode, capture.clockStartMs])

  useEffect(() => {
    setShowNextSongTile(false)
    if (!isEndOfSong || !nextSongForTile) return
    const timer = setTimeout(() => {
      setShowNextSongTile(true)
    }, NEXT_SONG_TILE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isEndOfSong, nextSongForTile?.id, currentSongId])

  useEffect(() => {
    if (!timerActionsVisible) return

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return

      const clickedInsideCircle =
        timerCircleContainerRef.current?.contains(event.target) ?? false
      const clickedInsideActions =
        timerActionsContainerRef.current?.contains(event.target) ?? false

      if (!clickedInsideCircle && !clickedInsideActions) {
        setTimerActionsVisible(false)
      }
    }

    document.addEventListener('pointerdown', onDocumentPointerDown)
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown)
  }, [timerActionsVisible])

  return (
    <div className="control-screen">
      {showArmedShell && (
        <header className="control-top-bar" role="banner">
          <div className="top-bar-summary">
            <span className="top-summary-line">
              Song: {currentSongTitle || '—'}
            </span>
            <span className="top-summary-line">
              Languages: {languagesDisplay || '—'}
            </span>
            <span className="top-summary-line">
              Projection: {projectionOpen ? 'Open' : 'Closed'}
            </span>
            <span
              className="top-title top-title-state"
              data-testid="performance-state-label"
            >
              {controlStateLabel}
            </span>
          </div>
        </header>
      )}

      <main className={`control-center ${showSetupPanel ? 'control-center-setup' : ''}`}>
        {showSetupPanel && (
          <>
            <p className="control-state-label" data-testid="performance-state-label">
              {controlStateLabel}
            </p>
            <div
              className={
                controlState === 'SETUP'
                  ? 'control-performance-state control-setup-sections'
                  : 'control-performance-state'
              }
              aria-live="polite"
            >
              <div className="control-setup-section">
                <span className="control-setup-label">Song</span>
                <div className="control-setup-content">
                  {currentSongId && lines.length > 0 ? (
                    <span className="control-setup-value">{currentSongTitle}</span>
                  ) : null}
                </div>
                <div className="control-setup-buttons">
                  <div className="control-setup-button-row">
                    <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToSongs}>
                      Setlist
                    </button>
                  </div>
                </div>
              </div>
              <div className="control-setup-section">
                <span className="control-setup-label">LANGUAGE DISPLAY</span>
                <div className="control-setup-content">
                  {effectiveLang ? (
                    <span className="control-setup-value">{languagesDisplay}</span>
                  ) : null}
                </div>
                <div className="control-setup-buttons">
                  <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToLanguages}>
                    Languages
                  </button>
                </div>
              </div>
              {window.electronAPI && (
                <div className="control-setup-section">
                  <span className="control-setup-label">Projection</span>
                  <div className="control-setup-content">
                    <span className="control-setup-value">{projectionOpen ? 'Open' : 'Closed'}</span>
                  </div>
                  <div className="control-setup-buttons">
                    <ProjectionButton isOpen={projectionOpen} onToggle={handleToggleProjection} />
                  </div>
                </div>
              )}
              <div className="control-setup-section">
                <span className="control-setup-label">Arm</span>
                <div className="control-setup-content">
                  <span className="control-setup-value">Unarmed</span>
                </div>
                <div className="control-setup-buttons">
                  <button
                    type="button"
                    className="ctrl-btn ctrl-arm"
                    onClick={handleArmAndRestart}
                    disabled={!canArm}
                  >
                    Arm
                  </button>
                </div>
              </div>
              <DisplayProfileSetup />
            </div>
          </>
        )}
        {showArmedShell && pendingSaveCapture && (
          <div className="ctrl-timeline-save-overlay" data-testid="timeline-save-dialog">
            <div className="ctrl-timeline-save-dialog">
              <p className="ctrl-timeline-save-message">
                Save timeline to &ldquo;{currentSongTitle}&rdquo;?
              </p>
              <div className="ctrl-timeline-save-actions">
                <button
                  type="button"
                  className="ctrl-btn ctrl-arm"
                  data-testid="timeline-save-btn"
                  onClick={handleSaveTimeline}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="ctrl-btn ctrl-unarm"
                  data-testid="timeline-discard-btn"
                  onClick={handleDiscardTimeline}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
        {showArmedShell && isVideoMode && (
          <VideoControlPanel
            absolutePath={resolvedVideoPath}
            mediaSrc={activeMedia!.src}
            media={activeMedia!}
            timeline={currentLibrarySong!.timeline ?? []}
            lines={lines}
            singingLang={effectiveSingingLang}
            onSeek={sendSeek}
          />
        )}
        {showArmedShell && !isVideoMode && (
          <>
            <div className="control-performing-stage" data-testid="performing-content" style={{ position: 'relative' }}>
              {songTempo && (
                <BeatIndicator
                  tempo={songTempo}
                  phase={beatPhase}
                  pulseVisible={beatPulseVisible}
                  onTogglePulse={handleToggleBeatPulse}
                />
              )}
              <div className="control-performing-stage-stack">
                <div className="control-performing-lyric-block">
                  <p className="control-lyric">{displayText}</p>
                  {!notStarted && (
                    <span
                      data-testid="control-next-preview"
                      className="control-next-preview"
                    >
                      {nextPreviewText}
                    </span>
                  )}
                  {notStarted && songIntro && (
                    <p className="control-song-intro">{songIntro}</p>
                  )}
                  {notStarted && (
                    <p className="control-state-instruction">Press Next to reveal the first line</p>
                  )}
                </div>
                {isEndOfSong && nextSongForTile && showNextSongTile && (
                  <div className="performing-next-song-tile-wrap">
                    <span className="performing-next-song-helper-label">Tap to continue</span>
                    <button
                      type="button"
                      className="songs-song-btn"
                      data-testid="next-song-tile"
                      onClick={handleStartNextSongInConcertSession}
                    >
                      <span className="songs-song-title">{nextSongForTile.title}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="ctrl-record-row" data-testid="record-timeline-row">
              <button
                type="button"
                className={`ctrl-btn ${recordingMode ? 'ctrl-record-active' : 'ctrl-record'}`}
                data-testid="record-timeline-btn"
                onClick={() => {
                  if (recordingMode) {
                    setRecordingMode(false)
                    setCapture(initTimelineCapture())
                  } else {
                    setRecordingMode(true)
                  }
                }}
              >
                {recordingMode ? 'Stop Recording' : 'Record Timeline'}
              </button>
              {recordingMode && (
                <span
                  className={`ctrl-record-indicator ${capture.clockStartMs !== null ? 'ctrl-record-indicator-active' : ''}`}
                  data-testid="record-timeline-indicator"
                >
                  {capture.clockStartMs !== null
                    ? `${recordingElapsedSec}s`
                    : 'Waiting for first advance…'}
                </span>
              )}
            </div>
            {songTimeline && (
              <div className="ctrl-timed-panel" data-testid="timed-mode-panel">
                <div className="ctrl-timed-row">
                  <span className="ctrl-timed-label">Timed</span>
                  <button
                    type="button"
                    className="ctrl-btn"
                    data-testid="timed-start-pause"
                    onClick={() => timedTimer.startPause()}
                  >
                    {timedTimer.running ? 'Pause' : 'Start'}
                  </button>
                  <button
                    type="button"
                    className="ctrl-btn"
                    data-testid="timed-stop"
                    onClick={() => timedTimer.stop()}
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    className="ctrl-btn ctrl-timed-nudge"
                    data-testid="timed-nudge-back"
                    onClick={() => timedTimer.nudge(-0.25)}
                    aria-label="Nudge back 0.25 seconds"
                  >
                    −0.25s
                  </button>
                  <button
                    type="button"
                    className="ctrl-btn ctrl-timed-nudge"
                    data-testid="timed-nudge-fwd"
                    onClick={() => timedTimer.nudge(0.25)}
                    aria-label="Nudge forward 0.25 seconds"
                  >
                    +0.25s
                  </button>
                </div>
                <div className="ctrl-timed-row">
                  <span className="ctrl-timed-time" data-testid="timed-clock">
                    {formatTimedT(timedTimer.t)}
                  </span>
                  <span className="ctrl-timed-line">
                    {timedTimer.activeIndex >= 0
                      ? `line ${timedTimer.activeIndex + 1}/${lines.length}`
                      : '—'}
                  </span>
                  <span
                    className={timedDriftClass(timedTimer.drift)}
                    data-testid="timed-drift"
                  >
                    {timedTimer.drift >= 0 ? '+' : '−'}{Math.abs(timedTimer.drift).toFixed(1)}s
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showArmedShell && (
        <div className="ctrl-timer-floating" data-testid="performance-status-floating">
          <button
            type="button"
            ref={timerCircleContainerRef}
            className={`ctrl-btn ctrl-timer-status ctrl-timer-status-circle ${timerPaused ? 'ctrl-timer-status-paused' : ''}`}
            data-testid="performance-status-button"
            aria-label="Toggle performance timer actions"
            onClick={() => setTimerActionsVisible((visible) => !visible)}
          >
            <span
              className="ctrl-timer-status-minutes ctrl-timer-status-minutes-prominent"
              data-testid="performance-status-minutes"
            >
              {elapsedMinutes}'
            </span>
          </button>
          {timerActionsVisible && (
            <div
              ref={timerActionsContainerRef}
              className="ctrl-timer-actions"
              data-testid="performance-status-actions"
            >
              <button
                type="button"
                className="ctrl-btn ctrl-timer-action"
                onClick={() => concertTimer.togglePause()}
              >
                {timerPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                className="ctrl-btn ctrl-timer-action"
                onClick={() => {
                  concertTimer.reset()
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {showArmedShell && (
        <footer className="control-bottom-bar">
          <div className="bottom-buttons">
            <button
              type="button"
              className="ctrl-btn ctrl-prev"
              onClick={handlePrev}
              disabled={lines.length === 0 || index <= -1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-next"
              onClick={handleNext}
              disabled={nextDisabled}
            >
              Next
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-restart"
              onPointerDown={restartHold.onPointerDown}
              onPointerUp={restartHold.onPointerUp}
              onPointerLeave={restartHold.onPointerLeave}
            >
              {restartHold.isHolding ? 'Hold to confirm…' : 'Restart'}
            </button>
            <button
              type="button"
              className={`ctrl-btn ${isEndOfSong ? 'ctrl-arm' : 'ctrl-unarm'}`}
              onClick={
                isEndOfSong && canUnarm
                  ? () => {
                      if (currentSongId) addPlayedSong(currentSongId)
                      handleRecordingAwareUnarm()
                    }
                  : undefined
              }
              onPointerDown={!isEndOfSong && canUnarm ? unarmHold.onPointerDown : undefined}
              onPointerUp={!isEndOfSong && canUnarm ? unarmHold.onPointerUp : undefined}
              onPointerLeave={!isEndOfSong && canUnarm ? unarmHold.onPointerLeave : undefined}
              disabled={!canUnarm}
              aria-label="Unarm (return to setup without clearing song, language, or projection)"
            >
              {isEndOfSong ? 'Unarm' : unarmHold.isHolding ? 'Hold to confirm…' : 'Unarm'}
            </button>
          </div>
          <div className="bottom-buttons-secondary">
            <button
              type="button"
              className={`ctrl-btn ${endCardVisible ? 'ctrl-end-card-active' : 'ctrl-end-card'}`}
              data-testid="end-card-btn"
              onClick={toggleEndCard}
            >
              {endCardVisible ? 'Hide End Card' : 'End Card'}
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

function SongsView() {
  const playedIds = getPlayedSongIds()

  const activeOk = hasValidActiveSetlist()
  const orderedSongs = getOrderedSongsForActiveSetlist()
  const activeSetlistId = getActiveSetlistId()
  const activeSetlistName =
    activeOk && activeSetlistId !== ''
      ? (getSetlists().find((s) => s.id === activeSetlistId)?.name ?? '')
      : ''

  // When entering Setlist after finishing a song, do not pre-select the played song.
  const [selectedSong, setSelectedSong] = useState<LibrarySong | null>(() => {
    const id = getCurrentSongId()
    if (!id) return null
    if (getPlayedSongIds().includes(id)) return null
    const lib = getLibrarySongById(id)
    if (!lib) return null
    if (!hasValidActiveSetlist()) return null
    const ordered = getOrderedSongsForActiveSetlist()
    if (!ordered.some((s) => s.id === id)) return null
    return lib
  })

  const goBack = () => {
    window.location.hash = '#/'
  }

  const selectSong = (song: LibrarySong) => {
    setSelectedSong(song)
  }

  const confirmSelection = () => {
    if (!selectedSong) return
    const lib = getLibrarySongById(selectedSong.id)
    if (!lib) {
      alert(`Could not load ${selectedSong.title}.`)
      return
    }
    applySelectedSongToSetup(lib)
    window.location.hash = '#/'
  }

  return (
    <div className="songs-screen">
      <header className="songs-top-bar">
        <button type="button" className="songs-back" onClick={goBack}>
          Back
        </button>
        <h1 className="songs-title">
          {activeSetlistName ? (
            <>
              Setlist:{' '}
              <span className="songs-active-setlist-name" data-testid="active-setlist-name">
                {activeSetlistName}
              </span>
            </>
          ) : (
            'Setlist'
          )}
        </h1>
        <button
          type="button"
          className="songs-manage-setlists"
          onClick={() => {
            window.location.hash = '#/songs/manage-setlists'
          }}
        >
          Manage setlists
        </button>
      </header>
      <main className="songs-body">
        {!activeOk ? (
          <p className="setlist-prompt" data-testid="setlist-selection-prompt">
            Choose a setlist to continue.
          </p>
        ) : (
          <>
            {orderedSongs.map((song) => (
              <button
                key={song.id}
                type="button"
                className={`songs-song-btn ${selectedSong?.id === song.id ? 'ctrl-arm' : ''} ${playedIds.includes(song.id) ? 'songs-song-btn-played' : ''}`}
                aria-pressed={selectedSong?.id === song.id}
                onClick={() => selectSong(song)}
              >
                {playedIds.includes(song.id) ? (
                  <>
                    <span className="song-played-icon" aria-hidden />
                    <span className="songs-song-title">{song.title}</span>
                  </>
                ) : (
                  <span className="songs-song-title">{song.title}</span>
                )}
              </button>
            ))}
            <div className="songs-confirm-wrap">
              <button
                type="button"
                className="ctrl-btn languages-confirm"
                disabled={!selectedSong}
                aria-label="Confirm"
                onClick={confirmSelection}
              >
                Confirm
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function LanguagesView() {
  const [lines, setLines] = useState<SongItem[]>(getSongLines)
  useEffect(() => {
    setLines(getSongLines())
  }, [])
  useEffect(() => {
    const onStorage = () => setLines(getSongLines())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const goBack = () => {
    window.location.hash = '#/'
  }

  const availableSinging = getAvailableSingingLanguages(lines)
  const availableTranslation = getAvailableLanguages(lines)
  const hasSong = lines.length > 0
  const [selectedSinging, setSelectedSingingState] = useState(getSingingLanguage)
  const [selectedTranslation, setSelectedTranslationState] = useState(getProjectionLanguage)

  useEffect(() => {
    setSelectedSingingState(getSingingLanguage())
    setSelectedTranslationState(getProjectionLanguage())
  }, [lines])

  const selectSingingLanguage = (lang: string) => {
    if (lang === getSingingLanguage()) return
    setSingingLanguage(lang)
    setSelectedSingingState(lang)
    setSongIndex(-1)
    setBlank(true)
  }

  const selectTranslationLanguage = (lang: string) => {
    if (lang === getProjectionLanguage()) return
    setProjectionLanguage(lang)
    setSelectedTranslationState(lang)
    setSongIndex(-1)
    setBlank(true)
  }

  const handleConfirm = () => {
    window.location.hash = '#/'
  }

  return (
    <div className="songs-screen languages-screen">
      <header className="songs-top-bar">
        <button type="button" className="songs-back" onClick={goBack}>
          Back
        </button>
        <h1 className="songs-title">Languages</h1>
      </header>
      <main className="songs-body">
        {!hasSong ? (
          <p className="languages-empty">No song loaded. Select a song first to choose singing and translation languages.</p>
        ) : (
          <>
            <div className="languages-columns">
              <section className="languages-column" aria-label="Singing">
                <h2 className="languages-section-title">Singing</h2>
                <div className="languages-buttons languages-buttons-vertical">
                  {availableSinging.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`languages-lang-btn ${selectedSinging === lang ? 'languages-lang-btn-selected' : ''}`}
                      onClick={() => selectSingingLanguage(lang)}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </section>
              <span className="languages-arrow" aria-hidden="true">→</span>
              <section className="languages-column" aria-label="Projection">
                <h2 className="languages-section-title">Projection</h2>
                <div className="languages-buttons languages-buttons-vertical">
                  {availableTranslation.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`languages-lang-btn ${selectedTranslation === lang ? 'languages-lang-btn-selected' : ''}`}
                      onClick={() => selectTranslationLanguage(lang)}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <div className="languages-confirm-wrap">
              <button type="button" className="ctrl-btn languages-confirm" onClick={handleConfirm}>
                Confirm
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function DisplayProfileSetup() {
  const [profile, setProfileState] = useState<DisplayProfile>(getActiveDisplayProfile)
  const [customBand, setCustomBand] = useState<number>(() => {
    const p = getActiveDisplayProfile()
    return p.id === 'custom' ? p.bandPercent : 20
  })
  const [customScale, setCustomScale] = useState<number>(() => {
    const p = getActiveDisplayProfile()
    return p.id === 'custom' ? p.textScale : 0.5
  })

  const selectPreset = (id: Exclude<ProfileId, 'custom'>) => {
    setActiveProfileId(id)
    setProfileState(getActiveDisplayProfile())
  }

  const activateCustom = () => {
    setCustomProfile(customBand, customScale)
    setProfileState(getActiveDisplayProfile())
  }

  return (
    <div className="ctrl-display-row">
      <span className="ctrl-display-label">Display</span>
      <div className="ctrl-display-buttons">
        {DISPLAY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`ctrl-btn ctrl-setup-link ${profile.id === preset.id ? 'ctrl-arm' : ''}`}
            onClick={() => selectPreset(preset.id as Exclude<ProfileId, 'custom'>)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`ctrl-btn ctrl-setup-link ${profile.id === 'custom' ? 'ctrl-arm' : ''}`}
          onClick={activateCustom}
        >
          Custom
        </button>
      </div>
      {profile.id === 'custom' && (
        <div className="ctrl-custom-profile-form">
          <label className="ctrl-custom-profile-field">
            <span>Band %</span>
            <input
              type="number"
              className="ctrl-custom-profile-input"
              value={customBand}
              min={1}
              max={50}
              step={1}
              onChange={(e) => setCustomBand(Number(e.target.value))}
            />
          </label>
          <label className="ctrl-custom-profile-field">
            <span>Scale</span>
            <input
              type="number"
              className="ctrl-custom-profile-input"
              value={customScale}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(e) => setCustomScale(Number(e.target.value))}
            />
          </label>
          <button type="button" className="ctrl-btn ctrl-arm" onClick={activateCustom}>
            Apply
          </button>
        </div>
      )}
    </div>
  )
}

function useProjectionDisplayProfile(): DisplayProfile {
  const [profile, setProfile] = useState<DisplayProfile>(getActiveDisplayProfile)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('display_profile')) {
        setProfile(getActiveDisplayProfile())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return profile
}

function ProjectionView() {
  const singleScreen =
    import.meta.env.VITE_SINGLE_SCREEN === '1' ||
    import.meta.env.VITE_SINGLE_SCREEN === 'true'
  const { lines, currentItem, blank, index, goNext, goPrev } = useSongNavigation()
  const effectiveLang = getEffectiveProjectionLanguage(lines)
  const isSectionMarker = currentItem && isSection(currentItem)
  const translation =
    currentItem && !isSection(currentItem) && effectiveLang
      ? getLyricText(currentItem as LyricLine, effectiveLang)
      : ''
  const renderedText = translation

  const currentSongId = getCurrentSongId()
  const currentLibrarySong = currentSongId ? getLibrarySongById(currentSongId) : undefined
  const singingLang = getSingingLanguage()

  // Show logo on every mount; reveal intro only after the control fires an arm transition.
  // The arm action writes KEY_ARMED_BROADCAST to localStorage, which fires a cross-window
  // storage event that the projection can receive. This prevents leftover lyrics appearing
  // when the projection window is reopened mid-song.
  const isArmed = index === -1 && lines.length > 0
  const [hasSeenArmedSinceMount, setHasSeenArmedSinceMount] = useState(false)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_ARMED_BROADCAST && e.newValue === '1') {
        setHasSeenArmedSinceMount(true)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // End-card: cross-window state via localStorage (same origin as control window).
  const [endCardVisible, setEndCardVisibleState] = useState(getEndCardVisible)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_END_CARD_VISIBLE || e.key === null) {
        setEndCardVisibleState(getEndCardVisible())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const [endCardLines, setEndCardLines] = useState<string[]>([])
  useEffect(() => {
    fetch('/end-card.md')
      .then((r) => r.text())
      .then((text) => {
        setEndCardLines(text.split('\n').filter((l) => l.trim() !== ''))
      })
      .catch(() => { /* content stays empty */ })
  }, [])

  const showLogo = !hasSeenArmedSinceMount
  const showIntroScreen = hasSeenArmedSinceMount && isArmed && !!currentLibrarySong
  const showContent = hasSeenArmedSinceMount && index >= 0 && !blank && !isSectionMarker

  const [displayedText, setDisplayedText] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoHiddenKeyRef = useRef<string | null>(null)

  const activeKey = showContent ? `${index}:${renderedText}` : ''

  const clearAllTimers = () => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current)
      fadeOutTimer.current = null
    }
    if (swapTimer.current) {
      clearTimeout(swapTimer.current)
      swapTimer.current = null
    }
    if (autoFadeTimer.current) {
      clearTimeout(autoFadeTimer.current)
      autoFadeTimer.current = null
    }
  }

  const FADE_MS = 500
  const AUTO_FADE_MS = 6000

  useEffect(() => {
    clearAllTimers()

    if (!showContent) {
      autoHiddenKeyRef.current = null
      setIsVisible(false)
      swapTimer.current = setTimeout(() => setDisplayedText(''), FADE_MS)
      return () => clearAllTimers()
    }

    if (autoHiddenKeyRef.current === activeKey) {
      return () => clearAllTimers()
    }

    autoHiddenKeyRef.current = null

    const nextText = renderedText ?? ''

    if (displayedText === '') {
      setDisplayedText(nextText)
      setIsVisible(true)
      autoFadeTimer.current = setTimeout(() => {
        setIsVisible(false)
        fadeOutTimer.current = setTimeout(() => {
          autoHiddenKeyRef.current = activeKey
          setDisplayedText('')
        }, FADE_MS)
      }, AUTO_FADE_MS)
    } else if (nextText !== displayedText) {
      setIsVisible(false)
      swapTimer.current = setTimeout(() => {
        setDisplayedText(nextText)
        setIsVisible(true)
        autoFadeTimer.current = setTimeout(() => {
          setIsVisible(false)
          fadeOutTimer.current = setTimeout(() => {
            autoHiddenKeyRef.current = activeKey
            setDisplayedText('')
          }, FADE_MS)
        }, AUTO_FADE_MS)
      }, FADE_MS)
    } else {
      autoFadeTimer.current = setTimeout(() => {
        setIsVisible(false)
        fadeOutTimer.current = setTimeout(() => {
          autoHiddenKeyRef.current = activeKey
          setDisplayedText('')
        }, FADE_MS)
      }, AUTO_FADE_MS)
    }

    return () => clearAllTimers()
  }, [showContent, renderedText, displayedText, activeKey])

  useEffect(() => () => clearAllTimers(), [])

  const displayProfile = useProjectionDisplayProfile()
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight || 1080)
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const layout = computeProjectionLayout(displayProfile, window.innerWidth, viewportHeight)

  const navRef = useRef({ goNext, goPrev })
  navRef.current = { goNext, goPrev }
  useEffect(() => {
    if (!singleScreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { goNext: next, goPrev: prev } = navRef.current
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [singleScreen])

  // VIDEO MODE: if the current song has a video, resolve the path and render the compositor
  const activeMedia = currentLibrarySong ? getActiveMediaFile(currentLibrarySong) : undefined
  const isVideoMode = activeMedia?.type === 'video'
  const resolvedVideoPath = isVideoMode ? getMediaPath(activeMedia!.src) : null

  if (isVideoMode && resolvedVideoPath) {
    return (
      <div
        className="projection-screen"
        style={{
          background: '#000',
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
        }}
      >
        <VideoProjectionRegion
          absolutePath={resolvedVideoPath}
          media={activeMedia!}
          timeline={currentLibrarySong!.timeline ?? []}
          lines={lines}
          effectiveLang={effectiveLang}
          layout={layout}
        />
      </div>
    )
  }

  if (endCardVisible) {
    return (
      <div
        className="projection-screen projection-end-card-screen"
        data-testid="end-card-screen"
        style={{
          background: '#000',
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          gap: '0.5em',
          textAlign: 'center',
          padding: '2em',
          boxSizing: 'border-box',
        }}
      >
        {endCardLines.map((line, i) => (
          <p key={i} className="projection-end-card-line">
            {line.replace(/^#+\s*/, '')}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div
      className="projection-screen"
      style={{
        background: '#000',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
      }}
    >
      {/* Animation region: logo + intro screen, scaled with object-fit: contain */}
      <div
        className="projection-animation-region"
        style={{
          position: 'relative',
          width: '100%',
          height: `${layout.animationHeightPx}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          src="/chango-pepper-logo.png"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: showLogo ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
            pointerEvents: 'none',
          }}
        />
        {showIntroScreen && currentLibrarySong && (
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
            <span className="projection-intro-title">
              {currentLibrarySong.title}
            </span>
            {effectiveLang !== singingLang &&
              currentLibrarySong.title_translations?.[effectiveLang] && (
                <span className="projection-intro-translated-title">
                  ({currentLibrarySong.title_translations[effectiveLang]})
                </span>
              )}
            {currentLibrarySong.intro?.[effectiveLang] && (
              <span className="projection-intro-tagline">
                {currentLibrarySong.intro[effectiveLang]}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Subtitle band: fixed-height black strip at the bottom */}
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
            opacity: isVisible ? 1 : 0,
            ...(layout.fontSizePx > 0 ? { fontSize: `${layout.fontSizePx}px` } : {}),
          }}
        >
          {displayedText}
        </span>
      </div>
    </div>
  )
}

function App({ initialHash }: { initialHash?: string } = {}) {
  const [hash, setHash] = useState(() =>
    typeof initialHash === 'string' ? initialHash : window.location.hash
  )
  const isProjectionRoute = hash === '#/projection'
  const [songLibRetryKey, setSongLibRetryKey] = useState(0)
  const [songLibState, setSongLibState] = useState<'loading' | 'ready' | 'error'>(() => {
    const h = typeof initialHash === 'string' ? initialHash : window.location.hash
    if (h === '#/projection') return 'ready'
    if (typeof localStorage !== 'undefined' && loadSetlistStore()) return 'ready'
    return 'loading'
  })
  const [songLibError, setSongLibError] = useState<string | null>(null)

  useEffect(() => {
    if (isProjectionRoute) {
      setSongLibState('ready')
      setSongLibError(null)
      return
    }
    if (loadSetlistStore()) {
      setSongLibState('ready')
      setSongLibError(null)
      return
    }
    setSongLibState('loading')
    setSongLibError(null)
    let cancelled = false
    ensureSongLibraryHydrated()
      .then(() => {
        if (!cancelled) {
          setSongLibState('ready')
          setSongLibError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSongLibState('error')
          setSongLibError(e instanceof Error ? e.message : 'Failed to load song library')
        }
      })
    return () => {
      cancelled = true
    }
  }, [isProjectionRoute, songLibRetryKey])

  // When Setup renders with an active setlist, auto-load its first song when no valid song is selected.
  useEffect(() => {
    if (window.location.hash === '#/projection') return
    if (hash !== '#/' || songLibState !== 'ready') return
    if (!sessionStorage.getItem('liveLyricLaunched')) {
      sessionStorage.setItem('liveLyricLaunched', '1')
    }
    const snapshot = loadSetlistStore()
    if (!snapshot || !snapshot.activeSetlistId) return
    const activeSongs = getOrderedSongsForActiveSetlist()
    const currentSongId = getCurrentSongId()
    const hasValidLoadedSong =
      currentSongId !== '' &&
      activeSongs.some((song) => song.id === currentSongId) &&
      getSongLines().length > 0
    if (!hasValidLoadedSong) {
      autoSelectFirstSongForActiveSetlist(snapshot)
    }
  }, [hash, songLibState])

  useEffect(() => {
    if (typeof initialHash === 'string') return
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [initialHash])

  if (!isProjectionRoute && songLibState === 'loading') {
    return (
      <>
        <ConcertSessionTimerRunner />
        <div className="app-loading" data-testid="song-library-loading" aria-busy="true">
          Loading…
        </div>
      </>
    )
  }
  if (!isProjectionRoute && songLibState === 'error') {
    return (
      <>
        <ConcertSessionTimerRunner />
        <div className="app-hydrate-error" role="alert" data-testid="song-library-error">
          <p>{songLibError}</p>
          <button type="button" onClick={() => setSongLibRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </>
    )
  }

  if (hash === '#/projection')
    return (
      <>
        <ConcertSessionTimerRunner />
        <ProjectionView />
      </>
    )
  if (hash === '#/songs/manage-setlists')
    return (
      <>
        <ConcertSessionTimerRunner />
        <ManageSetlistsView />
      </>
    )
  if (hash === '#/songs')
    return (
      <>
        <ConcertSessionTimerRunner />
        <SongsView />
      </>
    )
  if (hash === '#/languages')
    return (
      <>
        <ConcertSessionTimerRunner />
        <LanguagesView />
      </>
    )
  return (
    <>
      <ConcertSessionTimerRunner />
      <ControlView />
    </>
  )
}

export default App
