import { useCallback, useEffect, useState } from 'react'
import { chooseGigFolder, closeGig, openGigFolder, refreshGigReadiness } from './gigSession'
import { getRememberedGigFolder } from './gigFolderStore'
import { forgetGig, getGigList, replaceGigPath } from './gigListStore'
import {
  ensureSongLibraryHydrated,
  getLibraryEntries,
  adoptSongFile,
  type LibraryEntry,
} from './setlistStore'
import { getSongFilesFolder, getSongsFolder, resolveSongPath } from './contentFolders'
import { hasLyricLines } from './songState'
import {
  chooseGigFolderPath,
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
 * **The gig list stores paths and never readiness.** Each row's delta is computed on read — the
 * fifth rendering of the one readiness function — and it lands in the next round. **Until then a
 * row shows no verdict at all rather than a stale one**, which is the honest intermediate state:
 * a wrong "Ready" is worse than no word.
 */

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
      {/* A reference whose file will not read stays listed, visibly broken. Hiding it would hide
          the problem, and the fix is in the songs folder rather than here. */}
      {!entry.song && (
        <span className="setup-song-problem" data-testid={`setup-song-broken-${entry.ref.id}`}>
          {entry.error ?? 'Will not read.'}
        </span>
      )}
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
function NewSong({ onCreated }: { onCreated: (songId: string) => void }) {
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
  const blockedBy =
    songsFolder === null
      ? 'There is no songs folder yet, so there is nowhere for a song to land.'
      : !hosted
        ? 'bombista cannot be run from here. Run bombista new in a terminal — it is fully usable on its own — and come back; Pregonero re-reads the files when you return.'
        : !legal
          ? 'Give it a name first. It becomes the file’s name and the song’s id.'
          : null

  if (!open) {
    return (
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid="setup-new-song"
        onClick={() => setOpen(true)}
      >
        New song
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
              blockedBy={blockedBy}
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
 * **What the catalogue holds, and what it would not read.**
 *
 * A song file that will not parse is already one visibly broken row, and it stays one: hiding it
 * would hide the problem. What was missing is the folder-level answer — the app read
 * `<songs>/song-performance` and, if the read itself failed, said **"No songs yet"**, which is the
 * app disagreeing with the disk in the quietest possible way.
 *
 * **It reports and does not block.** A modal that has to be cleared before you can go on is closer
 * to the step-1 dead end this whole redesign exists to remove than it is to a report. Repairs point
 * at Bombista, because Pregonero cannot fix a song file and will not pretend to.
 */
function SongsProblems({ folderProblem, broken }: { folderProblem: string | null; broken: string[] }) {
  if (folderProblem === null && broken.length === 0) return null
  return (
    <div className="setup-home-report" data-testid="setup-songs-report">
      {folderProblem !== null && (
        <p className="setup-song-problem" data-testid="setup-songs-folder-problem">
          Your catalogue’s <code>song-performance</code> folder would not read: {folderProblem}
        </p>
      )}
      {broken.length > 0 && (
        <p className="setup-song-problem" data-testid="setup-songs-unreadable">
          {broken.length === 1 ? 'One song file will not read' : `${broken.length} song files will not read`}
          : {broken.join(', ')}. They stay in the list, named, so the problem is visible.{' '}
          <strong>Bombista</strong> is where a song file is repaired — Pregonero reads them and
          writes none.
        </p>
      )}
    </div>
  )
}

export function SetupHomeView() {
  const [gigs, setGigs] = useState<string[]>(getGigList)
  const [songs, setSongs] = useState<LibraryEntry[]>(getLibraryEntries)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [folderProblem, setFolderProblem] = useState<string | null>(null)

  const reload = useCallback(() => {
    setGigs(getGigList())
    setSongs(getLibraryEntries())
  }, [])

  // Arriving here is a door, so the files are re-read — the songs folder as well as the gig. Same
  // on-open re-check the rest of the app does, with no watcher and no boundary to police. It is
  // what makes a song added in a terminal, or a folder just chosen in preferences, simply be here.
  useEffect(() => {
    void (async () => {
      await ensureSongLibraryHydrated()
      await refreshGigReadiness()
      const root = getSongsFolder()
      setFolderProblem(root === null ? null : (await listSongsFolder(root)).problem)
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

  return (
    <div className="songs-screen setup-home-screen">
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
        <h1 className="songs-title">Setup</h1>
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
        <section className="setup-home-column" data-testid="setup-home-gigs">
          <div className="setup-home-column-head">
            <h2 className="gig-section-title">Gigs</h2>
            {/* **New gig asks for a name, and it asks for it in the flow.** It used to open a
                directory picker here, so the first thing asked of somebody making their first gig
                was a filesystem decision. It now goes to step 1, where the gig is named and the
                app makes its folder inside the gigs root first run recorded. */}
            <GatedAction
              site="setup-new-gig"
              label="New gig"
              busy={busy}
              blockedBy={
                canReachFolder
                  ? null
                  : 'A gig can only be made from the desktop app, not from a browser tab.'
              }
              onClick={() => {
                void closeGig().then(toSetup)
              }}
            />
          </div>
          {gigs.length === 0 ? (
            <p className="gig-empty" data-testid="setup-home-no-gigs">
              No gigs yet. A gig is a folder inside your gigs folder, and it is yours — the poster,
              the contract, the stage plan. The two files the tools write live in a{' '}
              <code>setup</code> folder inside it: <code>gig.json</code> is Pregonero’s and{' '}
              <code>visuals.json</code> is Muralista’s, beside it.
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
          <p className="gig-hint">
            A row whose folder has moved stays here, named, to be located or forgotten — a folder on
            a drive that is not plugged in is not a deleted gig. <strong>Forget</strong> is
            Pregonero forgetting where a gig was; the folder itself is untouched.
          </p>
          {/* The import path, one act away from making one, because they are different acts. */}
          {canReachFolder && (
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="setup-import-gig"
              disabled={busy}
              onClick={run(async () => {
                await chooseGigFolder()
                toSetup()
              })}
            >
              Import a gig from elsewhere…
            </button>
          )}
        </section>

        <section className="setup-home-column" data-testid="setup-home-songs">
          <div className="setup-home-column-head">
            <h2 className="gig-section-title">Songs</h2>
            <NewSong
              onCreated={(id) => {
                reload()
                // **Continuing, not announcing.** The song is in the list and its door is open,
                // which is the next thing to do rather than a report that something happened.
                setExpanded(id)
              }}
            />
          </div>
          <SongsProblems
            folderProblem={folderProblem}
            broken={songs.filter((entry) => !entry.song).map((entry) => `${entry.ref.id}.json`)}
          />
          {songs.length === 0 ? (
            <p className="gig-empty" data-testid="setup-home-no-songs">
              No songs yet. Song files live in your catalogue’s <code>song-performance</code>{' '}
              folder, beside <code>audio</code> and <code>lyrics</code>. Songs are gig-independent
              and are usually done days ahead, which is why they are here rather than inside a gig.
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
          <p className="gig-hint">
            Everything inside a song file is <strong>Bombista’s</strong> — the words, the timeline,
            the tempo, the media it names. Pregonero reads them and writes none of them.
          </p>
        </section>
      </main>
    </div>
  )
}
