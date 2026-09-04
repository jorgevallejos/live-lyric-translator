import { useState } from 'react'
import {
  getGigsFolder,
  getSongsFolder,
  getVisualsFolder,
  setGigsFolder,
  setSongsFolder,
  setVisualsFolder,
} from './contentFolders'
import { chooseFolderPath, hasFolderPicker } from './platform'
import { GatedAction } from './GatedAction'

/**
 * **First run: three folders you already have, asked once, before anything else.**
 *
 * **It replaces the main screen; it does not sit behind a button and does not appear after the
 * main screen has rendered.** `App` checks `hasRequiredFolders()` before it renders anything on the
 * control side — before the library-hydration screen, which is the one that would otherwise flash
 * first. A launch with any folder unset shows this and nothing else, and on a machine that has
 * answered none of them **the app's deal comes one screen earlier** — see `AppDealView.tsx`.
 *
 * ── 2026-09-04: a third folder, and the paragraphs come off ──────────────────────────────────
 *
 * **A third folder is added: where the visuals live** (Jorge), on the same argument that gave songs
 * and gigs theirs. A picker opening at the home folder was already found wrong for Bombista, and it
 * is worse here because the files are larger and buried deeper. **Order is SONGS · VISUALS · GIGS,
 * matching the deal's own sentence.**
 *
 * **It is the first folder the suite only reads.** Songs got `song-performance/` and gigs got
 * `setup/` because the tools write into both. **Nothing writes into the visuals folder** —
 * Muralista reads assets from it and writes `visuals.json` into the gig's `setup/`. So there is no
 * subfolder to carve out and no ownership boundary to defend, and the column says so.
 *
 * **Three is where it stops.** Songs are the words and their recordings, gigs are the nights,
 * visuals are what goes on the wall. Nothing else in the workflow has a fourth kind of thing behind
 * it.
 *
 * **And the columns go lean: the paragraphs come off.** They existed because this screen was the
 * first thing you met and had to do the explaining. **The deal does that now, one screen earlier**,
 * so each column drops to its name, its caps subtitle, a `Choose` and its path — which is what
 * makes three columns fit at all.
 *
 * **This reopens the screen that took six rounds and was closed on 03/09, knowingly.** It was
 * designed for two questions, two equal columns and a hard rule between them, and its whole point
 * was that they read as different questions before either is read. **A third column re-tests that
 * insight**, and the kickoff screen goes back on the walk. Everything below this line is what the
 * six rounds bought and is kept.
 *
 * **They are two different questions, not two file pickers.** *Where your songs live* finds a
 * **catalogue**; *where your gigs live* finds a **body of work**. Both were phrased "choose a
 * folder", which is exactly why the second one read as the first one asked twice.
 *
 * **Equal columns with a hard rule between them** (2026-09-02, settled by walking the screen; three
 * of them since 2026-09-04). The rule is what makes them read as separate questions before any is
 * read; side by side they cannot be mistaken for one question asked over again. Each column is one
 * block — label in caps, the path in mono as the loudest thing in it, one paragraph, its picker —
 * and `Confirm` sits below them all on the same grid, the only control that leaves.
 *
 * **The pair is centred in the screen, the title names the moment, and the pickers say `Choose`**
 * (2026-09-02, the third walk, on `v0.26.0`). The layout held, so what changed is what sat wrong
 * around it: two columns pinned to the top of an empty screen read as the head of a document with
 * the rest still to come, when the pair *is* the content; `Two folders you already have` states the
 * question the columns already ask, where `Pregonero kickoff` named the moment instead (superseded
 * by `Start here` at the sixth walk, below); and `Find it…` asked for a search when the button
 * opens a picker.
 *
 * **Colour marks what has been answered** (2026-09-02, the fourth walk, on the build carrying the
 * three above). The screen was legible and monochrome, so nothing on it said which half was done:
 * `Confirm` looked the same the instant before it became pressable as it did while it was dead.
 * **`Confirm` turns `--state-ok` once both folders are in**; **`Choose` renders in `--state-warn`
 * while its folder is unanswered**, and goes back to the ordinary dark grey once picked, where it
 * already reads `Choose another folder`. Two yellow buttons at rest, one green mark once answered.
 * The contrast objection — two warning-coloured buttons on a screen where nothing is wrong — was
 * raised and overruled: it is recorded as decided, not as a caveat. Both are tokens `control.css`
 * already has; **no new colour enters the palette for this screen**, and the line under the title
 * comes out so the colour is the only thing dividing the screen.
 *
 * **The name is the loudest thing in the column, and the green is only on `Confirm`** (2026-09-02,
 * the fifth walk, on `v0.27.0`). Two decisions taken above are reversed here on purpose.
 *
 * *The green comes off the paths.* The fourth walk put `--state-ok` on a chosen path as well as on
 * `Confirm`, which spread one meaning over three marks. **One green mark on the screen, meaning one
 * thing: you are ready.** The path goes back to `--text-primary`. The answered state is still
 * legible without colour — the button turns over to `Choose another folder`, and `Confirm` goes
 * green. If that proves too quiet the repair is weight on the path, not colour returning to it.
 *
 * *Each column is headed `SONGS` and `GIGS`, large,* and the caps line demotes to the subtitle it
 * always was, underneath. **This supersedes *the path is the loudest thing in the column*, and the
 * supersession is the point rather than an oversight.** Making the answer loudest was right about
 * what someone returns to the screen to check and wrong about what the screen is for at rest: with
 * both paths reading `Not chosen yet`, the two columns opened looking identical — the one reading
 * the side-by-side layout exists to prevent. The difference between the two questions is the whole
 * screen, so the naming has to carry it. Order is name, caps subtitle, paragraph, button, path.
 *
 * **The title is `Start here`, and it has room above it** (2026-09-02, the sixth walk, on
 * `v0.28.0`). The layout was accepted as walked; what was left was the heading and the space around
 * it. `Pregonero kickoff` repeated the app's name, which the window's own title bar already carries
 * two lines above — the heading was saying what the chrome had just said. **The objection to `Start
 * here` when it was first proposed was that it drops the app name, and the chrome is exactly what
 * makes that objection void.** Same slot, same treatment; only the words change. And the title sat
 * against the window's top edge, because `.songs-title` is centred inside a bar whose only child is
 * absolutely positioned and which therefore has no height of its own beyond its padding — see
 * `control.css`, where the first-run bar gets real room above the heading.
 *
 * **Both paragraphs are replaced word for word, and the gigs one states a rule the app does not yet
 * follow** (2026-09-02, the same walk). The songs paragraph now names `song-performance` as where
 * the performance data goes, rather than saying it is written *back into* the catalogue, which was
 * vague about the one folder the tools govern. The gigs paragraph says Pregonero keeps every gig's
 * setup data inside **a single `setup` folder**, while `New gig` still makes one folder per gig with
 * a `setup/` inside each. **The mismatch is deliberate: the screen ships stating the rule ahead of
 * the behaviour**, which is closed at step 8 of the walk. It is not a copy error, and the sentence
 * is not reverted to match what the code does today. Naming both folders in prose is allowed where
 * the folder-shape tree was not: the tree told you how to arrange your folders, and a name inside a
 * sentence says what will appear in them.
 *
 * **Nothing is created.** All three point at folders that already exist. The one folder the suite
 * ever makes inside the catalogue is `song-performance/`, and Bombista makes it the first time it
 * writes a song there; `setup/` is made the first time a gig is written. **Inside the visuals
 * folder nothing is made at all.** None of it is a question.
 *
 * **Everything else is gone, the folder-shape example included** (2026-09-02). The shape read as
 * prescriptive — a structure being required rather than a thing being found — and the prose around
 * it explained the app to someone who had not used it yet. **The paragraphs that replaced it are
 * gone too** (2026-09-04, above): what each folder is worth is now argued once, for all three, on
 * the deal. This reverses *it shows the shape rather than explaining it*: the shape is reconsidered
 * if the screen turns out to need it, not defended now.
 *
 * **There is no Tramoya folder and the word never appears here.** The app's own bookkeeping — the
 * gig list, the Bombista path, the preferences — is per-machine, is not Jorge's, and lives where
 * macOS puts it. `tramoya` is the suite's name in its own repo, not a user's vocabulary.
 *
 * **It waits to be dismissed** (2026-09-01, reversing #83). That round argued a confirming click
 * would be a step that decides nothing, and the first walk of `v0.24.0` found what it decides:
 * **when the person is done.** Answering a file dialog is not being finished — you may want to
 * re-check an earlier answer having seen a later one — and being thrown to the control view
 * mid-thought is the app deciding on your behalf. Every answer stays changeable until the button is
 * pressed, and pressing it is what leaves. **Answering the last folder does not throw you onward.**
 *
 * **Once all three are chosen and confirmed it is gone, and every later launch goes straight
 * through.**
 * There is no "skip", because the whole point is that a setting stops being something you discover
 * at the moment it blocks you. **Preferences is where they are changed** — never where you find out
 * they exist.
 */

