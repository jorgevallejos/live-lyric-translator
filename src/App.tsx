import { useSubtitleTimer } from './useSubtitleTimer'
import { useEffect, useState } from 'react'

function ControlView() {
  const { running, t, activeLine, startPause, stop } = useSubtitleTimer()
  const openProjection = () => {
    const url = `${window.location.origin}${window.location.pathname || '/'}#/projection`
    window.open(url)
  }

  return (
    <>
      <h1>Live Lyric Translator</h1>
      <p style={{ fontFamily: 'monospace', fontSize: '1.5rem' }}>
        {t.toFixed(1)} s
      </p>
      <div style={{ marginBottom: '1rem' }}>
        <button type="button" onClick={startPause}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button type="button" onClick={stop} style={{ marginLeft: '0.5rem' }}>
          Stop
        </button>
      </div>
      {activeLine ? (
        <div style={{ marginTop: '1rem' }}>
          <p><strong>{activeLine.es}</strong></p>
          <p>{activeLine.tr}</p>
        </div>
      ) : (
        <p style={{ color: '#666', marginTop: '1rem' }}>—</p>
      )}
      <button type="button" onClick={openProjection} style={{ marginTop: '1rem' }}>
        Open Projection
      </button>
    </>
  )
}

function ProjectionView() {
  const { activeLine } = useSubtitleTimer()

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
        }}
      >
        {activeLine ? activeLine.tr : ''}
      </span>
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
