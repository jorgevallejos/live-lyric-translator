import { useCallback, useEffect, useState } from 'react'
import { chooseGigFolder, closeGig, openGigFolder, refreshGigReadiness } from './gigSession'
import { getRememberedGigFolder } from './gigFolderStore'
import { forgetGig, getGigList, replaceGigPath } from './gigListStore'
import {
  ensureSongLibraryHydrated,
  catalogueWasRead,
  getCatalogueEntries,
  getEntriesNotInCatalogue,
  getUnreadableCatalogueEntries,
  adoptSongFile,
  type LibraryEntry,
} from './setlistStore'
import { newlyVanished, recordVanishedAnnounced } from './vanishedSongs'
import { unreadableFolders, unreadableSongs } from './launchAnnouncements'
import { getGigsFolder, getSongFilesFolder, getSongsFolder, resolveSongPath } from './contentFolders'
import { hasLyricLines } from './songState'
import {
  chooseGigFolderPath,
  folderReadable,
  hasGigFolderAccess,
  canRunBombista,
  listSongsFolder,
  runBombista,
} from './platform'
import { joinPath } from './paths'
import { SongSubflow } from './SongSubflow'
import { SONG_INPUT_RULE } from './SongDoors'
import { GatedAction } from './GatedAction'

/**
 * **Setup home: gigs and songs, side by side, both in full.**
 *
 * The control view is the stage surface and keeps one button, which leaves the stage and lands
 * here. **Songs and gigs are peers, one level below it** — not a fork, and not songs hidden behind
 * a "manage songs" button. A screen whose only content is two buttons is a signpost rather than a
 * place, and every gig ever set up would pay a stop there; putting songs behind a button instead
 * hangs the long-lived thing off the ephemeral one, when gigs come and go and songs last for
 * years. **Landing on both lists shows the two facts that decide whether tonight works.**
 *
 * **Neither list truncates.** The screen scrolls instead. **The narrow-width constraint does not
 * apply here**: setup is desk work done hours ahead, on a real screen, and only the control view
 * has to survive an iPad on a stage.
 *
 * **`Folders` is not on this screen's stage-side origin any more.** Where songs and media live on
 * this machine is configuration rather than content, so it moved to preferences, which this screen
 * links to.
 *
 * **It holds the list of gigs, the list of songs, and the means to create or import either.
 * Nothing else** (Jorge, 2026-09-02, walking the screen). It was correct and read like a document:
 * two columns of prose with lists in them. Four things follow, and they are the whole of the
 * round.
 *
 * - **No explanatory prose, in either column.** The ownership sentences went with it — *everything
 *   inside a song file is Bombista's*, *Forget is Pregonero forgetting where a gig was*. Both are
 *   true and both are internal detail from where the user stands; they live in the docs.
 * - **The two halves are separated in the first-run screen's vocabulary** — two equal columns with
 *   a hard rule between them, each headed by its name in the large caps that screen uses. Two
 *   topics that are not the same topic do not share an undivided field.
 * - **Each list is a frame that is always there, empty or not, spanning the screen.** The frame is
 *   the operational surface and its contents are what change; an empty one says `No gigs yet.` or
 *   `No songs yet.` and nothing more, because the buttons above it already say what to do.
 * - **`New` and `Import` are siblings at the top of the column.** The heading says which noun, so
 *   the buttons do not repeat it, and importing a gig stopped being a footnote under the empty
 *   state. **Songs has no `Import`** — raised, and deferred by Jorge on 2026-09-02, because what
 *   importing a song means when the list *is* the folder is an open question.
 *
 * **It is called `Backstage`** (2026-09-02, walking `v0.30.0`). It names the moment rather than the
 * machine: the room you are in before the show. **The rule under the title stays here** — it
 * separates the navigation from the content, and this screen has navigation. The kickoff screen,
 * which lost its rule, is the exception, and whether the two converge is left for later.
 *
 * **A folder that cannot be read is a popup, on the same rule as an unreadable file.** It is a
 * condition made outside the tools, so it is reported in a dialog rather than in the page. While it
 * holds, **every button in that half is disabled and the frame carries the one line saying why** —
 * disabled controls with nothing explaining them are the shape `GatedAction` exists to forbid, and
 * one line in the frame is that explanation without repeating it under every button. **`No songs
 * yet.` is never shown when the app failed to look**, because it would claim the folder is empty.
 *
 * **The gig list stores paths and never readiness.** Each row's delta is computed on read — the
 * fifth rendering of the one readiness function — and it lands in the next round. **Until then a
 * row shows no verdict at all rather than a stale one**, which is the honest intermediate state:
 * a wrong "Ready" is worse than no word.
 */

