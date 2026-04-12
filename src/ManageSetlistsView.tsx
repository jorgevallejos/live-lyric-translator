import { useState } from 'react'
import {
  createEmptySetlist,
  deleteSetlist,
  getActiveSetlistId,
  getSetlists,
  renameSetlist,
  setActiveSetlistId,
  type Setlist,
} from './setlistStore'
import { resetLoadedSongState } from './songState'

export function ManageSetlistsView() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

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

  const handleRename = (sl: Setlist) => {
    const value = window.prompt('Setlist name:', sl.name)
    if (value === null) return
    if (!renameSetlist(sl.id, value)) {
      window.alert('Setlist name cannot be empty.')
      return
    }
    refresh()
  }

  const handleDelete = (sl: Setlist) => {
    if (!window.confirm(`Delete setlist "${sl.name}"? This cannot be undone.`)) return
    const wasActive = sl.id === getActiveSetlistId()
    deleteSetlist(sl.id)
    refresh()
    if (wasActive) {
      resetLoadedSongState()
      window.location.hash = '#/songs'
    }
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
              <li key={sl.id} className="manage-setlists-item">
                <div className="manage-setlists-item-inner">
                  <button
                    type="button"
                    className={`manage-setlists-row ${isActive ? 'manage-setlists-row-active' : ''}`}
                    onClick={() => selectSetlist(sl.id)}
                  >
                    {sl.name}
                    {isActive ? ' (active)' : ''}
                  </button>
                  <div className="manage-setlists-actions">
                    <button
                      type="button"
                      className="manage-setlists-action-btn"
                      aria-label={`Rename setlist ${sl.name}`}
                      onClick={() => handleRename(sl)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="manage-setlists-action-btn manage-setlists-delete-btn"
                      aria-label={`Delete setlist ${sl.name}`}
                      onClick={() => handleDelete(sl)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
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
