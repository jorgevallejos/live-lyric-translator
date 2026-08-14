import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { TimelineEntry, TimelineLeadIn } from './songState'
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
  addSongToSetlistInSnapshot,
  autoSelectFirstSongForActiveSetlist,
  appendEmptySetlistInSnapshot,
  areSetlistStoreSnapshotsEqual,
  cloneSetlistStoreSnapshot,
  deleteSetlistInSnapshot,
  deleteSongFromLibraryInSnapshot,
  getOrderedSongsForSetlistFromSnapshot,
  getSetlistNamesContainingSongInSnapshot,
  loadSetlistStore,
  patchSongMediaInSnapshot,
  patchSongTimelineInSnapshot,
  parseTimelineFromJsonText,
  removeSongFromSetlistInSnapshot,
  renameSetlistInSnapshot,
  reorderSongsInSetlistInSnapshot,
  saveSetlistStore,
  syncLoadedSongSessionWithSnapshot,
  applySequentialSongImportsFromJsonTexts,
  type LibrarySong,
  type Setlist,
  type SetlistStoreSnapshot,
} from './setlistStore'
import { setMediaPath, validateVideoForImport, type MediaValidationWarning } from './mediaPathStore'

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

function readFileAsUtf8(file: File): Promise<{ ok: true; text: string } | { ok: false }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      resolve({ ok: true, text })
    }
    reader.onerror = () => resolve({ ok: false })
    reader.readAsText(file, 'UTF-8')
  })
}

function formatSongImportBatchAlert(opts: {
  importedCount: number
  duplicatesSkipped: number
  invalidSkipped: number
  readFailures: number
}): string {
  const { importedCount, duplicatesSkipped, invalidSkipped, readFailures } = opts
  const lines: string[] = []
  lines.push(importedCount === 1 ? '1 song imported.' : `${importedCount} songs imported.`)
  if (duplicatesSkipped > 0) {
    lines.push(
      duplicatesSkipped === 1 ? '1 duplicate skipped.' : `${duplicatesSkipped} duplicates skipped.`
    )
  }
  if (invalidSkipped > 0) {
    lines.push(
      invalidSkipped === 1 ? '1 invalid file skipped.' : `${invalidSkipped} invalid files skipped.`
    )
  }
  if (readFailures > 0) {
    lines.push(readFailures === 1 ? 'Could not read 1 file.' : `Could not read ${readFailures} files.`)
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

function TimelineIcon() {
  return (
    <svg
      className="manage-setlists-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <text x="12" y="18" textAnchor="middle" fontSize="17" fontWeight="bold">A</text>
    </svg>
  )
}

function VideoLinkButton({ onLinkVideo, hasMedia, songTitle }: { onLinkVideo: () => void; hasMedia: boolean; songTitle: string }) {
  return (
    <button
      type="button"
      className={`manage-setlists-action-btn manage-setlists-icon-btn${hasMedia ? ' manage-setlists-icon-btn--linked' : ' manage-setlists-icon-btn--add'}`}
      aria-label={`Link video for ${songTitle}`}
      onClick={onLinkVideo}
    >
      <VideoCameraIcon />
      <span className="video-link-btn-badge" aria-hidden="true">{hasMedia ? '✓' : '+'}</span>
    </button>
  )
}

function TimelineImportButton({ onImportTimeline, hasTimeline, songTitle }: { onImportTimeline: () => void; hasTimeline: boolean; songTitle: string }) {
  return (
    <button
      type="button"
      className={`manage-setlists-action-btn manage-setlists-icon-btn${hasTimeline ? ' manage-setlists-icon-btn--linked' : ' manage-setlists-icon-btn--add'}`}
      aria-label={`Import timeline for ${songTitle}`}
      onClick={onImportTimeline}
    >
      <TimelineIcon />
      <span className="video-link-btn-badge" aria-hidden="true">{hasTimeline ? '✓' : '+'}</span>
    </button>
  )
}

type SortableSongRowProps = {
  song: LibrarySong
  setlistName: string
  onRemove: () => void
  onLinkVideo: () => void
  hasMedia: boolean
  onImportTimeline: () => void
  hasTimeline: boolean
}

function SortableSongRow({ song, setlistName, onRemove, onLinkVideo, hasMedia, onImportTimeline, hasTimeline }: SortableSongRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id, data: { source: 'setlist' as const } })

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
        <VideoLinkButton onLinkVideo={onLinkVideo} hasMedia={hasMedia} songTitle={song.title} />
        <TimelineImportButton onImportTimeline={onImportTimeline} hasTimeline={hasTimeline} songTitle={song.title} />
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
  onLinkVideoSong: (songId: string) => void
  onImportTimelineSong: (songId: string) => void
}

