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
import {
  addSongRefToSnapshot,
  addSongToSetlistInSnapshot,
  autoSelectFirstSongForActiveSetlist,
  appendEmptySetlistInSnapshot,
  areSetlistStoreSnapshotsEqual,
  cloneSetlistStoreSnapshot,
  defaultReadSongFile,
  deleteSetlistInSnapshot,
  deleteSongFromLibraryInSnapshot,
  getLibraryEntries,
  getLibraryEntriesForSnapshot,
  getOrderedEntriesForSetlistFromSnapshot,
  getSetlistNamesContainingSongInSnapshot,
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
import { resolveMediaPath, setMediaPath, validateVideoForImport, type MediaValidationWarning } from './mediaPathStore'
import { publishSetlistToGig } from './gigSession'

const BACK_DISCARD_DRAFT_CONFIRM =
  'You have unconfirmed changes. If you go back now, they will be lost. Continue?'

function formatBlockedLibraryDeleteMessage(setlistNames: string[]): string {
  const lines = setlistNames.map((n) => `• ${n}`)
  return [
    'This song is still used in one or more setlists. Remove it from those setlists before deleting it from the app.',
    '',
    ...lines,
  ].join('\n')
}

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

function VideoCameraIcon() {
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
      <rect x="2" y="7" width="15" height="10" rx="2" ry="2" />
      <polygon points="17 9 22 6 22 18 17 15" />
    </svg>
  )
}

function mediaWarningText(w: MediaValidationWarning): string {
  if (w === 'mov-or-prores') return 'Warning: ProRes/MOV files are not web-playable. Convert to MP4/H.264.'
  return 'Warning: file is larger than 500 MB.'
}

/**
 * Points the app at the local copy of the video the **song file** names. It does not attach a
 * video to a song: `media.src` is the song's own field and is edited in the song file, not here.
 * Only the per-machine path is Pregonero's to remember (see `mediaPathStore`).
 */
function VideoLocateButton({
  onLocateVideo,
  isLocated,
  songTitle,
  declaresMedia,
}: {
  onLocateVideo: () => void
  isLocated: boolean
  songTitle: string
  declaresMedia: boolean
}) {
  if (!declaresMedia) return null
  return (
    <button
      type="button"
      className={`manage-setlists-action-btn manage-setlists-icon-btn${isLocated ? ' manage-setlists-icon-btn--linked' : ' manage-setlists-icon-btn--add'}`}
      aria-label={`Locate video for ${songTitle}`}
      onClick={onLocateVideo}
    >
      <VideoCameraIcon />
      <span className="video-link-btn-badge" aria-hidden="true">{isLocated ? '✓' : '+'}</span>
    </button>
  )
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
  onLocateVideo: () => void
  isVideoLocated: boolean
}

function SortableSongRow({ entry, setlistName, onRemove, onLocateVideo, isVideoLocated }: SortableSongRowProps) {
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
        <VideoLocateButton
          onLocateVideo={onLocateVideo}
          isLocated={isVideoLocated}
          songTitle={title}
          declaresMedia={!!entry.song?.media}
        />
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
  onLocateVideoSong: (songId: string) => void
  isVideoLocated: (entry: LibraryEntry) => boolean
}

function SortableSongsInSetlist({ setlistName, entries, onRemoveSong, onLocateVideoSong, isVideoLocated }: SortableSongsInSetlistProps) {
  return (
    <ul className="manage-setlists-song-sublist" aria-label="Songs in setlist">
      {entries.map((entry) => (
        <SortableSongRow
          key={entry.ref.id}
          entry={entry}
          setlistName={setlistName}
          onRemove={() => onRemoveSong(entry.ref.id)}
          onLocateVideo={() => onLocateVideoSong(entry.ref.id)}
          isVideoLocated={isVideoLocated(entry)}
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
  onDelete: () => void
  onLocateVideo: () => void
  isVideoLocated: boolean
}

function LibrarySongRow({ entry, onAdd, addDisabled, addLabel, onDelete, onLocateVideo, isVideoLocated }: LibrarySongRowProps) {
  const title = entryTitle(entry)
  return (
    <li className={`manage-setlists-song-row${entry.song ? '' : ' manage-setlists-song-row--unreadable'}`}>
      <span className="manage-setlists-song-title">{title}</span>
      {entry.song ? null : <UnreadableNote entry={entry} />}
      <div className="manage-setlists-song-actions">
        <VideoLocateButton
          onLocateVideo={onLocateVideo}
          isLocated={isVideoLocated}
          songTitle={title}
          declaresMedia={!!entry.song?.media}
        />
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn"
          aria-label={addLabel}
          onClick={onAdd}
          disabled={addDisabled}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
          aria-label={`Delete ${title} from library`}
          onClick={onDelete}
        >
          <TrashCanIcon />
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
  const libraryEntries = getLibraryEntriesForSnapshot(draft)
  const visibleLibraryEntries = selectedSetlist
    ? libraryEntries.filter((e) => !selectedSetlistSongIds.has(e.ref.id))
    : libraryEntries
  const selectedSongIds = selectedSetlistEntries.map((e) => e.ref.id)
  const isVideoLocated = (entry: LibraryEntry) =>
    entry.song?.media !== undefined && resolveMediaPath(entry.song.media.src) !== null

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

  const handleDeleteSongFromLibrary = (songId: string) => {
    const names = getSetlistNamesContainingSongInSnapshot(draftRef.current, songId)
    if (names.length > 0) {
      window.alert(formatBlockedLibraryDeleteMessage(names))
      return
    }
    setDraft((d) => deleteSongFromLibraryInSnapshot(d, songId) ?? d)
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
      const paths = await api.openSongFileDialog()
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

  /**
   * Records where this machine keeps the video the **song file** names. `media.src` belongs to
   * the song file and is not written here; only the local path is Pregonero's to remember.
   */
  const handleLocateVideo = (songId: string) => {
    const api = window.electronAPI
    if (!api) return
    const declared = getLibraryEntries().find((e) => e.ref.id === songId)?.song?.media
    if (!declared) return
    void (async () => {
      const chosen = await api.openFileDialog()
      if (!chosen) return
      const warnings = validateVideoForImport(chosen)
      if (warnings.length) {
        window.alert(warnings.map(mediaWarningText).join('\n'))
      }
      setMediaPath(declared.src, chosen)
      refresh()
    })()
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
                    onLocateVideoSong={handleLocateVideo}
                    isVideoLocated={isVideoLocated}
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
                        onDelete={() => handleDeleteSongFromLibrary(entry.ref.id)}
                        onLocateVideo={() => handleLocateVideo(entry.ref.id)}
                        isVideoLocated={isVideoLocated(entry)}
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
