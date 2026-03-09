import { useSongNavigation } from './useSongNavigation'
import { parseSongJson, isSection, getSongIndex, getBlank, setSongLines, setSongIndex, setBlank, setCurrentSongId, setProjectionLanguage, setSingingLanguage, getEffectiveProjectionLanguage, getEffectiveSingingLanguage, getAvailableLanguages, getAvailableSingingLanguages, getSongLines, getCurrentSongId } from './songState'
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
import { SONGS } from './songs'
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

  const prevSongIdRef = useRef<string | undefined>(undefined)
  const prevLangRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prevSong = prevSongIdRef.current
    const prevLang = prevLangRef.current
    const configChanged =
      prevSong !== undefined &&
      prevLang !== undefined &&
      (currentSongId !== prevSong || effectiveLang !== prevLang)
    const projectionClosed = !projectionOpen
    const shouldResetSession =
      controlState === 'ARMED' &&
      (configChanged || projectionClosed)

    if (shouldResetSession) {
      unarm()
      goRestart()
      sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
    }
    prevSongIdRef.current = currentSongId
    prevLangRef.current = effectiveLang
  }, [
    currentSongId,
    effectiveLang,
    projectionOpen,
    controlState,
    unarm,
    goRestart,
    sendCommandWithState,
  ])

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
    currentItem && !isSection(currentItem) ? (currentItem as LyricLine).es : ''
  const notStarted = index === -1
  const displayText = notStarted
    ? ''
    : currentEs || (loadError ? loadError : '—')

  const restartHold = useHoldToConfirm(handleRestart)
  const unarmHold = useHoldToConfirm(handleUnarmClick)

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
                    Song
                  </button>
                </div>
              </div>
              <div className="control-setup-section">
                <span className="control-setup-label">Languages</span>
                <div className="control-setup-content">
                  {effectiveLang ? (
                    <span className="control-setup-value">{languagesDisplay}</span>
                  ) : null}
                </div>
                <div className="control-setup-buttons">
                  <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToLanguages}>
                    Singing
                  </button>
                  <button type="button" className="ctrl-btn ctrl-setup-link" onClick={goToLanguages}>
                    Translation
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
              className="ctrl-btn ctrl-unarm"
              onPointerDown={canUnarm ? unarmHold.onPointerDown : undefined}
              onPointerUp={canUnarm ? unarmHold.onPointerUp : undefined}
              onPointerLeave={canUnarm ? unarmHold.onPointerLeave : undefined}
              disabled={!canUnarm}
              aria-label="Unarm (return to setup without clearing song, language, or projection)"
            >
              {unarmHold.isHolding ? 'Hold to confirm…' : 'Unarm'}
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

function SongsView() {
  const goBack = () => {
    window.location.hash = '#/'
  }

  const selectSong = async (id: string, path: string, title: string) => {
    try {
      const res = await fetch(path)
      if (!res.ok) throw new Error('Failed to load')
      const text = await res.text()
      const items = parseSongJson(text)
      setSongLines(items)
      setSongIndex(-1)
      setBlank(true)
      setCurrentSongId(id)
      window.location.hash = '#/'
    } catch {
      alert(`Could not load ${title}.`)
    }
  }

  return (
    <div className="songs-screen">
      <header className="songs-top-bar">
        <button type="button" className="songs-back" onClick={goBack}>
          Back
        </button>
        <h1 className="songs-title">Songs</h1>
      </header>
      <main className="songs-body">
        {SONGS.map((song) => (
          <button
            key={song.id}
            type="button"
            className="songs-song-btn"
            onClick={() => selectSong(song.id, song.path, song.title)}
          >
            {song.title}
          </button>
        ))}
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

  const selectSingingLanguage = (lang: string) => {
    setSingingLanguage(lang)
  }

  const selectTranslationLanguage = (lang: string) => {
    setProjectionLanguage(lang)
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
            <section className="languages-section" aria-label="Singing language">
              <h2 className="languages-section-title">Singing language</h2>
              <div className="languages-buttons">
                {availableSinging.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="songs-song-btn languages-lang-btn"
                    onClick={() => selectSingingLanguage(lang)}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </section>
            <section className="languages-section" aria-label="Translation language">
              <h2 className="languages-section-title">Translation language</h2>
              <div className="languages-buttons">
                {availableTranslation.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="songs-song-btn languages-lang-btn"
                    onClick={() => selectTranslationLanguage(lang)}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </section>
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
      ? ((currentItem as LyricLine).translations[effectiveLang] ?? '').trim() || ''
      : ''
  const showContent = index >= 0 && !blank && !isSectionMarker

  const [displayedText, setDisplayedText] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoHiddenKeyRef = useRef<string | null>(null)

  const activeKey = showContent ? `${index}:${translation}` : ''

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
  const AUTO_FADE_MS = 4000

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

    const nextText = translation ?? ''

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
  }, [showContent, translation, displayedText, activeKey])

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
  )
}

function App({ initialHash }: { initialHash?: string } = {}) {
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

  const [hash, setHash] = useState(() =>
    typeof initialHash === 'string' ? initialHash : window.location.hash
  )
  useEffect(() => {
    if (typeof initialHash === 'string') return
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [initialHash])
  if (hash === '#/projection') return <ProjectionView />
  if (hash === '#/songs') return <SongsView />
  if (hash === '#/languages') return <LanguagesView />
  return <ControlView />
}

export default App
