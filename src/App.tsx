import { useSongNavigation } from './useSongNavigation'
import {
  computeProjectionLayout,
  type DisplayProfile,
} from './displayProfile'
import {
  getActiveDisplayProfile,
  setActiveProfileId,
} from './displayProfileStore'
import { isSection, getSongIndex, getBlank, setSongLines, setSongIndex, setBlank, setCurrentSongId, setCurrentSongTitle, setProjectionLanguage, setSingingLanguage, getEffectiveProjectionLanguage, getEffectiveSingingLanguage, getAvailableLanguages, getAvailableSingingLanguages, getSongLines, getCurrentSongId, getLyricText, getSingingLanguage, getProjectionLanguage, getLastLyricIndex, isLyricLine } from './songState'
import { getMediaPath } from './mediaPathStore'
import { VideoProjectionRegion } from './VideoProjectionRegion'
import { VideoPerformancePanel } from './VideoPerformancePanel'
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
import { getEndCardVisible, KEY_END_CARD_VISIBLE } from './endCardState'
import { useEffect, useState, useRef } from 'react'
import { useBeatClock } from './useBeatClock'
import { BeatCircle } from './BeatCircle'
import { setAutoBlackout, getAutoBlackout, AUTO_BLACKOUT_KEY } from './autoBlackout'
import { ManageSetlistsView } from './ManageSetlistsView'
import {
  autoSelectFirstSongForActiveSetlist,
  ensureSongLibraryHydrated,
  getActiveSetlistId,
  getLibrarySongById,
  getOrderedSongsForActiveSetlist,
  getSetlists,
  hasValidActiveSetlist,
  loadSetlistStore,
  type LibrarySong,
} from './setlistStore'
import { addPlayedSong, getPlayedSongIds } from './playedSongsState'
import {
  getProjectionStatusText,
  getStoredScreenSize,
  setStoredScreenSize,
  getBroadcastScreenSize,
  getDefaultScreenSize,
  KEY_SCREEN_SIZE_BROADCAST,
  getStoredDisplayMode,
  setStoredDisplayMode,
  getDefaultDisplayMode,
  getBroadcastDisplayMode,
  KEY_DISPLAY_MODE_BROADCAST,
  type ScreenSize,
  type DisplayMode,
} from './screenSizeState'
import type { LyricLine, SongItem } from './songState'
import { computeAutoAdvanceIndex, isCueStartMode, resolveAdvanceMode, type AdvanceMode } from './autoAdvanceState'
import {
  getStoredPerformedBpm,
  setStoredPerformedBpm,
  resolvePerformedBpm,
  getTempoScale,
  scaleTimeline,
  isUsableBpm,
} from './performedTempo'
import ThemeSwitcher from './ThemeSwitcher' // THROWAWAY: restyle prototype
import './control.css'

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
  const currentSongId = getCurrentSongId()

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

  // Screen size persisted per session (used as display-format toggle; does not select a media file).
  const [selectedScreenSize, setSelectedScreenSize] = useState<ScreenSize | null>(() =>
    getStoredScreenSize()
  )

  // 3-way display mode: 'none' | 'small' | 'big'. Replaces the old 2-way Small/Big toggle.
  const [selectedDisplayMode, setSelectedDisplayMode] = useState<DisplayMode | null>(() =>
    getStoredDisplayMode()
  )

  // Manual/Auto lyric-advance toggle. Default: auto when the song has a non-empty timeline,
  // manual otherwise. Resets to null (defer to the per-song default) whenever the song changes,
  // so switching songs doesn't carry over an explicit choice made for a previous song.
  const [selectedAdvanceMode, setSelectedAdvanceMode] = useState<AdvanceMode | null>(null)
  // P6: set when the performer presses Next/Previous during Auto playback, dropping the song
  // into Manual for the REMAINDER of the song. Reset on the next song and the next arm (below),
  // and by the Restart handlers — never sticky across songs.
  const [manualOverrideTaken, setManualOverrideTaken] = useState(false)
  const prevAdvanceModeSongIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevAdvanceModeSongIdRef.current !== currentSongId) {
      prevAdvanceModeSongIdRef.current = currentSongId
      setSelectedAdvanceMode(null)
      setManualOverrideTaken(false)
    }
  }, [currentSongId])

  const activeMedia = currentLibrarySong?.media
  const isVideoMode = activeMedia?.type === 'video'
  const resolvedVideoPath = isVideoMode ? getMediaPath(activeMedia!.src) : null
  const effectiveScreenSize: ScreenSize | null = selectedScreenSize ?? getDefaultScreenSize(isVideoMode)
  // Effective display mode: stored value or default (small for video songs, none for non-video)
  const effectiveDisplayMode: DisplayMode = selectedDisplayMode ?? getDefaultDisplayMode(isVideoMode)
  // Keep the localStorage broadcast in sync with the effective display mode at all times —
  // not just on toggle clicks. Without this, a broadcast left over from a previous session
  // (e.g. 'none') can be stale relative to this session's fresh computed default (e.g. 'small'
  // for a video song), and the Projection window — which reads the broadcast at mount — ends up
  // disagreeing with Control until the user manually clicks the toggle. See the A1 bug
  // (2026-07-04 projector test) and the "Storage-event / persisted-flag gotcha" in CLAUDE.md.
  // effectiveDisplayMode is a string primitive, safe as an effect dependency.
  useEffect(() => {
    try { localStorage.setItem(KEY_DISPLAY_MODE_BROADCAST, effectiveDisplayMode) } catch { /* unavailable in some envs */ }
  }, [effectiveDisplayMode])
  // Lyric advance mode (non-video performer view only). Auto is only selectable when the
  // song has a non-empty timeline to drive off.
  const songTimeline = currentLibrarySong?.timeline ?? []
  const hasTimeline = songTimeline.length > 0
  const autoAdvanceAvailable = hasTimeline
  const effectiveAdvanceMode: AdvanceMode = resolveAdvanceMode({
    selected: selectedAdvanceMode,
    hasTimeline,
    manualOverrideTaken,
  })
  // The performer only gets the video panel when the song has a video AND it's actually
  // being shown (display mode isn't 'none'). In 'none' mode a video song behaves exactly
  // like a non-video song for the performer (manual Next/Previous/Restart).
  const showVideoPerformance = isVideoMode && effectiveDisplayMode !== 'none'
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
  const { sendCommandWithState, sendSeek, sendScreenSize } = useWebSocket({
    index,
    blank,
    applyRemoteState,
    applyCommand,
  })

  const handleSelectDisplayMode = (mode: DisplayMode) => {
    setSelectedDisplayMode(mode)
    setStoredDisplayMode(mode)
    // Sync legacy screen size for WebSocket broadcast and display profile
    if (mode === 'small' || mode === 'big') {
      setSelectedScreenSize(mode)
      setStoredScreenSize(mode)
      sendScreenSize(mode)
      setActiveProfileId(mode === 'big' ? 'big-screen' : 'small-canvas')
    }
    // For 'none', keep whatever display profile was last active (no video shown anyway)
  }

  useEffect(() => {
    if (effectiveScreenSize === 'small') setActiveProfileId('small-canvas')
    else if (effectiveScreenSize === 'big') setActiveProfileId('big-screen')
  }, [effectiveScreenSize])

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
    // The first Next (index -1 → 0) also starts the non-video beat clock — the beat
    // indicator is driven by the existing controls, not a separate Start button.
    // startBeatClock() is a no-op when already running or when there is no tempo.
    //
    // P1 (start-on-cue): for a cue-start Auto song (v2 timeline, no video — see
    // isCueStartAuto below), this same first press IS the timeline's start cue — it fires
    // startAtCue() instead, which begins the clock straight into 'playing' regardless of
    // tempo.countInBars (no count-in). isCueStartAuto/startAtCue are declared further down
    // this component but already assigned by the time this closure is ever invoked (it's only
    // called from a later click, after the full render — the same pattern this function
    // already relies on for startBeatClock, destructured from useBeatClock() below it).
    const wasNotStarted = getSongIndex() === -1
    // P6: a Next pressed while Auto is actually driving the song takes the wheel for the rest
    // of the song. The cue press itself (wasNotStarted) is excluded — that press STARTS Auto,
    // it doesn't override it.
    if (isAutoArmed && !wasNotStarted) {
      setManualOverrideTaken(true)
    }
    goNext()
    const newIndex = getSongIndex()
    if (wasNotStarted) {
      if (isCueStartAuto) {
        startAtCue()
      } else {
        startBeatClock()
      }
    }
    sendCommandWithState('next', undefined, {
      currentIndex: newIndex,
      blank: getBlank(),
    })
  }
  const handlePrev = () => {
    // P6: Previous takes the wheel exactly as Next does. Previous is disabled before the cue,
    // so the index check is belt-and-braces against a pedal/keyboard path reaching it early.
    if (isAutoArmed && getSongIndex() >= 0) {
      setManualOverrideTaken(true)
    }
    goPrev()
    const prevIdx = getSongIndex()
    sendCommandWithState('prev', undefined, { currentIndex: prevIdx, blank: getBlank() })
  }
  const handleRestart = () => {
    goRestart()
    // Restart also restarts the non-video beat clock (no-op when there is no tempo).
    restartBeatClock()
    // P6: back to the top of the song means the song drives itself again.
    setManualOverrideTaken(false)
    sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
  }

  // R2: Manual Start-step Restart — return to the pre-Start state so the button flips back to
  // "Start": index -1, beat clock idle (not a fresh count-in), Next/Previous disabled again.
  const handleManualStartRestart = () => {
    goRestart()
    resetBeatClock()
    setManualOverrideTaken(false)
    sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
  }

  // ── T2 Auto transport (non-video, Auto mode): mirrors the Video panel's Play/Pause/Restart,
  // but the clock is the beat clock and the audience is black (no video) until a cue is due. ──
  const handleAutoPlay = () => {
    // start() begins the count-in (or resumes from pause). The audience goes black immediately
    // (the count-in shows on the performer's beat indicator, not on the audience screen); cues
    // then reveal lyrics on both screens via the Auto drive effect's setIndex broadcasts.
    startBeatClock()
    setAutoBlackout(true)
  }
  const handleAutoPause = () => {
    pauseBeatClock()
  }
  const handleAutoRestart = () => {
    // Return to the pre-Play state: clock idle, audience back on the intro/title, index reset.
    resetBeatClock()
    setAutoBlackout(false)
    goRestart()
    // P6: back to the top of the song means the song drives itself again.
    setManualOverrideTaken(false)
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

  const handleUnarm = () => {
    setAutoBlackout(false)
    handleUnarmClick()
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
    // Fresh arm: audience starts on the intro/title, not blacked out from a prior performance.
    setAutoBlackout(false)
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
    unarm: handleUnarm,
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
    unarm: handleUnarm,
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
  const manualStartRestartHold = useHoldToConfirm(handleManualStartRestart)
  const unarmHold = useHoldToConfirm(handleUnarm)

  const showSetupPanel = controlState === 'SETUP' || controlState === 'READY_TO_ARM'
  const showArmedShell = controlState === 'ARMED'

  // Beat clock: non-video performer view only. Video mode manages its own clock inside VideoPerformancePanel.
  // The clock does NOT auto-start on arm — it stays idle until the performer presses Start,
  // decoupled from lyric advance (Next). See CLAUDE.md / d-wire Prompt 5.
  const songTempo = currentLibrarySong?.tempo
  // C1: the Transitions toggle is shown whenever there's *some* reason a performer would look
  // for it (a timeline to drive Auto off of, or a tempo that suggests Auto might apply) — not
  // only when Auto is actually available. When Auto can't be selected, the tooltip explains why
  // (missing timeline is the only reason now that the beat indicator no longer gates Auto).
  const showAdvanceModeToggle = hasTimeline || !!songTempo
  const advanceAutoDisabledReason: string | null = !hasTimeline
    ? 'Auto needs a timeline.'
    : null

  // ── P9: performed-tempo scaling ──────────────────────────────────────────────────────────
  // tempo.bpm is a fact about the RECORDING and the anchor the whole scale depends on — it is
  // read here and never written. The performed tempo lives in its own store (performedTempo.ts).
  const declaredBpm = songTempo?.bpm
  const [performedBpmField, setPerformedBpmField] = useState<string>('')
  const [storedPerformedBpm, setStoredPerformedBpmState] = useState<number | null>(null)
  useEffect(() => {
    const stored = currentSongId ? getStoredPerformedBpm(currentSongId) : null
    setStoredPerformedBpmState(stored)
    setPerformedBpmField(stored === null ? '' : String(stored))
  }, [currentSongId])
  // Defaults to the declared tempo → scale exactly 1.0 → today's behaviour, byte-identical.
  const performedBpm = resolvePerformedBpm(declaredBpm, storedPerformedBpm)
  const tempoScale = getTempoScale(declaredBpm, performedBpm)
  // The pulse runs at the performed tempo. Both the pulse and the cue times derive from this
  // same number, so they cannot drift apart. A new object each render is safe: useBeatClock
  // keys its effects on primitive tempo fields, never on object identity (see CLAUDE.md).
  const pulseTempo = songTempo && performedBpm !== undefined
    ? { ...songTempo, bpm: performedBpm }
    : songTempo
  const handlePerformedBpmChange = (raw: string) => {
    setPerformedBpmField(raw)
    const parsed = Number(raw)
    const next = raw.trim() === '' || !isUsableBpm(parsed) ? null : parsed
    if (currentSongId) setStoredPerformedBpm(currentSongId, next)
    setStoredPerformedBpmState(next)
  }

  const {
    phase: beatPhase,
    songElapsedMs,
    playState: beatPlayState,
    start: startBeatClock,
    startAtCue,
    pause: pauseBeatClock,
    restart: restartBeatClock,
    reset: resetBeatClock,
  } = useBeatClock(
    pulseTempo,
    showArmedShell && !showVideoPerformance
  )

  // T2: Auto lyric-advance behaves like Video mode but driven by the beat clock. When the
  // song is armed non-video in Auto, the performer gets Play/Pause/Restart transport (not
  // Next/Previous), and the audience is black during the count-in and before the first cue
  // (see handleAutoPlay / autoBlackout / the projection blackout listener).
  const isAutoArmed =
    showArmedShell && !showVideoPerformance && effectiveAdvanceMode === 'auto' && hasTimeline
  // P1 (start-on-cue): a v2-timeline, no-video Auto song skips Play/count-in entirely — the
  // performer's first pedal press/Next is the start cue itself (see handleNext, startAtCue in
  // useBeatClock.ts). Keyed on primitives only (timelineVersion, isVideoMode — a boolean
  // derived from media.type), never on currentLibrarySong/media object identity, per the hook-
  // stability gotcha in CLAUDE.md. isVideoMode (not showVideoPerformance) is deliberate: a
  // video song with display mode 'none' still has video media and must NOT get cue-start,
  // matching "has no video media" in the P1 spec exactly.
  const isCueStartAuto = isCueStartMode({
    armed: isAutoArmed,
    advanceMode: effectiveAdvanceMode,
    timelineVersion: currentLibrarySong?.timelineVersion,
    hasVideo: isVideoMode,
  })
  // Once Play (legacy Auto) or the cueing Next (cue-start Auto, P1) has fired, the performer's
  // own screen stops showing the intro/notes; idle means we're still waiting to start/cue.
  // (Whether the AUDIENCE goes black meanwhile is a separate concern — see isCueStartAuto and
  // the autoBlackout comments on handleAutoPlay: legacy Auto blacks the audience out on Play,
  // cue-start Auto never does, so the audience keeps showing the title/intro until the cue.)
  const autoPerformanceStarted = isAutoArmed && beatPlayState !== 'idle'

  // P6: the override resets on the next arm as well as the next song, so a song taken manual
  // one night starts the next arm driving itself again.
  useEffect(() => {
    setManualOverrideTaken(false)
  }, [armed])

  // R2: Manual mode gets an explicit Start step so the count-in runs a full bar BEFORE the
  // first lyric — the performer can catch the tempo before singing, instead of the beat
  // starting on the same Next press that reveals line 1. This only applies when there is a
  // count-in to pre-run: the song has a tempo. Otherwise Next reveals line 1 immediately
  // (today's behaviour, no Start step).
  const isManualArmed = showArmedShell && !showVideoPerformance && !isAutoArmed
  const manualStartStep = isManualArmed && !!songTempo
  // Before Start the beat clock is idle; Start begins the count-in (count-in → playing).
  const manualPreStart = manualStartStep && beatPlayState === 'idle'

  // Auto lyric-advance drive (non-video performer view only): once the beat clock's song
  // has begun (songElapsedMs ticking, i.e. the first Next has started the clock and the
  // count-in has completed), map elapsed time against the timeline to a target cue index
  // and, if it differs from the current index, jump there — same path a remote/manual
  // setIndex command takes, so the Projection window stays in sync. Manual Next/Prev always
  // remain available and simply move `index`; because this effect keys off songElapsedMs
  // (not index), the next tick recomputes from the timeline and Auto resumes tracking
  // elapsed time rather than fighting the manual move.
  // Deps are primitives only (songElapsedMs, hasTimeline, index, effectiveAdvanceMode,
  // showVideoPerformance) — never the timeline/song object identity, and not applyCommand/
  // sendCommandWithState (unmemoized, new reference every render) — per the hook-stability
  // gotcha (CLAUDE.md): currentLibrarySong is a fresh object every render, and this effect
  // must not re-run on every render just because a callback reference changed.
  const timelineRef = useRef(songTimeline)
  timelineRef.current = songTimeline
  // P9: read through a ref, not an effect dep — the scale is frozen for the duration of a
  // performance (the control is only reachable before arming), so a change must never re-target
  // the current line mid-song.
  const tempoScaleRef = useRef(tempoScale)
  tempoScaleRef.current = tempoScale
  const applyRemoteStateRef = useRef(applyRemoteState)
  applyRemoteStateRef.current = applyRemoteState
  const sendCommandWithStateRef = useRef(sendCommandWithState)
  sendCommandWithStateRef.current = sendCommandWithState
  useEffect(() => {
    if (showVideoPerformance) return
    if (effectiveAdvanceMode !== 'auto' || !hasTimeline) return
    if (songElapsedMs <= 0) return
    // P9: cue times are the recording's timings scaled by declaredBpm / performedBpm. At the
    // default (performedBpm == tempo.bpm) the scale is exactly 1 and scaleTimeline returns the
    // original array untouched.
    const cueTimeline = scaleTimeline(timelineRef.current, tempoScaleRef.current)
    const targetIndex = computeAutoAdvanceIndex(cueTimeline, songElapsedMs)
    if (targetIndex === index) return
    // A real cue (index >= 0) un-blanks; before the first cue / in gaps (index -1) stays blank.
    const targetBlank = targetIndex < 0
    // Update the local performer state AND the shared (cross-window) localStorage index/blank
    // via applyRemoteState — NOT applyCommand('setIndex'). computeNavigationState's setIndex
    // branch PRESERVES the current blank, so an applyCommand path would leave blank=true in
    // localStorage while the WS broadcast carries blank=false. The Projection window re-reads
    // index/blank from localStorage on every storage event, so it would read blank=true and
    // stay BLACK even though a cue is due — the Auto "audience stays black" bug. Writing the
    // same blank the broadcast carries keeps both windows consistent, exactly like manual Next.
    applyRemoteStateRef.current(targetIndex, targetBlank)
    sendCommandWithStateRef.current('setIndex', targetIndex, {
      currentIndex: targetIndex,
      blank: targetBlank,
    })
  }, [songElapsedMs, effectiveAdvanceMode, hasTimeline, showVideoPerformance, index])

  const languagesDisplay =
    effectiveSingingLang && effectiveLang
      ? `${effectiveSingingLang.toUpperCase()} → ${effectiveLang.toUpperCase()}`
      : effectiveLang
        ? effectiveLang.toUpperCase()
        : ''
  useEffect(() => {
    if (showArmedShell) return
    setTimerActionsVisible(false)
  }, [showArmedShell])

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
              Projection: {getProjectionStatusText(projectionOpen, isVideoMode ? effectiveScreenSize : null, isVideoMode ? effectiveDisplayMode : undefined)}
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
                <span className="control-setup-label">Lyrics display</span>
                <div className="control-setup-content">
                  {effectiveLang ? (
                    <span className="control-setup-value">{languagesDisplay}</span>
                  ) : null}
                </div>
                <div className="control-setup-buttons">
                  {!showVideoPerformance && showAdvanceModeToggle && (
                    <div className="control-setup-toggle-area">
                      <div className="ctrl-toggle-group">
                        <span className="ctrl-toggle-label">Transitions</span>
                        <div className="ctrl-segmented" role="group" aria-label="Lyric advance mode">
                          <button
                            type="button"
                            className={`ctrl-segment${effectiveAdvanceMode === 'manual' ? ' ctrl-segment--active' : ''}`}
                            aria-pressed={effectiveAdvanceMode === 'manual'}
                            onClick={() => setSelectedAdvanceMode('manual')}
                          >
                            Manual
                          </button>
                          <button
                            type="button"
                            className={`ctrl-segment${effectiveAdvanceMode === 'auto' ? ' ctrl-segment--active' : ''}${!autoAdvanceAvailable ? ' ctrl-segment--disabled' : ''}`}
                            aria-pressed={effectiveAdvanceMode === 'auto'}
                            disabled={!autoAdvanceAvailable}
                            title={advanceAutoDisabledReason ?? undefined}
                            onClick={() => {
                              if (autoAdvanceAvailable) {
                                setSelectedAdvanceMode('auto')
                              }
                            }}
                          >
                            Auto
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* P9: performed tempo. Only meaningful for a song that declares a tempo —
                      no tempo block means no pulse and no scaling, and no fallback BPM is
                      invented. This lives in the setup panel, which is not rendered once the
                      song is armed: that IS the "frozen once armed" guarantee, since changing
                      the scale mid-song would jump the current line under the performer. */}
                  {!showVideoPerformance && songTempo && (
                    <div className="control-setup-toggle-area">
                      <div className="ctrl-toggle-group">
                        <span className="ctrl-toggle-label">Performed tempo</span>
                        <div className="ctrl-performed-bpm">
                          <input
                            type="number"
                            className="ctrl-performed-bpm-input"
                            data-testid="performed-bpm-input"
                            aria-label="Performed tempo in BPM"
                            min="1"
                            step="0.01"
                            value={performedBpmField}
                            placeholder={declaredBpm !== undefined ? String(declaredBpm) : ''}
                            onChange={(e) => handlePerformedBpmChange(e.target.value)}
                          />
                          <span className="ctrl-performed-bpm-declared" data-testid="declared-bpm-label">
                            recorded at {declaredBpm}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToLanguages}>
                    Languages
                  </button>
                </div>
              </div>
              {window.electronAPI && (
                <div className="control-setup-section">
                  <span className="control-setup-label">Projection</span>
                  <div className="control-setup-content">
                    <span className="control-setup-value">
                      {getProjectionStatusText(projectionOpen, isVideoMode ? effectiveScreenSize : null, isVideoMode ? effectiveDisplayMode : undefined)}
                    </span>
                  </div>
                  <div className="control-setup-buttons">
                    {isVideoMode && (
                      <div className="control-setup-toggle-area">
                        <div className="ctrl-toggle-group">
                          <span className="ctrl-toggle-label">Videoclip</span>
                          <div className="ctrl-segmented" role="group" aria-label="Videoclip display mode">
                            <button
                              type="button"
                              className={`ctrl-segment${effectiveDisplayMode === 'none' ? ' ctrl-segment--active' : ''}`}
                              aria-label="No video"
                              aria-pressed={effectiveDisplayMode === 'none'}
                              onClick={() => handleSelectDisplayMode('none')}
                            >
                              None
                            </button>
                            <button
                              type="button"
                              className={`ctrl-segment${effectiveDisplayMode === 'small' ? ' ctrl-segment--active' : ''}`}
                              aria-label="Small screen"
                              aria-pressed={effectiveDisplayMode === 'small'}
                              onClick={() => handleSelectDisplayMode('small')}
                            >
                              Small
                            </button>
                            <button
                              type="button"
                              className={`ctrl-segment${effectiveDisplayMode === 'big' ? ' ctrl-segment--active' : ''}`}
                              aria-label="Big screen"
                              aria-pressed={effectiveDisplayMode === 'big'}
                              onClick={() => handleSelectDisplayMode('big')}
                            >
                              Big
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
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
            </div>
          </>
        )}
        {showArmedShell && showVideoPerformance && (
          <VideoPerformancePanel
            absolutePath={resolvedVideoPath}
            media={activeMedia!}
            timeline={currentLibrarySong!.timeline ?? []}
            leadIn={currentLibrarySong!.leadIn}
            lines={lines}
            singingLang={effectiveSingingLang}
            tempo={songTempo}
            onUnarm={handleUnarm}
            onSeek={sendSeek}
          />
        )}
        {showArmedShell && !showVideoPerformance && (
          <>
            <div className="control-performing-stage" data-testid="performing-content" style={{ position: 'relative' }}>
              {songTempo && (
                <div
                  className="control-beat-clock-wrap"
                  style={{
                    position: 'absolute',
                    bottom: '0.75rem',
                    left: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <BeatCircle tempo={songTempo} phase={beatPhase} />
                </div>
              )}
              {/* P6: the song is no longer driving itself — the performer has taken the wheel.
                  Must be readable at a glance, mid-song, under stage light. */}
              {manualOverrideTaken && (
                <div
                  className="control-manual-override-badge"
                  data-testid="manual-override-badge"
                  style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem' }}
                >
                  MANUAL
                </div>
              )}
              <div className="control-performing-stage-stack">
                <div className="control-performing-lyric-block">
                  {/* T2: in Auto, once Play is pressed the performer screen is black until the
                      first cue (mirrors the audience) — no notes, intro, or instruction. */}
                  <p className="control-lyric">
                    {autoPerformanceStarted && notStarted ? '' : displayText}
                  </p>
                  {!notStarted && (
                    <span
                      data-testid="control-next-preview"
                      className="control-next-preview"
                    >
                      {nextPreviewText}
                    </span>
                  )}
                  {notStarted && !autoPerformanceStarted && songIntro && (
                    <p className="control-song-intro">{songIntro}</p>
                  )}
                  {notStarted && !autoPerformanceStarted && (
                    <p className="control-state-instruction">
                      {isCueStartAuto
                        ? 'Press Next when ready to start the song'
                        : isAutoArmed
                          ? 'Press Play to start'
                          : manualPreStart
                            ? 'Press Start to begin the count-in'
                            : 'Press Next to reveal the first line'}
                    </p>
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

      {showArmedShell && !showVideoPerformance && (
        <footer className="control-bottom-bar">
          <div className="bottom-buttons">
            {isCueStartAuto ? (
              <>
                {/* P1: cue-start Auto (v2 timeline, no video) — no Play button and no
                    count-in; the first Next press (or a pedal press mapped to it) IS the
                    timeline's start cue, handled inside handleNext via startAtCue(). Manual
                    Next/Previous stay available throughout, before and after the cue, as the
                    override they already are elsewhere. Pause/Restart only make sense — and
                    only appear — once there is something to pause or restart. */}
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
                {autoPerformanceStarted && (
                  <>
                    {beatPlayState === 'paused' ? (
                      /* Not itself in the P1 acceptance list, but Pause with no way back would
                         be a dead end mid-performance — resuming reuses startBeatClock(),
                         which already special-cases playState === 'paused' before its
                         count-in branch, so it resumes correctly regardless of tempo. */
                      <button
                        type="button"
                        className="ctrl-btn ctrl-auto-play ctrl-arm"
                        onClick={startBeatClock}
                        aria-label="Resume"
                      >
                        Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ctrl-btn ctrl-auto-pause"
                        onClick={handleAutoPause}
                        disabled={beatPlayState !== 'playing'}
                        aria-label="Pause"
                      >
                        Pause
                      </button>
                    )}
                    <button
                      type="button"
                      className="ctrl-btn ctrl-auto-restart"
                      onClick={handleAutoRestart}
                      aria-label="Restart"
                    >
                      Restart
                    </button>
                  </>
                )}
              </>
            ) : isAutoArmed ? (
              <>
                {/* T2: Auto uses video-style transport — you don't reason in terms of
                    next/previous, the beat clock drives the cues. */}
                <button
                  type="button"
                  className={`ctrl-btn ctrl-auto-play${beatPlayState === 'idle' || beatPlayState === 'paused' ? ' ctrl-arm' : ''}`}
                  onClick={handleAutoPlay}
                  disabled={!(beatPlayState === 'idle' || beatPlayState === 'paused')}
                  aria-label="Play"
                >
                  Play
                </button>
                <button
                  type="button"
                  className="ctrl-btn ctrl-auto-pause"
                  onClick={handleAutoPause}
                  disabled={!(beatPlayState === 'count-in' || beatPlayState === 'playing')}
                  aria-label="Pause"
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="ctrl-btn ctrl-auto-restart"
                  onClick={handleAutoRestart}
                  aria-label="Restart"
                >
                  Restart
                </button>
              </>
            ) : (
              <>
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
                  disabled={nextDisabled || manualPreStart}
                >
                  Next
                </button>
                {manualPreStart ? (
                  /* R2: before the count-in, the third button is Start (relabelled Restart).
                     Pressing it runs the count-in a bar before the first lyric; Next stays
                     disabled until it does. Plain click — it's a forward, safe action. */
                  <button
                    type="button"
                    className="ctrl-btn ctrl-restart"
                    onClick={startBeatClock}
                    aria-label="Start"
                  >
                    Start
                  </button>
                ) : manualStartStep ? (
                  /* After Start, the same button becomes Restart, returning to the pre-Start
                     state (beat idle, index -1, button back to Start). Hold-to-confirm guards
                     against an accidental mid-song reset. */
                  <button
                    type="button"
                    className="ctrl-btn ctrl-restart"
                    onPointerDown={manualStartRestartHold.onPointerDown}
                    onPointerUp={manualStartRestartHold.onPointerUp}
                    onPointerLeave={manualStartRestartHold.onPointerLeave}
                  >
                    {manualStartRestartHold.isHolding ? 'Hold to confirm…' : 'Restart'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ctrl-btn ctrl-restart"
                    onPointerDown={restartHold.onPointerDown}
                    onPointerUp={restartHold.onPointerUp}
                    onPointerLeave={restartHold.onPointerLeave}
                  >
                    {restartHold.isHolding ? 'Hold to confirm…' : 'Restart'}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className={`ctrl-btn ${isEndOfSong ? 'ctrl-arm' : 'ctrl-unarm'}`}
              onClick={
                isEndOfSong && canUnarm
                  ? () => {
                      if (currentSongId) addPlayedSong(currentSongId)
                      handleUnarm()
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

  // Screen size broadcast from Control window — tracked for Prompt 4 display-format toggle.
  const [, setProjectionScreenSize] = useState<ScreenSize | null>(getBroadcastScreenSize)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_SCREEN_SIZE_BROADCAST || e.key === null) {
        setProjectionScreenSize(getBroadcastScreenSize())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Display mode broadcast from Control window — 3-way None/Small/Big toggle (Prompt 13).
  const [projectionDisplayMode, setProjectionDisplayMode] = useState<DisplayMode | null>(getBroadcastDisplayMode)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_DISPLAY_MODE_BROADCAST || e.key === null) {
        setProjectionDisplayMode(getBroadcastDisplayMode())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Auto blackout broadcast from Control window (T2). While active, the pre-first-cue index -1
  // state renders BLACK instead of the intro/title — the audience is dark during the count-in
  // and between/around cues in Auto mode (there is no video to show). No effect once a lyric
  // index (>= 0) is showing.
  const [performanceBlackout, setPerformanceBlackout] = useState(getAutoBlackout)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTO_BLACKOUT_KEY || e.key === null) {
        setPerformanceBlackout(getAutoBlackout())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Show logo on every mount; reveal intro only after the control fires an arm transition.
  // The arm action writes KEY_ARMED_BROADCAST to localStorage, which fires a cross-window
  // storage event that the projection can receive. This prevents leftover lyrics appearing
  // when the projection window is reopened mid-song.
  // The broadcast value is a changing nonce (not a constant '1') — see performanceState.ts —
  // so any non-null value written to this key means an arm just happened; unarm removes the
  // key (newValue === null), which correctly does NOT re-show the logo transition flag.
  const isArmed = index === -1 && lines.length > 0
  const [hasSeenArmedSinceMount, setHasSeenArmedSinceMount] = useState(false)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_ARMED_BROADCAST && e.newValue !== null) {
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
  const showIntroScreen =
    hasSeenArmedSinceMount && isArmed && !performanceBlackout && !!currentLibrarySong
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
  const activeMedia = currentLibrarySong?.media
  const isVideoMode = activeMedia?.type === 'video'
  const resolvedVideoPath = isVideoMode ? getMediaPath(activeMedia!.src) : null
  // Respect the display mode broadcast: 'none' means lyric screen, 'small'/'big' means video
  const effectiveProjectionDisplayMode: DisplayMode = projectionDisplayMode ?? getDefaultDisplayMode(isVideoMode)
  const showVideoProjection = isVideoMode && resolvedVideoPath && effectiveProjectionDisplayMode !== 'none'

  if (showVideoProjection) {
    return (
      <div
        className="projection-screen"
        style={{
          background: '#000',
          width: '100vw',
          height: '100vh',
          position: 'relative',
          margin: 0,
        }}
      >
        <VideoProjectionRegion
          absolutePath={resolvedVideoPath}
          media={activeMedia!}
          timeline={currentLibrarySong!.timeline ?? []}
          leadIn={currentLibrarySong!.leadIn}
          lines={lines}
          effectiveLang={effectiveLang}
          layout={layout}
          showIntroScreen={showIntroScreen}
          introTitle={currentLibrarySong!.title}
          introTranslatedTitle={
            effectiveLang !== singingLang
              ? currentLibrarySong!.title_translations?.[effectiveLang]
              : undefined
          }
          introTagline={currentLibrarySong!.intro?.[effectiveLang]}
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

  // Non-video path: centered full-screen layout (pre-regression behavior).
  // The animation-region/subtitle-band split is VIDEO-only (see showVideoProjection branch above).
  return (
    <div
      className="projection-screen"
      style={{
        background: '#000',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 0,
      }}
    >
      <img
        src="/chango-pepper-logo.png"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          height: '100vh',
          width: 'auto',
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5em',
        }}
      >
        <span
          className="projection-lyric"
          style={{ opacity: isVisible ? 1 : 0 }}
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
        <ThemeSwitcher />{/* THROWAWAY: restyle prototype */}
        <ManageSetlistsView />
      </>
    )
  if (hash === '#/songs')
    return (
      <>
        <ConcertSessionTimerRunner />
        <ThemeSwitcher />{/* THROWAWAY: restyle prototype */}
        <SongsView />
      </>
    )
  if (hash === '#/languages')
    return (
      <>
        <ConcertSessionTimerRunner />
        <ThemeSwitcher />{/* THROWAWAY: restyle prototype */}
        <LanguagesView />
      </>
    )
  return (
    <>
      <ConcertSessionTimerRunner />
      <ThemeSwitcher />{/* THROWAWAY: restyle prototype */}
      <ControlView />
    </>
  )
}

export default App
