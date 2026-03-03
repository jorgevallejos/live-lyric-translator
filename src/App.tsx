import { useSongNavigation } from './useSongNavigation'
import { parseSongJson, isSection, type LyricLine } from './songState'
import { useEffect, useState } from 'react'

function ControlView() {
  const {
    lines,
    index,
    currentItem,
    nextLyricLine,
    goNext,
    goPrev,
    loadLines,
  } = useSongNavigation()

  const openProjection = () => {
    const url = `${window.location.origin}${window.location.pathname || '/'}#/projection`
    window.open(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const items = parseSongJson(text)
        loadLines(items)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Invalid JSON')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrev])

  return (
    <>
      <h1>Live Lyric Translator</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Load JSON: <input type="file" accept=".json,application/json" onChange={handleFileChange} />
        </label>
      </div>

      {lines.length > 0 && (
        <p style={{ fontFamily: 'monospace', color: '#666' }}>
          {index + 1} / {lines.length}
        </p>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <button type="button" onClick={goPrev} disabled={lines.length === 0 || index <= 0}>
          Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={lines.length === 0 || index >= lines.length - 1}
          style={{ marginLeft: '0.5rem' }}
        >
          Next
        </button>
      </div>

      {currentItem ? (
        isSection(currentItem) ? (
          <div style={{ marginTop: '2rem' }}>
            <p style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>{currentItem.label}</p>
          </div>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{currentItem.es}</p>
            <p style={{ marginTop: '0.5rem', color: '#444' }}>{currentItem.tr}</p>
            {nextLyricLine && (
              <p style={{ marginTop: '1.5rem', fontSize: '0.95rem', color: '#666' }}>
                Next: {nextLyricLine.es}
              </p>
            )}
          </div>
        )
      ) : (
        <p style={{ color: '#666', marginTop: '1rem' }}>
          {lines.length === 0 ? 'Load a JSON file to start.' : '—'}
        </p>
      )}

      <button type="button" onClick={openProjection} style={{ marginTop: '1rem' }}>
        Open Projection
      </button>
    </>
  )
}

function ProjectionView() {
  const { currentItem } = useSongNavigation()
  const isSectionMarker = currentItem && isSection(currentItem)
  const translation =
    currentItem && !isSection(currentItem) ? (currentItem as LyricLine).tr : ''

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
      {!isSectionMarker && (
        <span
          style={{
            color: '#fff',
            fontSize: 'clamp(3rem, 12vw, 8rem)',
            fontWeight: 700,
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          {translation}
        </span>
      )}
    </div>
  )
}

function App() {
  const [isProjection, setIsProjection] = useState(
    () => window.location.hash === '#/projection'
  )
  useEffect(() => {
    const onHashChange = () => setIsProjection(window.location.hash === '#/projection')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (isProjection) {
    return <ProjectionView />
  }
  return <ControlView />
}

export default App
