import { useSongNavigation } from './useSongNavigation'
import { isSection, getSongIndex, getBlank, setSongLines, setSongIndex, setBlank, setCurrentSongId, setCurrentSongTitle, setProjectionLanguage, setSingingLanguage, getEffectiveProjectionLanguage, getEffectiveSingingLanguage, getAvailableLanguages, getAvailableSingingLanguages, getSongLines, getCurrentSongId, getLyricText, getSingingLanguage, getProjectionLanguage, getLastLyricIndex, isLyricLine } from './songState'
import { usePerformanceState } from './performanceState'
import { useWebSocket } from './useWebSocket'
import { useProjectionOpenState } from './useProjectionOpenState'
import { useHoldToConfirm, useRestartKeyHold } from './useHoldToConfirm'
import {
  getPerformanceControlState,
  tryArm,
  isNavigationEnabled,
  type PerformanceControlPrerequisites,
} from './performanceControlStateMachine'
import { useEffect, useState, useRef } from 'react'
import { ManageSetlistsView } from './ManageSetlistsView'
import {
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
import type { LyricLine, SongItem } from './songState'
import './control.css'

/** v0.5: labels from performance control state machine (SETUP | READY_TO_ARM | ARMED) */
const CONTROL_STATE_LABELS: Record<'SETUP' | 'READY_TO_ARM' | 'ARMED', string> = {
  SETUP: 'Performance: Setup',
  READY_TO_ARM: 'Performance: Ready to Arm',
  ARMED: 'Performance: Armed',
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
  const songNotes = currentSongId ? getLibrarySongById(currentSongId)?.notes ?? '' : ''
  const armed = performanceState === 'armed' || performanceState === 'performing'
  const {
    controlState,
    controlStateLabel,
    canArm,
    canUnarm,
    nextDisabled,
    handleArmClick,
    handleUnarmClick,
  } = usePerformanceControlViewState({
    currentSongId,
    lines,
    effectiveLang,
    effectiveSingingLang,
    projectionOpen,
    armed,
    arm,
    unarm,
    lineCount: lines.length,
    currentIndex: index,
  })
  const { sendCommandWithState } = useWebSocket({
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
      if (controlState === 'ARMED') {
        unarm()
      }
      goRestart()
      sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
    }

    prevUserConfigRef.current = next
  }, [controlState, unarm, goRestart, sendCommandWithState])

  const handleNext = () => {
    goNext()
    sendCommandWithState('next', undefined, {
      currentIndex: getSongIndex(),
      blank: getBlank(),
    })
  }
  const handlePrev = () => {
    goPrev()
    sendCommandWithState('prev', undefined, { currentIndex: getSongIndex(), blank: getBlank() })
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

  const goToSongs = () => {
    window.location.hash = '#/songs'
  }

  const goToLanguages = () => {
    window.location.hash = '#/languages'
  }

  const restartKeyHold = useRestartKeyHold(handleRestart)

  const handlersRef = useRef({
    handleNext,
    handlePrev,
    handleRestart,
    handleBlankToggle,
    goToSongs,
    goToLanguages,
    arm,
    unarm,
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
    arm,
    unarm,
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
  const unarmHold = useHoldToConfirm(handleUnarmClick)

  const isEndOfSong =
    controlState === 'ARMED' &&
    lines.length > 0 &&
    index >= 0 &&
    index < lines.length &&
    isLyricLine(lines[index]) &&
    index === getLastLyricIndex(lines)

  const showSetupPanel = controlState === 'SETUP' || controlState === 'READY_TO_ARM'
  const showArmedShell = controlState === 'ARMED'

  const languagesDisplay =
    effectiveSingingLang && effectiveLang
      ? `${effectiveSingingLang.toUpperCase()} → ${effectiveLang.toUpperCase()}`
      : effectiveLang
        ? effectiveLang.toUpperCase()
        : ''

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
                  <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToSongs}>
                    Setlist
                  </button>
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
                    onClick={handleArmClick}
                    disabled={!canArm}
                  >
                    Arm
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {showArmedShell && (
          <>
            <p className="control-lyric">{displayText}</p>
            {!notStarted && (
              <span
                data-testid="control-next-preview"
                className="control-next-preview"
              >
                {nextPreviewText}
              </span>
            )}
            {notStarted && (
              <p className="control-state-instruction">Press Next to reveal the first line</p>
            )}
          </>
        )}
      </main>

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
                      handleUnarmClick()
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
    setSongLines(lib.items)
    setSongIndex(-1)
    setBlank(true)
    setCurrentSongId(lib.id)
    setCurrentSongTitle(lib.title)
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
  const showContent = index >= 0 && !blank && !isSectionMarker

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
          style={{
            opacity: isVisible ? 1 : 0,
            fontFamily: 'Georgia, "Times New Roman", Times, serif',
            fontSize: '72px',
            lineHeight: 1.25,
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

  // On app launch (main window only), force a clean session so we start with "No song selected" and Ready state.
  useEffect(() => {
    if (window.location.hash === '#/projection') return
    if (sessionStorage.getItem('liveLyricLaunched')) return
    sessionStorage.setItem('liveLyricLaunched', '1')
    setCurrentSongId('')
    setSongLines([])
    setSongIndex(-1)
    setBlank(true)
  }, [])

  useEffect(() => {
    if (typeof initialHash === 'string') return
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [initialHash])

  if (!isProjectionRoute && songLibState === 'loading') {
    return (
      <div className="app-loading" data-testid="song-library-loading" aria-busy="true">
        Loading…
      </div>
    )
  }
  if (!isProjectionRoute && songLibState === 'error') {
    return (
      <div className="app-hydrate-error" role="alert" data-testid="song-library-error">
        <p>{songLibError}</p>
        <button type="button" onClick={() => setSongLibRetryKey((k) => k + 1)}>
          Retry
        </button>
      </div>
    )
  }

  if (hash === '#/projection') return <ProjectionView />
  if (hash === '#/songs/manage-setlists') return <ManageSetlistsView />
  if (hash === '#/songs') return <SongsView />
  if (hash === '#/languages') return <LanguagesView />
  return <ControlView />
}

export default App
