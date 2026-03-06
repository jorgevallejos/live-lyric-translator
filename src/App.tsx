import type { PerformanceState } from './performanceState'
import { useSongNavigation } from './useSongNavigation'
import { parseSongJson, isSection, getSongIndex, setSongLines, setSongIndex, setBlank, setCurrentSongId, setProjectionLanguage, getEffectiveProjectionLanguage, getAvailableLanguages, getSongLines, getCurrentSongId } from './songState'
import { usePerformanceState } from './performanceState'
import { useWebSocket } from './useWebSocket'
import { useProjectionOpenState } from './useProjectionOpenState'
import { useHoldToConfirm } from './useHoldToConfirm'
import { useEffect, useState, useRef } from 'react'
import { SONGS } from './songs'
import type { LyricLine, SongItem } from './songState'
import './control.css'

const PERFORMANCE_STATE_LABELS: Record<PerformanceState, string> = {
  setup: 'Setup',
  ready: 'Ready to Arm',
  armed: 'Ready to Perform',
  performing: 'Performing',
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
  const hold = useHoldToConfirm(onToggle)

  if (!api) return null

  if (isOpen) {
    return (
      <button
        type="button"
        className="ctrl-btn ctrl-projection"
        onPointerDown={hold.onPointerDown}
        onPointerUp={hold.onPointerUp}
        onPointerLeave={hold.onPointerLeave}
      >
        {hold.isHolding ? 'Hold to confirm…' : 'Close Projection'}
      </button>
    )
  }

  return (
    <button type="button" className="ctrl-btn ctrl-projection" onClick={onToggle}>
      Open Projection
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
  const { state: performanceState, checks, arm, unarm } = usePerformanceState(
    projectionOpen,
    lines,
    effectiveLang,
    index
  )
  const { sendCommandWithState } = useWebSocket({
    index,
    blank,
    applyRemoteState,
    applyCommand,
  })

  const prevSongIdRef = useRef<string | undefined>(undefined)
  const prevLangRef = useRef<string | undefined>(undefined)
  const currentSongId = getCurrentSongId()

  useEffect(() => {
    const prevSong = prevSongIdRef.current
    const prevLang = prevLangRef.current
    const configChanged =
      prevSong !== undefined &&
      prevLang !== undefined &&
      (currentSongId !== prevSong || effectiveLang !== prevLang)
    const projectionClosed = !projectionOpen
    const shouldResetSession =
      (performanceState === 'armed' || performanceState === 'performing') &&
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
    performanceState,
    unarm,
    goRestart,
    sendCommandWithState,
  ])

  const handleNext = () => {
    if (performanceState === 'armed') unarm()
    goNext()
    sendCommandWithState('next', undefined, {
      currentIndex: getSongIndex(),
      blank,
    })
  }
  const handlePrev = () => {
    goPrev()
    sendCommandWithState('prev', undefined, { currentIndex: getSongIndex(), blank })
  }
  const handleRestart = () => {
    unarm()
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
    sendCommandWithState('blankToggle', undefined, { currentIndex: index, blank: !blank })
  }

  const goToSongs = () => {
    window.location.hash = '#/songs'
  }

  const goToLanguages = () => {
    window.location.hash = '#/languages'
  }

  const handlersRef = useRef({
    handleNext,
    handlePrev,
    handleRestart,
    handleBlankToggle,
    goToSongs,
    goToLanguages,
    arm,
    unarm,
    performanceState,
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
    performanceState,
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { handleNext: next, handlePrev: prev, handleRestart: restart, handleBlankToggle: blankToggle, goToSongs: toSongs, goToLanguages: toLangs, arm: doArm, unarm: doUnarm, performanceState: pState } = handlersRef.current
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        restart()
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        if (pState === 'ready') doArm()
        else if (pState === 'armed') doUnarm()
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
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const currentEs =
    currentItem && !isSection(currentItem) ? (currentItem as LyricLine).es : ''
  const notStarted = index === -1
  const displayText = notStarted
    ? ''
    : currentEs || (loadError ? loadError : '—')
  const lineCount = lines.length
  const positionText = notStarted
    ? ''
    : lineCount > 0
      ? `${index + 1} of ${lineCount}`
      : ''

  const nextDisabled =
    lines.length === 0 ||
    (performanceState !== 'armed' && performanceState !== 'performing') ||
    (performanceState === 'performing' && index >= lines.length - 1)
  const canArm = performanceState === 'ready'
  const canUnarm = performanceState === 'armed'

  const restartHold = useHoldToConfirm(handleRestart)

  return (
    <div className="control-screen">
      <header className="control-top-bar">
        <div className="top-bar-left">
          <button type="button" className="top-btn top-btn-songs" onClick={goToSongs}>
            Songs
          </button>
          <button type="button" className="top-btn top-btn-languages" onClick={goToLanguages}>
            Languages
          </button>
        </div>
        <div className="top-current">
          <div className="top-current-block">
            <span className="top-label">Current song</span>
            <span className="top-title">{currentSongTitle}</span>
          </div>
          <div className="top-current-block">
            <span className="top-label">Current language</span>
            <span className="top-title">{effectiveLang ? effectiveLang.toUpperCase() : '—'}</span>
          </div>
          <div className="top-current-block">
            <span className="top-label">Performance</span>
            <span className="top-title top-title-state">{PERFORMANCE_STATE_LABELS[performanceState]}</span>
          </div>
        </div>
      </header>

      <main className="control-center">
        <p className="control-lyric">{displayText}</p>
        {notStarted && (
          <div className="control-performance-state" aria-live="polite">
            <p className="control-state-label">{PERFORMANCE_STATE_LABELS[performanceState]}</p>
            {performanceState === 'armed' && (
              <p className="control-state-instruction">Press Next to reveal the first line</p>
            )}
            {performanceState === 'setup' && (
              <ul className="control-checks">
                <li className={checks.projectionOpen ? 'check-ok' : 'check-fail'}>
                  {checks.projectionOpen ? '✓' : '✗'} Projection window open
                </li>
                <li className={checks.translationAvailable ? 'check-ok' : 'check-fail'}>
                  {checks.translationAvailable ? '✓' : '✗'} Translation available
                </li>
                <li className={checks.phraseListLoaded ? 'check-ok' : 'check-fail'}>
                  {checks.phraseListLoaded ? '✓' : '✗'} Phrase list loaded
                </li>
              </ul>
            )}
            {canArm && (
              <button type="button" className="ctrl-btn ctrl-arm" onClick={arm}>
                Arm
              </button>
            )}
            {canUnarm && (
              <button type="button" className="ctrl-btn ctrl-unarm" onClick={unarm}>
                Unarm
              </button>
            )}
          </div>
        )}
        {positionText && <p className="control-position">{positionText}</p>}
      </main>

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
          {window.electronAPI && (
            <ProjectionButton isOpen={projectionOpen} onToggle={handleToggleProjection} />
          )}
        </div>
      </footer>
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

  const available = getAvailableLanguages(lines)

  const selectLanguage = (lang: string) => {
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
        {available.length === 0 ? (
          <p className="languages-empty">No song loaded. Select a song first to choose a projection language.</p>
        ) : (
          available.map((lang) => (
            <button
              key={lang}
              type="button"
              className="songs-song-btn languages-lang-btn"
              onClick={() => selectLanguage(lang)}
            >
              {lang.toUpperCase()}
            </button>
          ))
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
        style={{
          color: '#fff',
          fontSize: 'clamp(3rem, 12vw, 8rem)',
          fontWeight: 700,
          textAlign: 'center',
          padding: '1rem',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 500ms ease',
        }}
      >
        {displayedText}
      </span>
    </div>
  )
}

function App() {
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

  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  if (hash === '#/projection') return <ProjectionView />
  if (hash === '#/songs') return <SongsView />
  if (hash === '#/languages') return <LanguagesView />
  return <ControlView />
}

export default App
