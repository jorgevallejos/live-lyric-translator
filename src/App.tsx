function App() {
  const isProjection = window.location.hash === '#/projection'

  if (isProjection) {
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
        <span style={{ color: '#fff', fontSize: '4rem', fontWeight: 700 }}>
          PROJECTION HELLO
        </span>
      </div>
    )
  }

  const openProjection = () => {
    const url = `${window.location.origin}${window.location.pathname || '/'}#/projection`
    window.open(url)
  }

  return (
    <>
      <h1>Hello Live Lyric Translator</h1>
      <button type="button" onClick={openProjection}>
        Open Projection
      </button>
    </>
  )
}

export default App
