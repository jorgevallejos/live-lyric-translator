import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addSongToSetlist,
  createEmptySetlist,
  deleteSetlist,
  deleteSongFromLibrary,
  getActiveSetlistId,
  getLibrarySongs,
  getOrderedSongsForSetlist,
  getSetlists,
  importSongFromJsonText,
  removeSongFromSetlist,
  reorderSongsInSetlist,
  renameSetlist,
  setActiveSetlistId,
  type LibrarySong,
  type Setlist,
} from './setlistStore'
import { getCurrentSongId, resetLoadedSongState } from './songState'

const DELETE_SONG_FROM_APP_CONFIRM =
  'Delete this song from the app? This cannot be undone.'

function TrashCanIcon() {
  return (
    <svg
      className="manage-setlists-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

type SortableSongRowProps = {
  song: LibrarySong
  setlistName: string
  onRemove: () => void
}

function SortableSongRow({ song, setlistName, onRemove }: SortableSongRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="manage-setlists-song-row"
      data-testid={`manage-setlist-song-row-${song.id}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="manage-setlists-drag-handle"
        aria-label={`Drag to reorder ${song.title} in setlist ${setlistName}`}
        {...listeners}
        {...attributes}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <span className="manage-setlists-song-title">{song.title}</span>
      <div className="manage-setlists-song-actions">
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
          aria-label={`Remove ${song.title} from setlist ${setlistName}`}
          onClick={onRemove}
        >
          <span aria-hidden="true">-</span>
        </button>
      </div>
    </li>
  )
}

type SortableSongsInSetlistProps = {
  setlistId: string
  setlistName: string
  songs: LibrarySong[]
  onRemoveSong: (songId: string) => void
  onOrderPersisted: () => void
}

function SortableSongsInSetlist({
  setlistId,
  setlistName,
  songs,
  onRemoveSong,
  onOrderPersisted,
}: SortableSongsInSetlistProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const ids = songs.map((s) => s.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    if (reorderSongsInSetlist(setlistId, oldIndex, newIndex)) onOrderPersisted()
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="manage-setlists-song-sublist" aria-label="Songs in setlist">
          {songs.map((song) => (
            <SortableSongRow
              key={song.id}
              song={song}
              setlistName={setlistName}
              onRemove={() => onRemoveSong(song.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

export function ManageSetlistsView() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [editingSetlistId, setEditingSetlistId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  const handleDeleteSongFromLibrary = (songId: string) => {
    if (!window.confirm(DELETE_SONG_FROM_APP_CONFIRM)) return
    if (!deleteSongFromLibrary(songId)) return
    if (songId === getCurrentSongId()) resetLoadedSongState()
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

  const triggerImportSongPicker = () => {
    importInputRef.current?.click()
  }

  const handleImportSongFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const result = importSongFromJsonText(text)
      if (!result.ok) {
        window.alert(result.error)
      } else {
        window.alert(`Imported "${result.song.title}".`)
      }
      input.value = ''
      refresh()
    }
    reader.onerror = () => {
      window.alert('Could not read the selected file.')
      input.value = ''
    }
    reader.readAsText(file, 'UTF-8')
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
        <div className="manage-setlists-top-actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="manage-setlists-import-input-hidden"
            data-testid="import-song-input"
            aria-label="Choose a song JSON file to import"
            onChange={handleImportSongFile}
          />
          <button
            type="button"
            className="songs-manage-setlists"
            onClick={triggerImportSongPicker}
          >
            Import song
          </button>
          <button
            type="button"
            className="songs-manage-setlists"
            onClick={handleCreateEmpty}
          >
            New setlist
          </button>
        </div>
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
                    {orderedInSetlist.length === 0 ? (
                      <p className="manage-setlists-song-empty">No songs yet.</p>
                    ) : (
                      <SortableSongsInSetlist
                        setlistId={sl.id}
                        setlistName={sl.name}
                        songs={orderedInSetlist}
                        onRemoveSong={(songId) => handleRemoveSong(sl.id, songId)}
                        onOrderPersisted={refresh}
                      />
                    )}
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
                            <div className="manage-setlists-song-actions">
                              <button
                                type="button"
                                className="manage-setlists-action-btn manage-setlists-icon-btn"
                                aria-label={`Add ${song.title} to setlist ${sl.name}`}
                                onClick={() => handleAddSong(sl.id, song.id)}
                              >
                                <span aria-hidden="true">+</span>
                              </button>
                              <button
                                type="button"
                                className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
                                aria-label={`Delete ${song.title} from library`}
                                onClick={() => handleDeleteSongFromLibrary(song.id)}
                              >
                                <TrashCanIcon />
                              </button>
                            </div>
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
