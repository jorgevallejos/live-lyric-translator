import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
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
  addSongToSetlistInSnapshot,
  appendEmptySetlistInSnapshot,
  cloneSetlistStoreSnapshot,
  deleteSetlistInSnapshot,
  deleteSongFromLibraryInSnapshot,
  getOrderedSongsForSetlistFromSnapshot,
  loadSetlistStore,
  removeSongFromSetlistInSnapshot,
  renameSetlistInSnapshot,
  reorderSongsInSetlistInSnapshot,
  saveSetlistStore,
  syncLoadedSongSessionWithSnapshot,
  tryAppendImportedSongFromJsonText,
  type LibrarySong,
  type Setlist,
  type SetlistStoreSnapshot,
} from './setlistStore'
import { resetLoadedSongState } from './songState'

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

function PencilIcon() {
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
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
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
  setlistName: string
  songs: LibrarySong[]
  onRemoveSong: (songId: string) => void
  onReorder: (oldIndex: number, newIndex: number) => void
}

function SortableSongsInSetlist({
  setlistName,
  songs,
  onRemoveSong,
  onReorder,
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
    onReorder(oldIndex, newIndex)
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

function initialDraftFromStore(): SetlistStoreSnapshot {
  const snap = loadSetlistStore()
  if (!snap) {
    throw new Error('Song library is not ready. Manage setlists requires a hydrated setlist store.')
  }
  return cloneSetlistStoreSnapshot(snap)
}

declare global {
  interface Window {
    /** Vitest only: apply the same snapshot reorder the drag handler uses (jsdom lacks reliable DnD). */
    __patchManageSetlistsDraft?: (fn: (prev: SetlistStoreSnapshot) => SetlistStoreSnapshot) => void
  }
}

export function ManageSetlistsView() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)
  const [draft, setDraft] = useState<SetlistStoreSnapshot>(initialDraftFromStore)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return
    window.__patchManageSetlistsDraft = (fn) => {
      setDraft((prev) => fn(prev))
      refresh()
    }
    return () => {
      delete window.__patchManageSetlistsDraft
    }
  }, [])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [editingSetlistId, setEditingSetlistId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const editingSetlistItemRef = useRef<HTMLLIElement | null>(null)
  const renamingIdRef = useRef<string | null>(null)
  renamingIdRef.current = renamingId
  const renameDraftRef = useRef(renameDraft)
  renameDraftRef.current = renameDraft

  const setlists = draft.setlists
  const activeId = draft.activeSetlistId

  useEffect(() => {
    if (!renamingId) return
    const el = renameInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renamingId])

  useEffect(() => {
    if (!editingSetlistId) return
    const onPointerDownCapture = (e: PointerEvent) => {
      const root = editingSetlistItemRef.current
      if (!root) return
      const target = e.target
      if (!(target instanceof Node)) return
      if (root.contains(target)) return
      setRenamingId(null)
      setRenameDraft('')
      setEditingSetlistId(null)
    }
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [editingSetlistId])

  const goToSetlistScreen = () => {
    window.location.hash = '#/songs'
  }

  const confirmDraft = () => {
    let snapshot = draftRef.current
    const rid = renamingIdRef.current
    if (rid) {
      const trimmed = renameDraftRef.current.trim()
      if (!trimmed) {
        window.alert('Setlist name cannot be empty.')
        return
      }
      const next = renameSetlistInSnapshot(snapshot, rid, trimmed)
      if (!next) {
        window.alert('Setlist name cannot be empty.')
        return
      }
      snapshot = next
      setDraft(next)
      setRenamingId(null)
      setRenameDraft('')
    }
    const priorActive = loadSetlistStore()?.activeSetlistId ?? ''
    saveSetlistStore(snapshot)
    if (priorActive !== snapshot.activeSetlistId) {
      resetLoadedSongState()
    } else {
      syncLoadedSongSessionWithSnapshot(snapshot)
    }
    goToSetlistScreen()
  }

  const discardAndGoBack = () => {
    goToSetlistScreen()
  }

  const selectDraftActiveSetlist = (id: string) => {
    setEditingSetlistId(null)
    setRenamingId(null)
    setRenameDraft('')
    setDraft((d) => ({ ...d, activeSetlistId: id }))
    refresh()
  }

  const handleCreateEmpty = () => {
    setDraft((d) => appendEmptySetlistInSnapshot(d).snapshot)
    refresh()
  }

  const startRename = (sl: Setlist) => {
    setEditingSetlistId(sl.id)
    setRenamingId(sl.id)
    setRenameDraft(sl.name)
  }

  const handleAddSong = (setlistId: string, songId: string) => {
    setDraft((d) => addSongToSetlistInSnapshot(d, setlistId, songId) ?? d)
    refresh()
  }

  const handleRemoveSong = (setlistId: string, songId: string) => {
    setDraft((d) => removeSongFromSetlistInSnapshot(d, setlistId, songId) ?? d)
    refresh()
  }

  const handleDeleteSongFromLibrary = (songId: string) => {
    if (!window.confirm(DELETE_SONG_FROM_APP_CONFIRM)) return
    setDraft((d) => deleteSongFromLibraryInSnapshot(d, songId) ?? d)
    refresh()
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const handlePencilClick = (sl: Setlist) => {
    if (editingSetlistId === sl.id) {
      cancelRename()
      setEditingSetlistId(null)
      return
    }
    startRename(sl)
  }

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim()
    if (!trimmed) {
      window.alert('Setlist name cannot be empty.')
      return
    }
    const next = renameSetlistInSnapshot(draftRef.current, id, trimmed)
    if (!next) {
      window.alert('Setlist name cannot be empty.')
      return
    }
    setDraft(next)
    cancelRename()
    refresh()
  }

  const handleRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(id)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
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
      setDraft((d) => {
        const result = tryAppendImportedSongFromJsonText(d, text)
        if (!result.ok) {
          window.alert(result.error)
          return d
        }
        window.alert(`Imported "${result.song.title}".`)
        return result.snapshot
      })
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
    if (renamingId === sl.id) cancelRename()
    if (editingSetlistId === sl.id) setEditingSetlistId(null)
    setDraft((d) => deleteSetlistInSnapshot(d, sl.id) ?? d)
    refresh()
  }

  const handleReorderInSetlist = (setlistId: string, oldIndex: number, newIndex: number) => {
    setDraft((d) => reorderSongsInSetlistInSnapshot(d, setlistId, oldIndex, newIndex) ?? d)
    refresh()
  }

  return (
    <div
      className="songs-screen manage-setlists-screen"
      data-testid="manage-setlists-screen"
    >
      <header className="songs-top-bar">
        <button type="button" className="songs-back" onClick={discardAndGoBack}>
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
            New song
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
            const isEditingSongs = editingSetlistId === sl.id
            const orderedInSetlist = isEditingSongs
              ? getOrderedSongsForSetlistFromSnapshot(draft, sl.id)
              : []
            const idsInSetlist = isEditingSongs
              ? new Set(draft.setlists.find((s) => s.id === sl.id)?.songIds ?? [])
              : new Set<string>()
            const availableFromLibrary = isEditingSongs
              ? draft.songLibrary.songs.filter((s) => !idsInSetlist.has(s.id))
              : []
            return (
              <li
                key={sl.id}
                className="manage-setlists-item"
                ref={editingSetlistId === sl.id ? editingSetlistItemRef : undefined}
              >
                <div
                  className="manage-setlists-item-inner"
                  data-testid={`manage-setlists-setlist-row-${sl.id}`}
                >
                  {renamingId === sl.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      className={`manage-setlists-rename-input manage-setlists-rename-input-inline ${isActive ? 'ctrl-arm' : ''}`}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      aria-label="Setlist name"
                      onKeyDown={(e) => handleRenameKeyDown(e, sl.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`manage-setlists-row manage-setlists-row-name ${isActive ? 'ctrl-arm' : ''}`}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={
                        isActive ? `Active setlist ${sl.name}` : `Select setlist ${sl.name}`
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isActive) {
                          selectDraftActiveSetlist(sl.id)
                        }
                      }}
                    >
                      {sl.name}
                    </button>
                  )}
                  <div className="manage-setlists-actions">
                    <button
                      type="button"
                      className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-edit-songs-btn"
                      aria-expanded={editingSetlistId === sl.id}
                      aria-label={`Edit songs in setlist ${sl.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePencilClick(sl)
                      }}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
                      aria-label={`Delete setlist ${sl.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(sl)
                      }}
                    >
                      <TrashCanIcon />
                    </button>
                  </div>
                </div>
                {isEditingSongs ? (
                  <div
                    className="manage-setlists-song-editor"
                    data-testid="manage-setlists-song-editor"
                  >
                    <h2 className="manage-setlists-song-editor-title">Songs in this setlist</h2>
                    {orderedInSetlist.length === 0 ? (
                      <p className="manage-setlists-song-empty">No songs yet.</p>
                    ) : (
                      <SortableSongsInSetlist
                        setlistName={sl.name}
                        songs={orderedInSetlist}
                        onRemoveSong={(songId) => handleRemoveSong(sl.id, songId)}
                        onReorder={(oldI, newI) => handleReorderInSetlist(sl.id, oldI, newI)}
                      />
                    )}
                    <h2 className="manage-setlists-song-editor-title">Songs in app</h2>
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
          <button type="button" className="ctrl-btn languages-confirm" onClick={confirmDraft}>
            Confirm
          </button>
        </div>
      </main>
    </div>
  )
}
