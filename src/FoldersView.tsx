import { useCallback, useEffect, useState } from 'react'
import {
  getArtistName,
  getBombistaPath,
  getGigsFolder,
  getVisualsFolder,
  getSongsFolder,
  setArtistName,
  setBombistaPath,
  setGigsFolder,
  setVisualsFolder,
  setSongsFolder,
} from './contentFolders'
import { getMediaPath, resolveMediaPath, setMediaPath } from './mediaPathStore'
import { collectMediaSources, type MediaSource } from './mediaSources'
import { ensureSongLibraryHydrated, getLibraryEntries } from './setlistStore'
import { useBroadcastVisuals } from './visualsBroadcast'
import {
  bombistaVersion,
  chooseFilePath,
  chooseFolderPath,
  fileExists,
  hasFolderPicker,
  locateBombista,
} from './platform'
import type { BombistaLocation } from './electronApi'
import { refreshGigReadiness } from './gigSession'

/**
 * **Where this machine keeps things** — the songs root, the gigs root, the visuals folder, and what
 * every name in the files currently resolves to.
 *
 * **All three are asked for on first run as of 2026-09-04**, the visuals folder included. This
 * screen is where they are *changed*, which is the rule it already held for the other two: never
 * the place a setting is discovered.
 *
 * It is its own screen, and that is the point of it. Linking a file used to be possible in exactly
 * one place, the song library's *Locate video…* button, which only ever offers a song's own
 * declared media. Everything else that names a file — a static image, a static video, a contact
 * QR — had no way in at all, so the logo shape resolved to nothing and the wall lost its logo with
 * nothing anywhere saying why.
 *
 * The list below is the fix for the silence as much as the folder is the fix for the name: a name
 * with no bytes behind it is a row that says so.
 *
 * **The folder is called `Visuals` to the person and `media` in the store.** The label followed the
 * word the ruling uses; the localStorage key did not, because a machine's existing answer is not
 * wrong. See `contentFolders.ts`.
 */

type Row = MediaSource & {
  /** The absolute path this machine resolves the name to, or null when it has no answer. */
  path: string | null
  /** Whether a per-source link is what answered. The folder answers everything else. */
  linked: boolean
  /** Null while the check is still out. */
  exists: boolean | null
}

