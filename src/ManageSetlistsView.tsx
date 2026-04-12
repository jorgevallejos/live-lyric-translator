import { useEffect, useRef, useState } from 'react'
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
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const setlists = getSetlists()
  const activeId = getActiveSetlistId()

  useEffect(() => {
    if (!renamingId) return
    const el = renameInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renamingId])

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

  const startRename = (sl: Setlist) => {
    setRenamingId(sl.id)
    setRenameDraft(sl.name)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim()
    if (!trimmed) {
      window.alert('Setlist name cannot be empty.')
      return
    }
    if (!renameSetlist(id, trimmed)) {
      window.alert('Setlist name cannot be empty.')
      return
    }
    cancelRename()
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
                  {renamingId === sl.id ? (
                    <div className="manage-setlists-rename-editor">
                      <input
                        ref={renameInputRef}
                        type="text"
                        className="manage-setlists-rename-input"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        aria-label="Setlist name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRename(sl.id)
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelRename()
                          }
                        }}
                      />
                      <div className="manage-setlists-rename-actions">
                        <button
                          type="button"
                          className="manage-setlists-action-btn"
                          aria-label="Save setlist name"
                          onClick={() => commitRename(sl.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="manage-setlists-action-btn"
                          aria-label="Cancel rename"
                          onClick={cancelRename}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                          onClick={(e) => {
                            e.stopPropagation()
                            startRename(sl)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="manage-setlists-action-btn manage-setlists-delete-btn"
                          aria-label={`Delete setlist ${sl.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(sl)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
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
