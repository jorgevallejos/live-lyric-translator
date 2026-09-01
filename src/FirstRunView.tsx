import { useState } from 'react'
import {
  getGigsFolder,
  getSongsFolder,
  setGigsFolder,
  setSongsFolder,
} from './contentFolders'
import { GIG_SETUP_FOLDER, SONG_FILES_FOLDER } from './fileLayout'
import { chooseFolderPath, hasFolderPicker } from './platform'
import { GatedAction } from './GatedAction'

/**
 * **First run: two folders you already have, asked once, before anything else.**
 *
 * **It replaces the main screen; it does not sit behind a button and does not appear after the
 * main screen has rendered.** `App` checks `hasRequiredFolders()` before it renders anything on the
 * control side — before the library-hydration screen, which is the one that would otherwise flash
 * first. A launch with either folder unset shows this and nothing else.
 *
 * **They are two different questions, not two file pickers.** *Where your songs live* finds a
 * **catalogue**; *where your gigs live* finds a **body of work**. Both were phrased "choose a
 * folder", which is exactly why the second one read as the first one asked twice.
 *
 * **Nothing is created.** Both point at folders that already exist. The one folder the suite ever
 * makes inside the catalogue is `song-performance/`, and Bombista makes it the first time it writes
 * a song there; `setup/` is made the first time a gig is written. Neither is a question.
 *
 * **It shows the shape rather than explaining it**, and it draws each half as that half is
 * answered. A first-run screen earns its explanation with the thing it is about to work with, not
 * with prose — and the shape is where the ownership boundary this round exists for becomes visible:
 * what the suite writes into each folder, and what stays yours.
 *
 * **There is no Tramoya folder and the word never appears here.** The app's own bookkeeping — the
 * gig list, the Bombista path, the preferences — is per-machine, is not Jorge's, and lives where
 * macOS puts it. `tramoya` is the suite's name in its own repo, not a user's vocabulary.
 *
 * **It waits to be dismissed** (2026-09-01, reversing #83). That round argued a confirming click
 * would be a step that decides nothing, and the first walk of `v0.24.0` found what it decides:
 * **when the person is done.** Answering a file dialog is not being finished — you may want to
 * re-check the first answer having seen the second, or read what the screen says about what goes
 * where — and being thrown to the control view mid-thought is the app deciding on your behalf.
 * Both answers stay changeable until the button is pressed, and pressing it is what leaves.
 *
 * **Once both are chosen and confirmed it is gone, and every later launch goes straight through.**
 * There is no "skip", because the whole point is that a setting stops being something you discover
 * at the moment it blocks you. **Preferences is where they are changed** — never where you find out
 * they exist.
 */

function FolderQuestion({
  question,
  finds,
  hint,
  value,
  onChoose,
  disabled,
  testId,
}: {
  question: string
  finds: string
  hint: string
  value: string | null
  onChoose: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <div className="first-run-row" data-testid={testId}>
      <span className="folders-row-label">{question}</span>
      <span className="first-run-finds">{finds}</span>
      <span className="folders-row-value" data-testid={`${testId}-value`}>
        {value ?? 'Not chosen yet'}
      </span>
      <p className="gig-hint">{hint}</p>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={`${testId}-choose`}
        disabled={disabled}
        onClick={onChoose}
      >
        {value === null ? 'Find it…' : 'Choose another folder'}
      </button>
    </div>
  )
}

/** The last segment of a path, which is what a folder is called when you are looking at it. */
function folderName(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0)
  return parts[parts.length - 1] ?? path
}

/**
 * The shape, drawn from the answers so far. **Owned and ours are labelled on every line**, because
 * that is the whole of what this screen is telling you: the two folders are yours, and the suite
 * writes into one named place inside each.
 */
