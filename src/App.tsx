import { useSongNavigation } from './useSongNavigation'
import { parseSongJson, isSection, getSongIndex, setSongLines, setSongIndex, setBlank, setCurrentSongId, setProjectionLanguage, getEffectiveProjectionLanguage, getAvailableLanguages, getSongLines } from './songState'
import { useWebSocket } from './useWebSocket'
import { useEffect, useState, useRef } from 'react'
import { SONGS } from './songs'
import type { LyricLine, SongItem } from './songState'
import './control.css'

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

function ProjectionButton() {
  const [isOpen, setIsOpen] = useState(false)
  const api = window.electronAPI

  useEffect(() => {
    const electronAPI = window.electronAPI
    if (!electronAPI?.isProjectionOpen || !electronAPI?.onProjectionOpened || !electronAPI?.onProjectionClosed) return
    let cancelled = false
    electronAPI.isProjectionOpen().then((open) => {
      if (!cancelled) setIsOpen(open)
    })
    const unsubOpened = electronAPI.onProjectionOpened(() => setIsOpen(true))
    const unsubClosed = electronAPI.onProjectionClosed(() => setIsOpen(false))
    return () => {
      cancelled = true
      unsubOpened()
      unsubClosed()
    }
  }, [])

  if (!api) return null
  const handleClick = () => {
    if (isOpen) {
      api.closeProjection()
      setIsOpen(false)
    } else {
      api.openProjection()
      setIsOpen(true)
    }
  }
  return (
    <button type="button" className="ctrl-btn ctrl-projection" onClick={handleClick}>
      {isOpen ? 'Close Projection' : 'Open Projection'}
    </button>
  )
}

function ControlView() {
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
  const { sendCommandWithState } = useWebSocket({
    index,
    blank,
    applyRemoteState,
    applyCommand,
  })

  const handleNext = () => {
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
    goRestart()
    sendCommandWithState('setIndex', -1, { currentIndex: -1, blank: true })
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
  })
  handlersRef.current = {
    handleNext,
    handlePrev,
    handleRestart,
    handleBlankToggle,
    goToSongs,
    goToLanguages,
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { handleNext: next, handlePrev: prev, handleRestart: restart, handleBlankToggle: blankToggle, goToSongs: toSongs, goToLanguages: toLangs } = handlersRef.current
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        restart()
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
  const effectiveLang = getEffectiveProjectionLanguage(lines)
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
        </div>
      </header>

      <main className="control-center">
        <p className="control-lyric">{displayText}</p>
        {notStarted && (
          <p className="control-ready" aria-hidden>Ready</p>
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
            disabled={lines.length === 0 || index >= lines.length - 1}
          >
            Next
          </button>
          <button type="button" className="ctrl-btn ctrl-restart" onClick={handleRestart}>
            Restart
          </button>
          {window.electronAPI && (
            <ProjectionButton />
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