function SortableSongsInSetlist({ setlistName, songs, onRemoveSong, onLinkVideoSong, onImportTimelineSong }: SortableSongsInSetlistProps) {
  return (
    <ul className="manage-setlists-song-sublist" aria-label="Songs in setlist">
      {songs.map((song) => (
        <SortableSongRow
          key={song.id}
          song={song}
          setlistName={setlistName}
          onRemove={() => onRemoveSong(song.id)}
          onLinkVideo={() => onLinkVideoSong(song.id)}
          hasMedia={!!song.media}
          onImportTimeline={() => onImportTimelineSong(song.id)}
          hasTimeline={Array.isArray(song.timeline) && song.timeline.length > 0}
        />
      ))}
    </ul>
  )
}

type LibrarySongRowProps = {
  song: LibrarySong
  onAdd: () => void
  addDisabled: boolean
  addLabel: string
  onDelete: () => void
  onLinkVideo: () => void
  hasMedia: boolean
  onImportTimeline: () => void
  hasTimeline: boolean
}

function LibrarySongRow({ song, onAdd, addDisabled, addLabel, onDelete, onLinkVideo, hasMedia, onImportTimeline, hasTimeline }: LibrarySongRowProps) {
  return (
    <li className="manage-setlists-song-row">
      <span className="manage-setlists-song-title">{song.title}</span>
      <div className="manage-setlists-song-actions">
        <VideoLinkButton onLinkVideo={onLinkVideo} hasMedia={hasMedia} songTitle={song.title} />
        <TimelineImportButton onImportTimeline={onImportTimeline} hasTimeline={hasTimeline} songTitle={song.title} />
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
          aria-label={`Delete ${song.title} from library`}
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
  const importInputRef = useRef<HTMLInputElement>(null)
  const timelineInputRef = useRef<HTMLInputElement>(null)
  const pendingTimelineSongIdRef = useRef<string | null>(null)
  const renamingSetlistItemRef = useRef<HTMLLIElement | null>(null)
  const renamingIdRef = useRef<string | null>(null)
  renamingIdRef.current = renamingId
  const renameDraftRef = useRef(renameDraft)
  renameDraftRef.current = renameDraft

  const setlists = draft.setlists
  const activeId = draft.activeSetlistId
  const selectedSetlist = setlists.find((s) => s.id === activeId) ?? null
  const selectedSetlistSongs = selectedSetlist
    ? getOrderedSongsForSetlistFromSnapshot(draft, selectedSetlist.id)
    : []
  const selectedSetlistSongIds = new Set(selectedSetlist?.songIds ?? [])
  const visibleLibrarySongs = selectedSetlist
    ? draft.songLibrary.songs.filter((song) => !selectedSetlistSongIds.has(song.id))
    : draft.songLibrary.songs
  const selectedSongIds = selectedSetlistSongs.map((s) => s.id)

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

  const triggerImportSongPicker = () => {
    importInputRef.current?.click()
  }

  const handleImportSongFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const list = input.files
    if (!list?.length) return
    const files = Array.from(list)
    void (async () => {
      const texts: string[] = []
      let readFailures = 0
      for (const file of files) {
        const r = await readFileAsUtf8(file)
        if (r.ok) texts.push(r.text)
        else readFailures++
      }
      const batch = applySequentialSongImportsFromJsonTexts(draftRef.current, texts)
      window.alert(
        formatSongImportBatchAlert({
          importedCount: batch.importedCount,
          duplicatesSkipped: batch.duplicatesSkipped,
          invalidSkipped: batch.invalidSkipped,
          readFailures,
        })
      )
      setDraft(batch.snapshot)
      input.value = ''
      refresh()
    })()
  }

  const handleDelete = (sl: Setlist) => {
    if (renamingId === sl.id) cancelRename()
    setDraft((d) => deleteSetlistInSnapshot(d, sl.id) ?? d)
    refresh()
  }

  const handleLinkVideo = (songId: string) => {
    const api = window.electronAPI
    if (!api) return
    void (async () => {
      const chosen = await api.openFileDialog()
      if (!chosen) return
      const basename = chosen.split('/').pop() ?? chosen
      const warnings = validateVideoForImport(chosen)
      if (warnings.length) {
        window.alert(warnings.map(mediaWarningText).join('\n'))
      }
      setDraft((d) => {
        const next = patchSongMediaInSnapshot(d, songId, { type: 'video', src: basename }) ?? d
        saveSetlistStore(next)
        return next
      })
      setMediaPath(basename, chosen)
      refresh()
    })()
  }

  const handleImportTimeline = (songId: string) => {
    pendingTimelineSongIdRef.current = songId
    timelineInputRef.current?.click()
  }

  const handleTimelineFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    const songId = pendingTimelineSongIdRef.current
    pendingTimelineSongIdRef.current = null
    if (!file || !songId) return
    void (async () => {
      const r = await readFileAsUtf8(file)
      if (!r.ok) {
        window.alert('Could not read the timeline file.')
        return
      }
      let parsed: { timelineVersion: number; leadIn: TimelineLeadIn; entries: TimelineEntry[] }
      try {
        parsed = parseTimelineFromJsonText(r.text)
      } catch (err) {
        window.alert(`Invalid timeline file: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      setDraft((d) => {
        const next =
          patchSongTimelineInSnapshot(d, songId, parsed.entries, {
            timelineVersion: parsed.timelineVersion,
            leadIn: parsed.leadIn,
          }) ?? d
        saveSetlistStore(next)
        return next
      })
      input.value = ''
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
        <div className="manage-setlists-top-actions">
          <input
            ref={importInputRef}
            type="file"
            multiple
            accept=".json,application/json"
            className="manage-setlists-import-input-hidden"
            data-testid="import-song-input"
            aria-label="Choose one or more song JSON files to import"
            onChange={handleImportSongFiles}
          />
          <input
            ref={timelineInputRef}
            type="file"
            accept=".json,application/json"
            className="manage-setlists-import-input-hidden"
            data-testid="import-timeline-input"
            aria-label="Choose a timeline JSON file to import"
            onChange={handleTimelineFileSelected}
          />
        </div>
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
              ) : selectedSetlistSongs.length === 0 ? (
                <p className="manage-setlists-song-empty">No songs yet.</p>
              ) : (
                <SortableContext items={selectedSongIds} strategy={verticalListSortingStrategy}>
                  <SortableSongsInSetlist
                    setlistName={selectedSetlist.name}
                    songs={selectedSetlistSongs}
                    onRemoveSong={(songId) => handleRemoveSong(selectedSetlist.id, songId)}
                    onLinkVideoSong={handleLinkVideo}
                    onImportTimelineSong={handleImportTimeline}
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
                onClick={triggerImportSongPicker}
              >
                New song
              </button>
            </div>
            <div className="manage-setlists-panel" data-testid="manage-setlists-library-panel">
              <ul className="manage-setlists-song-sublist" aria-label="Library songs not in this setlist">
                {visibleLibrarySongs.length === 0 ? (
                  <li className="manage-setlists-song-empty">
                    {selectedSetlist
                      ? 'All library songs are in this setlist.'
                      : 'No songs in library.'}
                  </li>
                ) : (
                  visibleLibrarySongs.map((song) => (
                    <LibrarySongRow
                      key={song.id}
                      song={song}
                      onAdd={() => {
                        if (!selectedSetlist) return
                        handleAddSong(selectedSetlist.id, song.id)
                      }}
                      addDisabled={!selectedSetlist}
                      addLabel={
                        selectedSetlist
                          ? `Add ${song.title} to setlist ${selectedSetlist.name}`
                          : `Add ${song.title} to selected setlist`
                      }
                      onDelete={() => handleDeleteSongFromLibrary(song.id)}
                      onLinkVideo={() => handleLinkVideo(song.id)}
                      hasMedia={!!song.media}
                      onImportTimeline={() => handleImportTimeline(song.id)}
                      hasTimeline={Array.isArray(song.timeline) && song.timeline.length > 0}
                    />
                  ))
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