function Shape({ songs, gigs }: { songs: string | null; gigs: string | null }) {
  if (songs === null && gigs === null) return null
  return (
    <pre className="first-run-shape" data-testid="first-run-shape">
      {songs !== null && (
        <>
          {`${folderName(songs)}/`}
          <span className="first-run-shape-note">  your catalogue</span>
          {`\n  audio/  lyrics/  …`}
          <span className="first-run-shape-note">  your material, any structure you like</span>
          {`\n  ${SONG_FILES_FOLDER}/`}
          <span className="first-run-shape-note">  the song files — written by the suite, yours</span>
          {'\n'}
        </>
      )}
      {songs !== null && gigs !== null && '\n'}
      {gigs !== null && (
        <>
          {`${folderName(gigs)}/`}
          <span className="first-run-shape-note">  your gigs</span>
          {`\n  a gig/`}
          <span className="first-run-shape-note">  yours: the poster, the contract, the debrief</span>
          {`\n    ${GIG_SETUP_FOLDER}/`}
          <span className="first-run-shape-note">  ours: gig.json and visuals.json</span>
          {'\n'}
        </>
      )}
    </pre>
  )
}

export function FirstRunView({ onDone }: { onDone: () => void }) {
  const [songs, setSongs] = useState<string | null>(getSongsFolder)
  const [gigs, setGigs] = useState<string | null>(getGigsFolder)
  const [busy, setBusy] = useState(false)

  const canPick = hasFolderPicker()

  const choose = (
    title: string,
    picker: 'songs-folder' | 'gigs-folder',
    store: (path: string | null) => void,
    hold: (path: string | null) => void
  ) => {
    setBusy(true)
    void (async () => {
      const chosen = await chooseFolderPath(title, picker)
      if (chosen) {
        store(chosen)
        hold(chosen)
      }
      setBusy(false)
    })()
  }

  // **The answers are already stored; the button is about leaving.** Each choice is written the
  // moment it is made, so a launch interrupted halfway comes back to one question answered rather
  // than to nothing — what waits is the screen, not the record of what was said on it.
  const unanswered =
    songs === null && gigs === null
      ? 'Both questions need an answer before Pregonero has anywhere to read or write.'
      : songs === null
        ? 'Where your songs live has not been answered yet.'
        : gigs === null
          ? 'Where your gigs live has not been answered yet.'
          : null

  return (
    <div className="songs-screen first-run-screen" data-testid="first-run">
      <header className="songs-top-bar">
        <h1 className="songs-title">Two folders you already have</h1>
      </header>

      <main className="songs-body first-run-body">
        <p className="gig-hint" data-testid="first-run-lede">
          Point at them once. Nothing is created and nothing is moved — Pregonero opens as usual from
          here on, and you can change them later in preferences.
        </p>

        {!canPick && (
          <p className="gig-empty" data-testid="first-run-no-picker">
            Folders can only be chosen from the desktop app.
          </p>
        )}

        <FolderQuestion
          testId="first-run-songs"
          question="Where your songs live"
          finds="Your catalogue"
          hint="The folder your songs are already in — the recordings, the lyrics, the artwork. The suite reads and writes one folder inside it, and touches nothing else."
          value={songs}
          disabled={busy || !canPick}
          onChoose={() =>
            choose('Where your songs live', 'songs-folder', setSongsFolder, setSongs)
          }
        />

        <FolderQuestion
          testId="first-run-gigs"
          question="Where your gigs live"
          finds="Your body of work"
          hint="The folder your gigs are already in, one folder per night. New gigs are made in here, and each one stays yours."
          value={gigs}
          disabled={busy || !canPick}
          onChoose={() =>
            choose('Where your gigs live', 'gigs-folder', setGigsFolder, setGigs)
          }
        />

        <Shape songs={songs} gigs={gigs} />

        <div className="gig-actions">
          <GatedAction
            site="first-run-confirm"
            label="Use these folders"
            busy={busy}
            blockedBy={unanswered}
            onClick={onDone}
          />
        </div>
      </main>
    </div>
  )
}