/**
 * One column, in four parts: **`name`, the loudest thing in it**, the caps `label` under it, the
 * picker, and the answer last.
 *
 * `name` is what the column *is* — `SONGS`, `VISUALS`, `GIGS` — and `label` is the question it
 * asks. They were one line until the fifth walk, and the path was loudest; at rest that made the
 * columns open looking identical, because every path read `Not chosen yet` and nothing above them
 * was loud enough to tell them apart.
 *
 * **The paragraph was the fifth part and came off on 2026-09-04.** It argued for its folder because
 * this screen was the first thing you met; the deal argues for all three now, one screen earlier.
 */
function FolderColumn({
  name,
  label,
  value,
  onChoose,
  disabled,
  testId,
}: {
  name: string
  label: string
  value: string | null
  onChoose: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <section className="first-run-column" data-testid={testId}>
      <span className="first-run-name" data-testid={`${testId}-name`}>
        {name}
      </span>
      <span className="first-run-label">{label}</span>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={`${testId}-choose`}
        // The flag is a state of the column, not of one mark: the picker reads it for its yellow,
        // and the path slot reads it for the dim that says nothing has been answered there yet.
        data-unset={value === null ? 'true' : undefined}
        disabled={disabled}
        onClick={onChoose}
      >
        {value === null ? 'Choose' : 'Choose another folder'}
      </button>
      <span
        className="first-run-path"
        data-testid={`${testId}-value`}
        data-unset={value === null ? 'true' : undefined}
      >
        {value ?? 'Not chosen yet'}
      </span>
    </section>
  )
}

