import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
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
import { chooseSongFilePaths } from './platform'
import {
  addSongRefToSnapshot,
  addSongToSetlistInSnapshot,
  autoSelectFirstSongForActiveSetlist,
  appendEmptySetlistInSnapshot,
  areSetlistStoreSnapshotsEqual,
  cloneSetlistStoreSnapshot,
  defaultReadSongFile,
  deleteSetlistInSnapshot,
  getLibraryEntries,
  getLibraryEntriesForSnapshot,
  isInCatalogue,
  noteCatalogueAdoption,
  getOrderedEntriesForSetlistFromSnapshot,
  loadSetlistStore,
  removeSongFromSetlistInSnapshot,
  renameSetlistInSnapshot,
  reorderSongsInSetlistInSnapshot,
  resolveSongRef,
  saveSetlistStore,
  setLibraryEntries,
  songIdFromPath,
  songRefForChosenFile,
  syncLoadedSongSessionWithSnapshot,
  type LibraryEntry,
  type Setlist,
  type SetlistStoreSnapshot,
} from './setlistStore'
import { publishSetlistToGig } from './gigSession'
import { PencilIcon, TrashCanIcon } from './RowIcons'

const BACK_DISCARD_DRAFT_CONFIRM =
  'You have unconfirmed changes. If you go back now, they will be lost. Continue?'

/** The name to show for a library row: the song's title, or the file name when it could not be read. */
function entryTitle(entry: LibraryEntry): string {
  return entry.song?.title ?? songIdFromPath(entry.ref.path)
}

function formatAddSongBatchAlert(opts: { addedCount: number; duplicates: number; unreadable: number }): string {
  const { addedCount, duplicates, unreadable } = opts
  const lines: string[] = []
  lines.push(addedCount === 1 ? '1 song added.' : `${addedCount} songs added.`)
  if (duplicates > 0) {
    lines.push(duplicates === 1 ? '1 already in the library.' : `${duplicates} already in the library.`)
  }
  if (unreadable > 0) {
    lines.push(
      unreadable === 1
        ? '1 file could not be read. It was added anyway and shows as unreadable.'
        : `${unreadable} files could not be read. They were added anyway and show as unreadable.`
    )
  }
  return lines.join('\n')
}

/** The row for a reference whose file could not be read: the file is the fix, not the app. */
function UnreadableNote({ entry }: { entry: LibraryEntry }) {
  return (
    <span className="manage-setlists-song-unreadable" title={entry.error}>
      Could not read {entry.ref.path}
    </span>
  )
}

type SortableSongRowProps = {
  entry: LibraryEntry
  setlistName: string
  onRemove: () => void
}

