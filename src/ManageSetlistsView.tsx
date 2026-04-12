import {
  createEmptySetlist,
  getActiveSetlistId,
  getSetlists,
  setActiveSetlistId,
} from './setlistStore'
import { resetLoadedSongState } from './songState'

export function ManageSetlistsView() {
  const setlists = getSetlists()
  const activeId = getActiveSetlistId()

  const goToSetlistScreen = () => {
    window.location.hash = '#/songs'
  }

  const selectSetlist = (id: string) => {
    if (id === activeId) {
      goToSetlistScreen()
      return
    }
    resetLoadedSongState()
    setActiveSetlistId(id)
    goToSetlistScreen()
  }

  const handleCreateEmpty = () => {
    resetLoadedSongState()
    createEmptySetlist()
    goToSetlistScreen()
  }

  return (
    <div
      className="songs-screen manage-setlists-screen"
      data-testid="manage-setlists-screen"
    >
      <header className="songs-top-bar">
        <button type="button" className="songs-back" onClick={goToSetlistScreen}>
          Back
        </button>
        <h1 className="songs-title">Manage setlists</h1>
      </header>
      <main className="songs-body manage-setlists-body">
        <ul className="manage-setlists-list" aria-label="Setlists">
          {setlists.map((sl) => {
            const isActive = sl.id === activeId
            return (
              <li key={sl.id}>
                <button
                  type="button"
                  className={`manage-setlists-row ${isActive ? 'manage-setlists-row-active' : ''}`}
                  onClick={() => selectSetlist(sl.id)}
                >
                  {sl.name}
                  {isActive ? ' (active)' : ''}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="manage-setlists-footer">
          <button type="button" className="ctrl-btn languages-confirm" onClick={handleCreateEmpty}>
            New setlist
          </button>
        </div>
      </main>
    </div>
  )
}