export function FirstRunView({ onDone }: { onDone: () => void }) {
  const [songs, setSongs] = useState<string | null>(getSongsFolder)
  const [visuals, setVisuals] = useState<string | null>(getVisualsFolder)
  const [gigs, setGigs] = useState<string | null>(getGigsFolder)
  const [busy, setBusy] = useState(false)

  const canPick = hasFolderPicker()

  const choose = (
    title: string,
    picker: 'songs-folder' | 'gigs-folder' | 'media-folder',
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
  //
  // **The reason names the questions still open**, which is the whole of what a gated action owes:
  // with three of them, *one of these is missing* would be the wall the rule exists to prevent.
  const open = [
    songs === null ? 'Where your songs live' : null,
    visuals === null ? 'Where your visuals live' : null,
    gigs === null ? 'Where your gigs live' : null,
  ].filter((question): question is string => question !== null)

  const unanswered =
    open.length === 0
      ? null
      : open.length === 3
        ? 'All three questions need an answer before Pregonero has anywhere to read or write.'
        : open.length === 2
          ? `${open[0]} and ${open[1][0].toLowerCase()}${open[1].slice(1)} have not been answered yet.`
          : `${open[0]} has not been answered yet.`

  return (
    <div className="songs-screen first-run-screen" data-testid="first-run">
      <header className="songs-top-bar">
        <h1 className="songs-title">Start here</h1>
      </header>

      <main className="songs-body first-run-body">
        {!canPick && (
          <p className="gig-empty first-run-no-picker" data-testid="first-run-no-picker">
            Folders can only be chosen from the desktop app.
          </p>
        )}

        {/* **SONGS · VISUALS · GIGS, in the deal's own order** (2026-09-04). The sentence the person
            has just read is *where your songs are, where your visuals are, and where your gigs will
            live*; asking them in another order would make the screen the second thing to learn. */}
        <div className="first-run-columns">
          <FolderColumn
            testId="first-run-songs"
            name="Songs"
            label="Where your songs live — Your catalogue"
            value={songs}
            disabled={busy || !canPick}
            onChoose={() =>
              choose('Where your songs live', 'songs-folder', setSongsFolder, setSongs)
            }
          />

          {/* **The one folder nothing writes into.** Its picker memory is `media-folder`, the name
              the store has always used, because a machine's remembered answer is not wrong. */}
          <FolderColumn
            testId="first-run-visuals"
            name="Visuals"
            label="Where your visuals live — What goes on the wall"
            value={visuals}
            disabled={busy || !canPick}
            onChoose={() =>
              choose('Where your visuals live', 'media-folder', setVisualsFolder, setVisuals)
            }
          />

          <FolderColumn
            testId="first-run-gigs"
            name="Gigs"
            label="Where your gigs live — Your body of work"
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
