import { useEffect, useRef, useState } from 'react'
import {
  addSongToSetlist,
  createEmptySetlist,
  deleteSetlist,
  getActiveSetlistId,
  getLibrarySongs,
  getOrderedSongsForSetlist,
  getSetlists,
  removeSongFromSetlist,
  renameSetlist,
  setActiveSetlistId,
  type Setlist,
} from './setlistStore'
import { getCurrentSongId, resetLoadedSongState } from './songState'

export function ManageSetlistsView() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [editingSetlistId, setEditingSetlistId] = useState<string | null>(null)
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
    setEditingSetlistId(null)
    setRenamingId(sl.id)
    setRenameDraft(sl.name)
  }

  const toggleEditSongs = (sl: Setlist) => {
    setEditingSetlistId((cur) => (cur === sl.id ? null : sl.id))
  }

  const handleAddSong = (setlistId: string, songId: string) => {
    addSongToSetlist(setlistId, songId)
    refresh()
  }

  const handleRemoveSong = (setlistId: string, songId: string) => {
    const shouldClearLoadedSession =
      setlistId === getActiveSetlistId() && songId === getCurrentSongId()
    if (!removeSongFromSetlist(setlistId, songId)) return
    if (shouldClearLoadedSession) resetLoadedSongState()
    refresh()
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
        <button
          type="button"
          className="songs-manage-setlists"
          onClick={handleCreateEmpty}
        >
          New setlist
        </button>
      </header>
      <main className="songs-body manage-setlists-body">
        <ul className="manage-setlists-list" aria-label="Setlists">
          {setlists.map((sl) => {
            const isActive = sl.id === activeId
            const isEditingSongs = editingSetlistId === sl.id && renamingId !== sl.id
            const orderedInSetlist = isEditingSongs ? getOrderedSongsForSetlist(sl.id) : []
            const idsInSetlist = isEditingSongs
              ? new Set(getSetlists().find((s) => s.id === sl.id)?.songIds ?? [])
              : new Set<string>()
            const availableFromLibrary = isEditingSongs
              ? getLibrarySongs().filter((s) => !idsInSetlist.has(s.id))
              : []
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
                          aria-expanded={editingSetlistId === sl.id}
                          aria-label={
                            editingSetlistId === sl.id
                              ? `Done editing songs for ${sl.name}`
                              : `Edit songs in setlist ${sl.name}`
                          }
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleEditSongs(sl)
                          }}
                        >
                          {editingSetlistId === sl.id ? 'Done' : 'Edit songs'}
                        </button>
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
                {isEditingSongs ? (
                  <div className="manage-setlists-song-editor">
                    <h2 className="manage-setlists-song-editor-title">Songs in this setlist</h2>
                    <ul className="manage-setlists-song-sublist" aria-label="Songs in setlist">
                      {orderedInSetlist.length === 0 ? (
                        <li className="manage-setlists-song-empty">No songs yet.</li>
                      ) : (
                        orderedInSetlist.map((song) => (
                          <li key={song.id} className="manage-setlists-song-row">
                            <span className="manage-setlists-song-title">{song.title}</span>
                            <button
                              type="button"
                              className="manage-setlists-action-btn manage-setlists-delete-btn"
                              aria-label={`Remove ${song.title} from setlist ${sl.name}`}
                              onClick={() => handleRemoveSong(sl.id, song.id)}
                            >
                              Remove
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    <h2 className="manage-setlists-song-editor-title">Add from library</h2>
                    <ul
                      className="manage-setlists-song-sublist"
                      aria-label="Library songs not in this setlist"
                    >
                      {availableFromLibrary.length === 0 ? (
                        <li className="manage-setlists-song-empty">
                          All library songs are in this setlist.
                        </li>
                      ) : (
                        availableFromLibrary.map((song) => (
                          <li key={song.id} className="manage-setlists-song-row">
                            <span className="manage-setlists-song-title">{song.title}</span>
                            <button
                              type="button"
                              className="manage-setlists-action-btn"
                              aria-label={`Add ${song.title} to setlist ${sl.name}`}
                              onClick={() => handleAddSong(sl.id, song.id)}
                            >
                              Add
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="manage-setlists-footer">
          <button type="button" className="ctrl-btn languages-confirm" onClick={goToSetlistScreen}>
            Confirm
          </button>
        </div>
      </main>
    </div>
  )
}