/**
 * **The one line each half carries while its folder cannot be read**, and the ids the disabled
 * buttons point at.
 *
 * It sits where the empty-state line sits, because it is the answer to the same question — *what is
 * in this frame* — given honestly when the app could not find out. It doubles as the reason for the
 * disabled buttons above it: one sentence per half, rather than the same sentence repeated under
 * every control it blocks.
 */
const SONGS_FOLDER_LINE = 'Songs folder cannot be read. Set it in Preferences.'
const GIGS_FOLDER_LINE = 'Gigs folder cannot be read. Set it in Preferences.'
const SONGS_FRAME_LINE_ID = 'setup-songs-folder-line'
const GIGS_FRAME_LINE_ID = 'setup-gigs-folder-line'

function basename(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0)
  return parts[parts.length - 1] ?? path
}

function GigRow({
  path,
  open,
  busy,
  onOpen,
  onForget,
  onLocate,
}: {
  path: string
  open: boolean
  busy: boolean
  onOpen: () => void
  onForget: () => void
  onLocate: () => void
}) {
  return (
    <li className="setup-home-row" data-testid={`setup-gig-row-${basename(path)}`}>
      <span className="setup-home-row-name">{basename(path)}</span>
      {open && (
        <span className="setup-home-row-badge" data-testid="setup-gig-open">
          Open
        </span>
      )}
      <span className="setup-home-row-path">{path}</span>
      <div className="setup-home-row-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          disabled={busy}
          data-testid={`setup-gig-open-${basename(path)}`}
          onClick={onOpen}
        >
          {open ? 'Setup' : 'Open'}
        </button>
        {/* **Locate, not re-add.** A gig folder that moved is the same gig, so its row keeps its
            place rather than reappearing at the front with a dead row left behind. */}
        <button type="button" className="ctrl-btn ctrl-setup-link" disabled={busy} onClick={onLocate}>
          Locate…
        </button>
        {/* Forgetting is Pregonero forgetting where a gig was. The folder is untouched. */}
        <button type="button" className="ctrl-btn ctrl-setup-link" disabled={busy} onClick={onForget}>
          Forget
        </button>
      </div>
    </li>
  )
}

function SongRow({ entry, expanded, onToggle }: { entry: LibraryEntry; expanded: boolean; onToggle: () => void }) {
  const title = entry.song?.title ?? entry.ref.id
  return (
    <li className="setup-home-row" data-testid={`setup-song-row-${entry.ref.id}`}>
      <button
        type="button"
        className="setup-home-row-open"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="setup-home-row-name">{title}</span>
      </button>
      {/* **No mark for a file that will not read, because such a file is not a row here at all.**
          It is named once in a popup and then dropped — see `UnreadableSongsPopup`. */}
      {expanded && (
        <div className="setup-home-row-body">
          <SongSubflow
            songId={entry.ref.id}
            songPath={resolveSongPath(entry.ref.path)}
            skeleton={entry.song !== undefined && !hasLyricLines(entry.song)}
          />
        </div>
      )}
    </li>
  )
}

/**
 * **New song, and it does not stop at the skeleton** (2026-09-01).
 *
 * `bombista new` writes a legal song file with no timing into `<songs>/song-performance`, under the
 * canonical name — **the user never picks a path**. Bombista makes that folder if it is not there,
 * which is the only thing that ever creates it: first run points at a catalogue and creates nothing. That is the honest state for a song that is
 * not recorded yet, and the reference is taken into the library straight away, so the song is in
 * the list from that moment. There is still no status, no badge and no completion label: whether
 * it can go into tonight's setlist is asked at the moment a surface draws it.
 *
 * **Then it continues straight into the song door on the song it just made.** Before this, the
 * button stopped at the skeleton and the door opened from a *row* — so a walk that starts from
 * nothing, holding a lyrics file and a recording and no JSON, found no row to click and the one
 * button on the screen asked for neither file. **Two doors, and the visible one was not the one
 * that does the work.**
 *
 * **The two-step underneath survives, and it has to.** The skeleton is what supplies `artist`,
 * `notes` and `title_translations`; a `.txt` carries none of the three and `bombista validate`
 * requires all of them. What changed is that both halves are one flow with one button, not that
 * the first half went away — `bombista new`'s no-audio branch is still exactly what runs, and a
 * song can still be created and left.
 *
 * **The door it continues into is the door**, reached by opening the new song's row. Routing into
 * it rather than reimplementing it is the point: a second implementation is how the two would
 * drift back apart.
 */
