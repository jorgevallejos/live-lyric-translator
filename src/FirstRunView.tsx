import { useState } from 'react'
import {
  getGigsFolder,
  getSongsFolder,
  setGigsFolder,
  setSongsFolder,
} from './contentFolders'
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
 * **Two equal columns with a hard rule between them, songs left and gigs right** (2026-09-02,
 * settled by walking the screen). The rule is what makes them read as two questions before either
 * is read; side by side they cannot be mistaken for one question asked twice. Each column is one
 * block — label in caps, the path in mono as the loudest thing in it, one paragraph, its picker —
 * and `Confirm` sits below both on the same grid, the only control that leaves.
 *
 * **The pair is centred in the screen, the title names the moment, and the pickers say `Choose`**
 * (2026-09-02, the third walk, on `v0.26.0`). The layout held, so what changed is what sat wrong
 * around it: two columns pinned to the top of an empty screen read as the head of a document with
 * the rest still to come, when the pair *is* the content; `Two folders you already have` states the
 * question the columns already ask, where `Pregonero kickoff` names the moment instead; and
 * `Find it…` asked for a search when the button opens a picker.
 *
 * **Colour marks what has been answered** (2026-09-02, the fourth walk, on the build carrying the
 * three above). The screen was legible and monochrome, so nothing on it said which half was done:
 * a chosen path and `Not chosen yet` sat in the same slot at the same size, differing only in
 * dimness, and `Confirm` looked the same the instant before it became pressable as it did while it
 * was dead. **A chosen path renders in `--state-ok` and `Confirm` joins it once both are in**, so
 * the colour is what marks an answered question; **`Choose` renders in `--state-warn` while its
 * folder is unanswered**, and goes back to the ordinary dark grey once picked, where it already
 * reads `Choose another folder`. Two yellow buttons at rest, three green marks once answered. The
 * contrast objection — two warning-coloured buttons on a screen where nothing is wrong — was
 * raised and overruled: it is recorded as decided, not as a caveat. Both are tokens `control.css`
 * already has; **no new colour enters the palette for this screen**, and the line under the title
 * comes out so the colour is the only thing dividing the screen.
 *
 * **Nothing is created.** Both point at folders that already exist. The one folder the suite ever
 * makes inside the catalogue is `song-performance/`, and Bombista makes it the first time it writes
 * a song there; `setup/` is made the first time a gig is written. Neither is a question.
 *
 * **Everything else is gone, the folder-shape example included** (2026-09-02). The shape read as
 * prescriptive — a structure being required rather than a thing being found — and the prose around
 * it explained the app to someone who had not used it yet. Two paragraphs carry the whole screen,
 * and each says what its folder is worth rather than what the app does with it. This reverses *it
 * shows the shape rather than explaining it*: the shape is reconsidered if the screen turns out to
 * need it, not defended now.
 *
 * **Both paragraphs name Pregonero as the actor**, because *you are never asked again* was false:
 * the pickers still ask for a lyrics file and a recording when a song is made. What is answered
 * once is where the **catalogue** is, not where every file is.
 *
 * **There is no Tramoya folder and the word never appears here.** The app's own bookkeeping — the
 * gig list, the Bombista path, the preferences — is per-machine, is not Jorge's, and lives where
 * macOS puts it. `tramoya` is the suite's name in its own repo, not a user's vocabulary.
 *
 * **It waits to be dismissed** (2026-09-01, reversing #83). That round argued a confirming click
 * would be a step that decides nothing, and the first walk of `v0.24.0` found what it decides:
 * **when the person is done.** Answering a file dialog is not being finished — you may want to
 * re-check the first answer having seen the second — and being thrown to the control view
 * mid-thought is the app deciding on your behalf. Both answers stay changeable until the button is
 * pressed, and pressing it is what leaves.
 *
 * **Once both are chosen and confirmed it is gone, and every later launch goes straight through.**
 * There is no "skip", because the whole point is that a setting stops being something you discover
 * at the moment it blocks you. **Preferences is where they are changed** — never where you find out
 * they exist.
 */

/**
 * One column. **The path is the loudest thing in it**, because the answer is what the column is
 * about; the label names the question and the paragraph argues for it, and neither competes.
 */
function FolderColumn({
  label,
  paragraph,
  value,
  onChoose,
  disabled,
  testId,
}: {
  label: string
  paragraph: string
  value: string | null
  onChoose: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <section className="first-run-column" data-testid={testId}>
      <span className="first-run-label">{label}</span>
      <span
        className="first-run-path"
        data-testid={`${testId}-value`}
        data-unset={value === null ? 'true' : undefined}
      >
        {value ?? 'Not chosen yet'}
      </span>
      <p className="first-run-paragraph">{paragraph}</p>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={`${testId}-choose`}
        // The same flag the path slot carries, for the same reason: what is unanswered is a state
        // of the column, and both of its marks — the dimmed path, the yellow picker — read off it.
        data-unset={value === null ? 'true' : undefined}
        disabled={disabled}
        onClick={onChoose}
      >
        {value === null ? 'Choose' : 'Choose another folder'}
      </button>
    </section>
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
        <h1 className="songs-title">Pregonero kickoff</h1>
      </header>

      <main className="songs-body first-run-body">
        {!canPick && (
          <p className="gig-empty first-run-no-picker" data-testid="first-run-no-picker">
            Folders can only be chosen from the desktop app.
          </p>
        )}

        <div className="first-run-columns">
          <FolderColumn
            testId="first-run-songs"
            label="Where your songs live — Your catalogue"
            paragraph="The folder your recordings and lyrics are already in. Pregonero reads your songs from here and writes the song performance data back into it."
            value={songs}
            disabled={busy || !canPick}
            onChoose={() =>
              choose('Where your songs live', 'songs-folder', setSongsFolder, setSongs)
            }
          />

          <FolderColumn
            testId="first-run-gigs"
            label="Where your gigs live — Your body of work"
            paragraph="The folder where your gig data is stored. Pregonero makes a new folder here for each gig, and keeps its setup inside it."
            value={gigs}
            disabled={busy || !canPick}
            onChoose={() => choose('Where your gigs live', 'gigs-folder', setGigsFolder, setGigs)}
          />
        </div>

        <div className="first-run-confirm-row">
          <GatedAction
            site="first-run-confirm"
            label="Confirm"
            busy={busy}
            blockedBy={unanswered}
            onClick={onDone}
          />
        </div>
      </main>
    </div>
  )
}