function FolderRow({
  label,
  hint,
  value,
  onChoose,
  onClear,
  disabled,
  testId,
}: {
  label: string
  hint: string
  value: string | null
  onChoose: () => void
  onClear: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <div className="folders-row" data-testid={testId}>
      <span className="folders-row-label">{label}</span>
      <span className="folders-row-value" data-testid={`${testId}-value`}>
        {value ?? 'Not set'}
      </span>
      <p className="gig-hint">{hint}</p>
      <div className="gig-actions">
        <button type="button" className="ctrl-btn ctrl-setup-link" disabled={disabled} onClick={onChoose}>
          {value === null ? 'Choose folder' : 'Choose another folder'}
        </button>
        {value !== null && (
          <button type="button" className="ctrl-btn ctrl-setup-link" disabled={disabled} onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export function FoldersView() {
  const visuals = useBroadcastVisuals()
  const [songsFolder, setSongsFolderState] = useState<string | null>(getSongsFolder)
  const [gigsFolder, setGigsFolderState] = useState<string | null>(getGigsFolder)
  const [visualsFolder, setVisualsFolderState] = useState<string | null>(getVisualsFolder)
  const [artist, setArtist] = useState<string>(() => getArtistName() ?? '')
  const [bombista, setBombista] = useState<{ present: boolean; version: string | null } | null>(null)
  const [bombistaWhere, setBombistaWhere] = useState<BombistaLocation | null>(null)
  const [bombistaPath, setBombistaPathState] = useState<string | null>(getBombistaPath)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  const recheck = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const sources = collectMediaSources(getLibraryEntries(), visuals)
    // Shown resolved-but-unchecked first, so the list is never blank while the disk is asked.
    const initial: Row[] = sources.map((source) => ({
      ...source,
      path: resolveMediaPath(source.src),
      linked: getMediaPath(source.src) !== null,
      exists: null,
    }))
    setRows(initial)
    void (async () => {
      const checked: Row[] = []
      for (const row of initial) {
        checked.push({ ...row, exists: row.path === null ? false : await fileExists(row.path) })
      }
      if (!cancelled) setRows(checked)
    })()
    return () => {
      cancelled = true
    }
  }, [visuals, visualsFolder, tick])

  // Whether the tools are reachable at all. **Absent is a degraded mode, never a failure**: each
  // tool is fully usable on its own, so a missing one means the button is not there and the escape
  // hatch is.
  useEffect(() => {
    let cancelled = false
    void bombistaVersion().then((v) => {
      if (!cancelled) setBombista(v)
    })
    void locateBombista().then((where) => {
      if (!cancelled) setBombistaWhere(where)
    })
    return () => {
      cancelled = true
    }
  }, [tick])

  const canPick = hasFolderPicker()

  const chooseSongs = () => {
    setBusy(true)
    void (async () => {
      const chosen = await chooseFolderPath('Where your songs live', 'songs-folder')
      if (chosen) {
        setSongsFolder(chosen)
        setSongsFolderState(chosen)
        // **The songs appear now, not on the next launch.** Hydration seeds a reference for every
        // song file in the folder, and this is the moment the folder becomes known.
        await ensureSongLibraryHydrated()
        void refreshGigReadiness()
      }
      setBusy(false)
    })()
  }

  const chooseGigs = () => {
    setBusy(true)
    void (async () => {
      const chosen = await chooseFolderPath('Where your gigs live', 'gigs-folder')
      if (chosen) {
        setGigsFolder(chosen)
        setGigsFolderState(chosen)
      }
      setBusy(false)
    })()
  }

  const chooseVisuals = () => {
    setBusy(true)
    void (async () => {
      const chosen = await chooseFolderPath('Where your visuals live', 'media-folder')
      if (chosen) {
        setVisualsFolder(chosen)
        setVisualsFolderState(chosen)
        // Readiness counts a song's video as missing when the name does not resolve, so choosing
        // the folder can turn a blocked song into a ready one. Nothing else recomputes it.
        void refreshGigReadiness()
      }
      setBusy(false)
    })()
  }


  const locate = (src: string) => {
    const api = window.electronAPI
    if (!api) return
    setBusy(true)
    void (async () => {
      const chosen = await chooseFilePath('video')
      if (chosen) {
        setMediaPath(src, chosen)
        recheck()
        void refreshGigReadiness()
      }
      setBusy(false)
    })()
  }

  return (
    <div className="songs-screen folders-screen">
      <header className="songs-top-bar">
        <button
          type="button"
          className="songs-back"
          onClick={() => {
            window.location.hash = '#/setup'
          }}
        >
          Back
        </button>
        <h1 className="songs-title">Preferences</h1>
        <div className="manage-setlists-top-actions">
          <button type="button" className="songs-manage-setlists" disabled={busy} onClick={recheck}>
            Re-check
          </button>
        </div>
      </header>

      <main className="songs-body folders-body">
        {!canPick && (
          <p className="gig-empty" data-testid="folders-no-picker">
            Folders can only be chosen from the desktop app.
          </p>
        )}

        {/* **The artist's name, and this is where it is CHANGED** (Jorge, 2026-09-05). It is asked
            on its own screen at first run, on the principle that settles the whole group: *each
            artist-level fact is asked at the moment it is first needed and lives in Preferences
            afterwards.* **Preferences is where a setting is changed, never where you find out it
            exists** — the same rule the gigs root already holds.

            First on the page, above the folders, because it is who rather than where. */}
        <section className="folders-section">
          <h2 className="gig-section-title">You</h2>
          <div className="folders-row" data-testid="folders-artist">
            <span className="folders-row-label">Artist</span>
            <input
              className="folders-row-input"
              data-testid="folders-artist-input"
              type="text"
              value={artist}
              autoComplete="off"
              spellCheck={false}
              placeholder="Not set"
              onChange={(e) => {
                setArtist(e.target.value)
                setArtistName(e.target.value)
              }}
            />
            <span className="folders-row-hint">
              The name the work goes out under. Tramoya fills it in when a new song is made.
            </span>
          </div>
        </section>

        <section className="folders-section">
          <h2 className="gig-section-title">Folders on this machine</h2>
          <FolderRow
            testId="folders-songs"
            label="Songs"
            hint="The root that holds the song files. A song chosen from inside it is remembered by name, so the library survives the folder moving."
            value={songsFolder}
            disabled={busy || !canPick}
            onChoose={chooseSongs}
            onClear={() => {
              setSongsFolder(null)
              setSongsFolderState(null)
            }}
          />
          {/* **The gigs root is changed here, and it is only ever discovered on first run.**
              Preferences is where a setting is changed, never where you find out it exists. */}
          <FolderRow
            testId="folders-gigs"
            label="Gigs"
            hint="Where your gigs live, one folder per night. New gigs are made in here; each one is yours, and the two files the tools write sit in a setup folder inside it."
            value={gigsFolder}
            disabled={busy || !canPick}
            onChoose={chooseGigs}
            onClear={() => {
              setGigsFolder(null)
              setGigsFolderState(null)
            }}
          />
          {/* **No default, deliberately** (2026-09-01). It used to default to `<songs>/audio`, which
              quietly made the catalogue load-bearing for media: a machine keeping video elsewhere
              got a resolution failure it never agreed to. Alignment audio is a transient input
              picked at the door and needs no home at all; performance media is what this answers
              for, and it lives wherever it lives. */}
          <FolderRow
            testId="folders-media"
            label="Visuals"
            hint="Where a name in a file is looked for — the videos, images and QR codes played on the wall. Nothing writes into it. Not the recordings you align against: those are handed over at the door and need no home. A per-source link still wins over this."
            value={visualsFolder}
            disabled={busy || !canPick}
            onChoose={chooseVisuals}
            onClear={() => {
              setVisualsFolder(null)
              setVisualsFolderState(null)
              void refreshGigReadiness()
            }}
          />
        </section>

        <section className="folders-section">
          <h2 className="gig-section-title">Tools on this machine</h2>
          <div className="folders-row" data-testid="folders-bombista">
            <span className="folders-row-label">Bombista</span>
            <span className="folders-row-value" data-testid="folders-bombista-value">
              {bombista === null
                ? 'Checking…'
                : bombista.present
                  ? (bombista.version ?? 'Found')
                  : 'Not found'}
            </span>
            {/* **Where it was found, said out loud.** The failure this replaces was silent: the
                binary was installed, an app launched from Finder could not see it — its PATH is
                /usr/bin:/bin:/usr/sbin:/sbin and pipx installs to ~/.local/bin — and the only
                symptom was `skipped`, which is the same word a machine with no Python gets. */}
            {bombistaWhere !== null && (
              <p className="folders-source-path" data-testid="folders-bombista-where">
                {bombistaWhere.source === 'unresolved'
                  ? bombistaWhere.searched.length === 0
                    ? 'Not checked — this only runs in the desktop app.'
                    : `Not found. Looked in: ${bombistaWhere.searched.join(', ')}`
                  : `${bombistaWhere.command} (${
                      bombistaWhere.source === 'configured'
                        ? 'set below'
                        : bombistaWhere.source === 'path'
                          ? 'on PATH'
                          : 'a known install location'
                    })`}
              </p>
            )}
            <label className="setup-home-field">
              <span>Path</span>
              <input
                type="text"
                value={bombistaPath ?? ''}
                placeholder="Found automatically — set one only to override"
                data-testid="folders-bombista-path"
                onChange={(e) => {
                  const next = e.target.value.trim()
                  setBombistaPathState(next.length > 0 ? next : null)
                  setBombistaPath(next.length > 0 ? next : null)
                }}
                onBlur={recheck}
              />
            </label>
            <p className="gig-hint">
              A Python CLI you install yourself, normally found without being told: on{' '}
              <code>PATH</code> first, then where a Python CLI installs. Set a path here only for a
              machine where neither answer is the right one — a virtualenv, a checkout, a second
              install. <strong>What you type is used exactly as typed and never checked</strong>, so
              a wrong path fails naming itself rather than quietly falling back to another binary.
            </p>
            <p className="gig-hint">
              Without Bombista at all, Tramoya still opens gigs, still arms and still performs — a
              song simply carries no <code>bombista</code> verdict, which is a missing check and not
              a failed one.
            </p>
          </div>
        </section>

        <section className="folders-section">
          <h2 className="gig-section-title">What the files ask for</h2>
          {rows.length === 0 ? (
            <p className="gig-empty" data-testid="folders-no-sources">
              Nothing in the setlist or the room names a file yet.
            </p>
          ) : (
            <ul className="folders-sources">
              {rows.map((row) => {
                const found = row.exists === true
                const state =
                  row.exists === null ? 'checking' : found ? 'found' : row.path === null ? 'unresolved' : 'missing'
                return (
                  <li
                    key={row.src}
                    className={`folders-source folders-source-${state}`}
                    data-testid={`folders-source-${row.src}`}
                  >
                    <span className="folders-source-name">{row.src}</span>
                    <span className="folders-source-status" data-testid={`folders-status-${row.src}`}>
                      {state === 'checking'
                        ? 'Checking…'
                        : state === 'found'
                          ? row.linked
                            ? 'Found — linked'
                            : 'Found in the media folder'
                          : state === 'unresolved'
                            ? 'No media folder, and no link'
                            : 'Not there'}
                    </span>
                    <ul className="folders-source-uses">
                      {row.uses.map((use) => (
                        <li key={use}>{use}</li>
                      ))}
                    </ul>
                    {row.path !== null && <p className="folders-source-path">{row.path}</p>}
                    {!found && window.electronAPI && (
                      <button
                        type="button"
                        className="ctrl-btn ctrl-setup-link"
                        disabled={busy}
                        onClick={() => locate(row.src)}
                      >
                        Locate…
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="gig-hint">
            A name with nothing behind it paints nothing on the wall, deliberately — a broken image
            says less than an empty shape does. This list is where that becomes visible.
          </p>
        </section>
      </main>
    </div>
  )
}