function NewSong({
  onCreated,
  blockedBy,
  describedBy,
}: {
  onCreated: (songId: string) => void
  /** The half's own block — a songs folder that cannot be read — which outranks every other. */
  blockedBy: string | null
  /** Where that reason is already written: the line in the frame below. */
  describedBy: string
}) {
  const [open, setOpen] = useState(false)
  const [songId, setSongId] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const songsFolder = getSongFilesFolder()
  const hosted = canRunBombista()

  const id = songId.trim()
  const legal = id.length > 0 && !id.includes('/') && !id.includes('\\')

  const create = () => {
    if (!legal || songsFolder === null) return
    setBusy(true)
    setProblem(null)
    void (async () => {
      const target = joinPath(songsFolder, `${id}.json`)
      const result = await runBombista('new', [id, '-o', target])
      if (result.status !== 'ok') {
        setProblem(result.output || 'bombista new did not write a file.')
        setBusy(false)
        return
      }
      await adoptSongFile(target)
      void refreshGigReadiness()
      setBusy(false)
      setSongId('')
      setOpen(false)
      onCreated(id)
    })()
  }

  // **The precondition never removes the action.** It disables it and says why — see
  // `GatedAction`. This form used to replace Create with a paragraph, and the walk that found it
  // stopped here reading a correct sentence as a wall.
  const cannotCreate =
    blockedBy !== null
      ? blockedBy
      : songsFolder === null
      ? 'There is no songs folder yet, so there is nowhere for a song to land.'
      : !hosted
        ? 'bombista cannot be run from here. Run bombista new in a terminal — it is fully usable on its own — and come back; Pregonero re-reads the files when you return.'
        : !legal
          ? 'Give it a name first. It becomes the file’s name and the song’s id.'
          : null

  // **Every button in a blocked half is disabled**, this one included — the reason is the line in
  // the frame below, which it points at rather than restating.
  if (!open) {
    return (
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid="setup-new-song"
        disabled={blockedBy !== null}
        title={blockedBy ?? undefined}
        aria-describedby={blockedBy !== null ? describedBy : undefined}
        onClick={() => setOpen(true)}
      >
        New
      </button>
    )
  }

  return (
    <div className="setup-home-new" data-testid="setup-new-song-form">
      <p className="gig-hint">{SONG_INPUT_RULE}</p>
      {songsFolder === null && (
        <p className="setup-song-problem" data-testid="setup-new-song-no-folder">
          Set the songs folder in preferences.
        </p>
      )}
      {(
        <>
          <label className="setup-home-field">
            <span>Name it</span>
            <input
              type="text"
              value={songId}
              // **A shape, never a plausible instance.** This said `hasta-calmar-el-alma` — a real
              // id out of the catalogue — and on 2026-08-31 it was read as a name already typed,
              // with Create disabled beside it saying "give it a name first". A placeholder that
              // could be an answer is indistinguishable from one.
              placeholder="lowercase-with-hyphens"
              data-testid="setup-new-song-id"
              onChange={(e) => setSongId(e.target.value)}
            />
          </label>
          <p className="gig-hint">
            The file’s name, and the song’s id. It lands in your catalogue’s{' '}
            <code>song-performance</code> folder as{' '}
            <code>{legal ? `${id}.json` : '<name>.json'}</code> — you never pick a path, because a
            song is played at many gigs and there is only ever one copy of it.
          </p>
          <div className="gig-actions">
            <GatedAction
              site="setup-new-song-create"
              label="Create"
              blockedBy={cannotCreate}
              busy={busy}
              onClick={create}
              remedy={
                songsFolder === null ? (
                  <button
                    type="button"
                    className="setup-home-row-open"
                    data-testid="setup-new-song-to-preferences"
                    onClick={() => {
                      window.location.hash = '#/preferences'
                    }}
                  >
                    Open preferences
                  </button>
                ) : undefined
              }
            />
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setProblem(null)
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {problem !== null && (
        <p className="setup-song-problem" data-testid="setup-new-song-problem">
          {problem}
        </p>
      )}
    </div>
  )
}

/**
 * **The songs that have gone, named, once, on the arrival where it is discovered.**
 *
 * **A popup, and this is Jorge's call (2026-09-01)** — it replaces the standing line this report
 * used to carry above the list. The reasoning is that *the files were removed* is an **event** and
 * *these files are absent* is a **state**: only the first is worth interrupting for, and a line
 * that reprinted itself on every arrival was reporting the second. `vanishedSongs.ts` is what
 * keeps the difference.
 *
 * **It is not decoration.** A catalogue on a drive that is not mounted would otherwise empty the
 * Songs list in silence — a confident wrong answer, invisible unless you already knew how many
 * songs you had.
 *
 * **It names the songs and does no more than that.** No repair to offer, nothing to decide, no
 * button that forgets them: the references are kept, and they come back the moment the folder lists
 * their files again.
 */
function VanishedSongsPopup({ songs, onDismiss }: { songs: string[]; onDismiss: () => void }) {
  if (songs.length === 0) return null
  return (
    <div className="ctrl-timeline-save-overlay" data-testid="setup-songs-gone-popup">
      <div
        className="ctrl-timeline-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Songs no longer in your catalogue"
      >
        <p className="ctrl-timeline-save-message">
          {songs.length === 1
            ? 'One song is no longer in your catalogue:'
            : `${songs.length} songs are no longer in your catalogue:`}
        </p>
        <ul className="setup-songs-gone-list" data-testid="setup-songs-gone-list">
          {songs.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <div className="ctrl-timeline-save-actions">
          <button type="button" className="ctrl-btn" onClick={onDismiss}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * **A song file that will not read is named once, in a popup, and then dropped** (Jorge,
 * 2026-09-02).
 *
 * A file that will not parse is a file somebody changed **outside** Pregonero. That is an outside
 * problem: reported once in a dialog, and after the dialog is closed the app ignores it. **The row
 * is gone** — it was listed and marked broken until this round, and a row for a song that cannot be
 * put in a setlist or projected is a row that does nothing except accuse. It is not in the song
 * list, so it cannot reach a gig, which is the one consequence worth stating.
 *
 * **It names the file rather than the song**, because the title inside may be the unreadable part.
 * **It carries the validator's own reason**, which is the difference between knowing something is
 * wrong and knowing what is wrong. **It says nothing about repairing it**: Pregonero cannot know
 * whether the file is repairable at all, and an earlier draft that sent the person to Bombista was
 * assuming a cause.
 *
 * **Once per launch, not once ever** — nothing tells the app the file was repaired. See
 * `launchAnnouncements.ts` for why that record is in memory where the vanished one is in storage.
 */
function UnreadableSongsPopup({
  files,
  onClose,
}: {
  files: { file: string; reason: string }[]
  onClose: () => void
}) {
  if (files.length === 0) return null
  return (
    <div className="ctrl-timeline-save-overlay" data-testid="setup-songs-unreadable-popup">
      <div
        className="ctrl-timeline-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Song files that will not read"
      >
        <p className="ctrl-timeline-save-message" data-testid="setup-songs-unreadable-title">
          {files.length === 1
            ? 'One song file will not read'
            : `${files.length} song files will not read`}
        </p>
        <ul className="setup-songs-gone-list" data-testid="setup-songs-unreadable-list">
          {files.map(({ file, reason }) => (
            <li key={file}>
              <code>{file}</code>:{' '}
              <span className="setup-songs-unreadable-reason">{reason}</span>
            </li>
          ))}
        </ul>
        {/* **The plural has its own sentence** (2026-09-02). The singular one shipped under a
            plural title on the walk, saying *the file* over a list of two. */}
        <p className="ctrl-timeline-save-message" data-testid="setup-songs-unreadable-note">
          {files.length === 1
            ? 'The file is untouched and stays where it is. It is not in Pregonero’s song list, so it cannot be added to a gig.'
            : 'The files are untouched and stay where they are. They are not in Pregonero’s song list, so they cannot be added to a gig.'}
        </p>
        <div className="ctrl-timeline-save-actions">
          <button type="button" className="ctrl-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * **A folder that cannot be read is a popup too** (Jorge, 2026-09-02).
 *
 * Same rule as the unreadable file, for the same reason: the folder was moved, renamed or
 * unplugged **outside** the tools, so it is an event to be told about once rather than a state to
 * be lived with in the page. What outlives the dialog is the half's own disabled buttons and the
 * one line in its frame — the standing condition, said once, where it changes what you can do.
 *
 * **It names the folder and the path**, because *the songs folder* is a role and the path is the
 * thing that moved. **It names Preferences**, which is where the answer is changed — the one place
 * a person can act on this, and the difference between a report and a dead end.
 *
 * **It does not carry the errno.** `ENOENT: no such file or directory, scandir '/Volumes/…'` says
 * the same thing three times in a language that is not the reader's, and unlike a validator's
 * verdict on a song file it distinguishes nothing the reader can act on: moved, renamed and
 * unplugged all take the same next step.
 */
function UnreadableFolderPopup({
  half,
  path,
  onClose,
}: {
  half: 'songs' | 'gigs'
  path: string
  onClose: () => void
}) {
  return (
    <div className="ctrl-timeline-save-overlay" data-testid={`setup-${half}-folder-popup`}>
      <div
        className="ctrl-timeline-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`The ${half} folder cannot be read`}
      >
        <p className="ctrl-timeline-save-message" data-testid={`setup-${half}-folder-popup-title`}>
          The {half} folder cannot be read
        </p>
        <p className="setup-folder-popup-path" data-testid={`setup-${half}-folder-popup-path`}>
          {path}
        </p>
        <p className="ctrl-timeline-save-message">
          It may have been moved or renamed, or it may be on a drive that is not connected. You can
          point Pregonero at a different folder in Preferences.
        </p>
        <div className="ctrl-timeline-save-actions">
          <button type="button" className="ctrl-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * **What is waiting to be said, in the order it is said.**
 *
 * Three things can be news on one arrival — a folder that will not read, songs that have gone, song
 * files that will not read — and two overlays on one z-index is one dialog hiding another. They are
 * separate events about separate things, so they are a queue and not a merge: the folder first,
 * because if a folder could not be read nothing else on that half is trustworthy, then what left,
 * then what will not parse.
 */
type Announcement =
  | { key: string; kind: 'folder'; half: 'songs' | 'gigs'; path: string }
  | { key: string; kind: 'vanished'; songs: string[] }
  | { key: string; kind: 'unreadable'; files: { file: string; reason: string }[] }

export function SetupHomeView() {
  const [gigs, setGigs] = useState<string[]>(getGigList)
  // **The Songs list is the catalogue, not the library.** Arriving re-reads the folder and this is
  // what that read said; a reference the folder did not list is in `gone`, never in a row, and a
  // file that will not read is in the popup, never in a row either.
  const [songs, setSongs] = useState<LibraryEntry[]>(getCatalogueEntries)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // **The standing condition, per half.** True for as long as the folder refuses; what happens once
  // is the popup in the queue below.
  const [songsFolderProblem, setSongsFolderProblem] = useState(false)
  const [gigsFolderProblem, setGigsFolderProblem] = useState(false)
  // **What is news on this arrival**, held apart from the standing sets above because they are a
  // different question: those are conditions, these are the part of each that just changed.
  const [queue, setQueue] = useState<Announcement[]>([])

  const reload = useCallback(() => {
    setGigs(getGigList())
    setSongs(getCatalogueEntries())
  }, [])

  // Arriving here is a door, so the files are re-read — the songs folder as well as the gig. Same
  // on-open re-check the rest of the app does, with no watcher and no boundary to police. It is
  // what makes a song added in a terminal, or a folder just chosen in preferences, simply be here.
  useEffect(() => {
    void (async () => {
      await ensureSongLibraryHydrated()
      await refreshGigReadiness()

      // **Both folders, both halves.** The songs one comes back through the catalogue listing,
      // which asks about the root before it asks what is in it; the gigs one is asked directly,
      // because the gigs list is a remembered set of paths and nothing was reading the folder.
      const songsRoot = getSongsFolder()
      const gigsRoot = getGigsFolder()
      const songsBad = songsRoot !== null && (await listSongsFolder(songsRoot)).problem !== null
      const gigsBad = gigsRoot !== null && !(await folderReadable(gigsRoot)).readable
      setSongsFolderProblem(songsBad)
      setGigsFolderProblem(gigsBad)

      const news: Announcement[] = []

      // **The announcements are made here, on the arrival that discovered them**, and each record
      // is written the moment it is decided rather than when its popup is dismissed: a person who
      // quits with one on screen has still been told, and being told twice about one removal is
      // the thing this replaced.
      const badFolders = [
        ...(songsBad ? [{ half: 'songs' as const, path: songsRoot! }] : []),
        ...(gigsBad ? [{ half: 'gigs' as const, path: gigsRoot! }] : []),
      ]
      for (const half of unreadableFolders.newly(badFolders.map((f) => f.half))) {
        const folder = badFolders.find((f) => f.half === half)!
        news.push({ key: `folder-${folder.half}`, kind: 'folder', ...folder })
      }
      unreadableFolders.record(badFolders.map((f) => f.half))

      // **Nothing is absent from a folder nobody read.** A failed read is not an answer, so
      // `catalogueWasRead` is false in that case and no song is announced as gone — which is what
      // stops an unplugged drive reporting the folder AND every song in it.
      if (catalogueWasRead()) {
        const goneIds = getEntriesNotInCatalogue().map((entry) => entry.ref.id)
        const gone = newlyVanished(goneIds)
        if (gone.length > 0) {
          news.push({ key: 'vanished', kind: 'vanished', songs: gone.map((id) => `${id}.json`) })
        }
        recordVanishedAnnounced(goneIds)
      }

      const broken = getUnreadableCatalogueEntries().map((entry) => ({
        // **The file, not the song.** The title inside may be the unreadable part.
        file: basename(entry.ref.path),
        reason: entry.error ?? 'Will not read.',
      }))
      const newlyBroken = new Set(unreadableSongs.newly(broken.map((b) => b.file)))
      if (newlyBroken.size > 0) {
        news.push({
          key: 'unreadable',
          kind: 'unreadable',
          files: broken.filter((b) => newlyBroken.has(b.file)),
        })
      }
      unreadableSongs.record(broken.map((b) => b.file))

      setQueue(news)
      reload()
    })()
  }, [reload])

  const openFolder = getRememberedGigFolder()
  const canReachFolder = hasGigFolderAccess()

  const run = (action: () => Promise<unknown>) => () => {
    setBusy(true)
    void action().finally(() => {
      setBusy(false)
      reload()
    })
  }

  const toSetup = () => {
    window.location.hash = '#/gig'
  }

  const outsideElectron = 'A gig folder can only be reached from the desktop app, not from a browser tab.'
  // **The frame line is the reason, and the buttons point at it.** One sentence per half rather
  // than the same sentence under every disabled control — see `GatedAction`'s `describedBy`.
  const gigsBlocked = !canReachFolder ? outsideElectron : gigsFolderProblem ? GIGS_FOLDER_LINE : null
  const showing = queue[0]
  const closeTop = () => setQueue((q) => q.slice(1))

  return (
    <div className="songs-screen setup-home-screen">
      {/* **One at a time**, in the queue's order. Two overlays at once is one dialog hiding
          another, and these are separate events about separate things. */}
      {showing?.kind === 'folder' && (
        <UnreadableFolderPopup half={showing.half} path={showing.path} onClose={closeTop} />
      )}
      {showing?.kind === 'vanished' && (
        <VanishedSongsPopup songs={showing.songs} onDismiss={closeTop} />
      )}
      {showing?.kind === 'unreadable' && (
        <UnreadableSongsPopup files={showing.files} onClose={closeTop} />
      )}
      <header className="songs-top-bar">
        <button
          type="button"
          className="songs-back"
          onClick={() => {
            window.location.hash = '#/'
          }}
        >
          Back
        </button>
        <h1 className="songs-title">Backstage</h1>
        <div className="manage-setlists-top-actions">
          <button
            type="button"
            className="songs-manage-setlists"
            data-testid="setup-home-preferences"
            onClick={() => {
              window.location.hash = '#/preferences'
            }}
          >
            Preferences
          </button>
        </div>
      </header>

      <main className="songs-body setup-home-body">
        <div className="setup-home-columns">
          <section className="setup-home-column" data-testid="setup-home-gigs">
            <span className="setup-home-name">Gigs</span>
            {/* **`New` and `Import` are siblings.** The heading says the noun; importing is a
                different act from making one, not a smaller one. */}
            <div className="setup-home-actions">
              {/* **New gig asks for a name, and it asks for it in the flow.** It used to open a
                  directory picker here, so the first thing asked of somebody making their first
                  gig was a filesystem decision. It now goes to step 1, where the gig is named and
                  the app makes its folder inside the gigs root first run recorded. */}
              <GatedAction
                site="setup-new-gig"
                label="New"
                busy={busy}
                blockedBy={gigsBlocked}
                describedBy={gigsFolderProblem ? GIGS_FRAME_LINE_ID : undefined}
                onClick={() => {
                  void closeGig().then(toSetup)
                }}
              />
              {/* The portability case: a gig that already exists on a stick or a shared drive. */}
              <GatedAction
                site="setup-import-gig"
                label="Import"
                busy={busy}
                blockedBy={gigsBlocked}
                describedBy={gigsFolderProblem ? GIGS_FRAME_LINE_ID : undefined}
                onClick={run(async () => {
                  await chooseGigFolder()
                  toSetup()
                })}
              />
            </div>
            <div className="setup-home-frame" data-testid="setup-home-gigs-frame">
              {gigsFolderProblem ? (
                // **Never `No gigs yet.` when the app failed to look** — that would claim the
                // folder is empty on the strength of a read that did not happen.
                <p
                  className="setup-home-empty setup-home-blocked"
                  id={GIGS_FRAME_LINE_ID}
                  data-testid="setup-home-gigs-folder-line"
                >
                  {GIGS_FOLDER_LINE}
                </p>
              ) : gigs.length === 0 ? (
                <p className="setup-home-empty" data-testid="setup-home-no-gigs">
                  No gigs yet.
                </p>
              ) : (
                <ul className="setup-home-list">
                  {gigs.map((path) => (
                    <GigRow
                      key={path}
                      path={path}
                      open={path === openFolder}
                      busy={busy}
                      onOpen={run(async () => {
                        await openGigFolder(path)
                        toSetup()
                      })}
                      onForget={() => {
                        forgetGig(path)
                        reload()
                      }}
                      onLocate={run(async () => {
                        const chosen = await chooseGigFolderPath()
                        if (chosen) replaceGigPath(path, chosen)
                      })}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="setup-home-column" data-testid="setup-home-songs">
            <span className="setup-home-name">Songs</span>
            {/* **No `Import` here, and its absence is a decision.** Raised as a new capability and
                deferred by Jorge on 2026-09-02: what importing a song means when the list *is* the
                folder is an open design question. It is not a layout move waiting to be made. */}
            <div className="setup-home-actions">
              <NewSong
                blockedBy={songsFolderProblem ? SONGS_FOLDER_LINE : null}
                describedBy={SONGS_FRAME_LINE_ID}
                onCreated={(id) => {
                  reload()
                  // **Continuing, not announcing.** The song is in the list and its door is open,
                  // which is the next thing to do rather than a report that something happened.
                  setExpanded(id)
                }}
              />
            </div>
            <div className="setup-home-frame" data-testid="setup-home-songs-frame">
              {songsFolderProblem ? (
                // **`No songs yet.` is never shown when the app failed to look**, because it would
                // claim the folder is empty. This line is also the reason the half's buttons are
                // disabled — they point at it, rather than each repeating it underneath.
                <p
                  className="setup-home-empty setup-home-blocked"
                  id={SONGS_FRAME_LINE_ID}
                  data-testid="setup-home-songs-folder-line"
                >
                  {SONGS_FOLDER_LINE}
                </p>
              ) : songs.length === 0 ? (
                <p className="setup-home-empty" data-testid="setup-home-no-songs">
                  No songs yet.
                </p>
              ) : (
                <ul className="setup-home-list">
                  {songs.map((entry) => (
                    <SongRow
                      key={entry.ref.id}
                      entry={entry}
                      expanded={expanded === entry.ref.id}
                      onToggle={() =>
                        setExpanded((current) => (current === entry.ref.id ? null : entry.ref.id))
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