function SortableSongRow({ entry, setlistName, onRemove }: SortableSongRowProps) {
  const title = entryTitle(entry)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.ref.id, data: { source: 'setlist' as const } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`manage-setlists-song-row${entry.song ? '' : ' manage-setlists-song-row--unreadable'}`}
      data-testid={`manage-setlist-song-row-${entry.ref.id}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="manage-setlists-drag-handle"
        aria-label={`Drag to reorder ${title} in setlist ${setlistName}`}
        {...listeners}
        {...attributes}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <span className="manage-setlists-song-title">{title}</span>
      {entry.song ? null : <UnreadableNote entry={entry} />}
      <div className="manage-setlists-song-actions">
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
          aria-label={`Remove ${title} from setlist ${setlistName}`}
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
  entries: LibraryEntry[]
  onRemoveSong: (songId: string) => void
}

function SortableSongsInSetlist({ setlistName, entries, onRemoveSong }: SortableSongsInSetlistProps) {
  return (
    <ul className="manage-setlists-song-sublist" aria-label="Songs in setlist">
      {entries.map((entry) => (
        <SortableSongRow
          key={entry.ref.id}
          entry={entry}
          setlistName={setlistName}
          onRemove={() => onRemoveSong(entry.ref.id)}
        />
      ))}
    </ul>
  )
}

type LibrarySongRowProps = {
  entry: LibraryEntry
  onAdd: () => void
  addDisabled: boolean
  addLabel: string
}

/**
 * **A library row has one action, and it is add-to-setlist.**
 *
 * It used to carry a trash can that removed the song from the library. **That control is gone, and
 * it is not coming back as a convenience** (2026-09-01):
 *
 * - **`songs/` is the source of truth and the library is a cache of it.** Hydration seeds a
 *   reference for every song file in the songs folder, so a row deleted here reappears on the next
 *   hydration. A control that silently undoes itself must not remain, looking functional.
 * - **A row vanishing while the file is still in the folder is the app disagreeing with the
 *   disk**, which is the failure this repo already refuses for an unreadable song: hiding it would
 *   hide the problem, and the fix is in `songs/`.
 * - **Retiring a song means moving the file out of `songs/`.** That is a decision about the
 *   catalogue, made in Finder, not a thing to hide inside one app.
 *
 * **Removing a song from a SETLIST is a different act and it stays.** That is gig-scoped and
 * durable: a setlist is an authored running order, the removal is stored in the snapshot, and
 * nothing on disk contradicts it. The two were one trash can apart on the same screen, which is
 * why the distinction is written here rather than assumed.
 */
function LibrarySongRow({ entry, onAdd, addDisabled, addLabel }: LibrarySongRowProps) {
  const title = entryTitle(entry)
  return (
    <li className={`manage-setlists-song-row${entry.song ? '' : ' manage-setlists-song-row--unreadable'}`}>
      <span className="manage-setlists-song-title">{title}</span>
      {entry.song ? null : <UnreadableNote entry={entry} />}
      <div className="manage-setlists-song-actions">
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn"
          aria-label={addLabel}
          onClick={onAdd}
          disabled={addDisabled}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </li>
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
  const [draft, setDraft] = useState<SetlistStoreSnapshot>(() => initialDraftFromStore())
  const entrySnapshotRef = useRef<SetlistStoreSnapshot | null>(null)
  if (entrySnapshotRef.current === null) {
    entrySnapshotRef.current = cloneSetlistStoreSnapshot(draft)
  }
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
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renamingSetlistItemRef = useRef<HTMLLIElement | null>(null)
  const renamingIdRef = useRef<string | null>(null)
  renamingIdRef.current = renamingId
  const renameDraftRef = useRef(renameDraft)
  renameDraftRef.current = renameDraft

  const setlists = draft.setlists
  const activeId = draft.activeSetlistId
  const selectedSetlist = setlists.find((s) => s.id === activeId) ?? null
  const selectedSetlistEntries = selectedSetlist
    ? getOrderedEntriesForSetlistFromSnapshot(draft, selectedSetlist.id)
    : []
  const selectedSetlistSongIds = new Set(selectedSetlist?.songIds ?? [])
  // **The library column is the catalogue** (Jorge, 2026-09-01: a song that disappears disappears
  // from everywhere it is offered). This column says *you can use this*, so a reference whose file
  // has left `song-performance/` is not in it — it was the known second surface still drawing the
  // whole stored library. The setlist column beside it is untouched: that is what was **recorded**,
  // it keeps its ids, and it shows what it cannot resolve.
  const libraryEntries = getLibraryEntriesForSnapshot(draft).filter((e) => isInCatalogue(e.ref.id))
  const visibleLibraryEntries = selectedSetlist
    ? libraryEntries.filter((e) => !selectedSetlistSongIds.has(e.ref.id))
    : libraryEntries
  const selectedSongIds = selectedSetlistEntries.map((e) => e.ref.id)

  useEffect(() => {
    if (!renamingId) return
    const el = renameInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [renamingId])

  useEffect(() => {
    if (!renamingId) return
    const onPointerDownCapture = (e: PointerEvent) => {
      const root = renamingSetlistItemRef.current
      if (!root) return
      const target = e.target
      if (!(target instanceof Node)) return
      if (root.contains(target)) return
      setRenamingId(null)
      setRenameDraft('')
    }
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [renamingId])

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
    // **This is where `gig.json` is written.** Pregonero is its only writer, and the running
    // order is authored here — so the write is an act, not a side effect of reading a folder. If
    // the file's order had been edited outside the app, that is recorded and shown on the gig
    // screen rather than replaced quietly.
    void publishSetlistToGig()
    if (priorActive !== snapshot.activeSetlistId) {
      autoSelectFirstSongForActiveSetlist(snapshot)
    } else {
      syncLoadedSongSessionWithSnapshot(snapshot)
    }
    goToSetlistScreen()
  }

  const discardAndGoBack = () => {
    const entry = entrySnapshotRef.current
    if (
      entry &&
      !areSetlistStoreSnapshotsEqual(draftRef.current, entry) &&
      !window.confirm(BACK_DISCARD_DRAFT_CONFIRM)
    ) {
      return
    }
    goToSetlistScreen()
  }

  const selectDraftActiveSetlist = (id: string) => {
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

  const cancelRename = () => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const handlePencilClick = (sl: Setlist) => {
    if (renamingId === sl.id) {
      cancelRename()
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

  /**
   * Adds song files to the library as references. Nothing is copied in: the path is stored, the
   * file is read to fill the cache, and a file that will not read is still added — as a visibly
   * broken row, which is the honest report and the one that can be fixed in `songs/`.
   */
  const handleAddSongs = () => {
    const api = window.electronAPI
    if (!api) {
      window.alert('Songs can only be added from the desktop app.')
      return
    }
    void (async () => {
      const paths = await chooseSongFilePaths()
      if (!paths.length) return
      let snapshot = draftRef.current
      let addedCount = 0
      let duplicates = 0
      let unreadable = 0
      const resolved: LibraryEntry[] = []
      for (const path of paths) {
        const ref = songRefForChosenFile(path)
        const next = addSongRefToSnapshot(snapshot, ref)
        if (!next) {
          duplicates++
          continue
        }
        snapshot = next
        addedCount++
        // A file picked out of `song-performance/` is in the catalogue the moment it is added,
        // without waiting for the folder to be listed again — otherwise the column that now
        // filters on the catalogue would swallow the song just added to it.
        noteCatalogueAdoption(ref)
        const entry = await resolveSongRef(ref, defaultReadSongFile)
        if (!entry.song) unreadable++
        resolved.push(entry)
      }
      setLibraryEntries([...getLibraryEntries(), ...resolved])
      window.alert(formatAddSongBatchAlert({ addedCount, duplicates, unreadable }))
      setDraft(snapshot)
      refresh()
    })()
  }

  const handleDelete = (sl: Setlist) => {
    if (renamingId === sl.id) cancelRename()
    setDraft((d) => deleteSetlistInSnapshot(d, sl.id) ?? d)
    refresh()
  }

  const handleReorderInSetlist = (setlistId: string, oldIndex: number, newIndex: number) => {
    setDraft((d) => reorderSongsInSetlistInSnapshot(d, setlistId, oldIndex, newIndex) ?? d)
    refresh()
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !selectedSetlist) return
    const source = active.data.current?.source
    if (source !== 'setlist' || active.id === over.id) return
    const oldIndex = selectedSongIds.indexOf(String(active.id))
    const newIndex = selectedSongIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    handleReorderInSetlist(selectedSetlist.id, oldIndex, newIndex)
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
      </header>
      <main className="songs-body manage-setlists-body">
        <section className="manage-setlists-column manage-setlists-column-setlists" aria-label="Setlists">
          <div className="manage-setlists-column-header">
            <h2 className="manage-setlists-song-editor-title">SETLISTS</h2>
            <button type="button" className="songs-manage-setlists" onClick={handleCreateEmpty}>
              New setlist
            </button>
          </div>
          <ul className="manage-setlists-list" aria-label="Setlists">
            {setlists.map((sl) => {
              const isActive = sl.id === activeId
              return (
                <li
                  key={sl.id}
                  className="manage-setlists-item"
                  ref={renamingId === sl.id ? renamingSetlistItemRef : undefined}
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
                        aria-label={isActive ? `Active setlist ${sl.name}` : `Select setlist ${sl.name}`}
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
                </li>
              )
            })}
          </ul>
        </section>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <section className="manage-setlists-column" aria-label="Setlist songs">
            <div className="manage-setlists-column-header">
              <h2 className="manage-setlists-song-editor-title">SETLIST SONGS</h2>
              <div className="manage-setlists-column-header-spacer" aria-hidden="true" />
            </div>
            <div
              className={`manage-setlists-song-editor manage-setlists-panel ${selectedSetlist ? 'manage-setlists-song-editor-active' : 'manage-setlists-song-editor-inactive'}`}
              data-testid="manage-setlists-song-editor"
            >
              {!selectedSetlist ? (
                <p className="manage-setlists-song-empty">Select a setlist to edit songs.</p>
              ) : selectedSetlistEntries.length === 0 ? (
                <p className="manage-setlists-song-empty">No songs yet.</p>
              ) : (
                <SortableContext items={selectedSongIds} strategy={verticalListSortingStrategy}>
                  <SortableSongsInSetlist
                    setlistName={selectedSetlist.name}
                    entries={selectedSetlistEntries}
                    onRemoveSong={(songId) => handleRemoveSong(selectedSetlist.id, songId)}
                  />
                </SortableContext>
              )}
            </div>
          </section>
          <section className="manage-setlists-column" aria-label="Song library">
            <div className="manage-setlists-column-header">
              <h2 className="manage-setlists-song-editor-title">SONG LIBRARY</h2>
              <button
                type="button"
                className="songs-manage-setlists"
                onClick={handleAddSongs}
              >
                New song
              </button>
            </div>
            <div className="manage-setlists-panel" data-testid="manage-setlists-library-panel">
              <ul className="manage-setlists-song-sublist" aria-label="Library songs not in this setlist">
                {visibleLibraryEntries.length === 0 ? (
                  <li className="manage-setlists-song-empty">
                    {selectedSetlist
                      ? 'All library songs are in this setlist.'
                      : 'No songs in library.'}
                  </li>
                ) : (
                  visibleLibraryEntries.map((entry) => {
                    const title = entryTitle(entry)
                    return (
                      <LibrarySongRow
                        key={entry.ref.id}
                        entry={entry}
                        onAdd={() => {
                          if (!selectedSetlist) return
                          handleAddSong(selectedSetlist.id, entry.ref.id)
                        }}
                        addDisabled={!selectedSetlist}
                        addLabel={
                          selectedSetlist
                            ? `Add ${title} to setlist ${selectedSetlist.name}`
                            : `Add ${title} to selected setlist`
                        }
                      />
                    )
                  })
                )}
              </ul>
            </div>
          </section>
        </DndContext>
        <div className="manage-setlists-footer">
          <button type="button" className="ctrl-btn languages-confirm" onClick={confirmDraft}>
            Confirm
          </button>
        </div>
      </main>
    </div>
  )
}
