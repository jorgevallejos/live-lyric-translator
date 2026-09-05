import { useCallback, useEffect, useState } from 'react'
import { closeGig, openGigFolder, refreshGigReadiness } from './gigSession'
import { getRememberedGigFolder } from './gigFolderStore'
import { readGigLabels } from './gigLabels'
import { readGigFolders } from './gigFolderList'
import {
  ensureSongLibraryHydrated,
  catalogueWasRead,
  getCatalogueEntries,
  getEntriesNotInCatalogue,
  getUnreadableCatalogueEntries,
  forgetDeletedSong,
  type LibraryEntry,
} from './setlistStore'
import { newlyVanished, recordVanishedAnnounced } from './vanishedSongs'
import { unreadableFolders, unreadableGigs, unreadableSongs } from './launchAnnouncements'
import { getGigsFolder, getSongFilesFolder, getSongsFolder, resolveSongPath } from './contentFolders'
import {
  bombistaStagingDir,
  deleteGigFolder,
  deleteSongFile,
  hasGigFolderAccess,
  canRunBombista,
  listSongsFolder,
} from './platform'
import { setSongFlowRequest } from './songFlowState'
import { gigsUsingSong, type GigUse } from './songUsage'
import { PencilIcon, TrashCanIcon } from './RowIcons'
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
 *
 * **The two lists are the same shape now** (Jorge, 2026-09-03). A gig row is its name, a pencil and
 * a bin, like a song row is its title, its mode and the same two marks. See `GigRow` for what came
 * off it, and `DeleteGigPopup` for what the bin removes and what it cannot reach.
 *
 * **`Forget` is gone and deleting replaced it.** Dropping the reference and leaving the folder was
 * the same shape as the trash can that came off the song library: an action that looks like removal
 * and is not. **The list still has to be told**, though, because unlike the Songs list it is not the
 * folder — see `confirmDeleteGig`, where forgetting is a consequence of a successful delete rather
 * than a thing anyone can ask for.
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

/**
 * **A gig row is its name and the way in, and nothing else** (Jorge, 2026-09-03, walking `v0.40.0`).
 *
 * It used to carry the name, an `OPEN` badge, the full path over three lines, and three labelled
 * buttons: `Setup`, `Locate…`, `Forget`. Four gigs made a wall. **The shape is the song row's** —
 * the title, its state, and the marks the app already uses for a row's own actions.
 *
 * **The name is the date and the venue, read live out of `gig.json`** (Jorge, 2026-09-03). It used
 * to be `basename(path)`, so correcting a venue left the row showing the old string — Jorge hit
 * that by walking. **The row and the folder are allowed to disagree**: the folder is machinery,
 * an opaque id that never changes, and this is a label. The rule is `gigFile.gigLabel`, and the
 * folder's id stands in for a gig whose file will not read. Screen 1 of the gig flow is where the
 * folder's own name is still shown.
 *
 * **The `OPEN` badge is gone** (Jorge, 2026-09-03). It was kept as the equivalent of the song row's
 * `manual only`, and the two are not equivalent: a mode says what a song **is**, while `OPEN` said
 * a fact about this session. Jorge asked twice what it meant. The question underneath it — *which
 * gig am I working on* — is the control view's, and is parked.
 *
 * **The pencil is the way in, and it is what `Setup` did**: it opens the gig folder and enters the
 * gig flow, which is the same control the song rows carry for the same act.
 *
 * **THE PLAY TRIANGLE IS THE WAY OUT** (Jorge, 2026-09-03, built 09-04). It selects that gig and
 * lands on `Standby` with the gig's name in the first column and its first song in the second,
 * unarmed. **`Backstage` and `Standby` are joined by ordinary navigation**: `Setup` goes in, this
 * comes out, selecting on the way.
 *
 * **It is performance work sitting on a setup screen, and that is not a mistake**: the act is
 * selection, and selection is performance's. So setup does not wait on it and it is not missing
 * from step 5.
 *
 * **It calls `openGigFolder`, which is the one selection this app has.** That function is the whole
 * memory of *which gig is open* — one path, read by the Projection window — and the pencil beside
 * it calls the same one. **When the control view gains its own full-screen picker it calls this
 * too.** Two doors performing one act is fine; two mechanisms is how they drift, and a second idea
 * of the current gig is exactly the class of defect this repo has already paid for twice.
 *
 * **No confirmation, and it selects even when setup is incomplete.** Readiness is reported at
 * arming, which is where the gate is; blocking selection would stop Jorge looking at his own gig.
 *
 * **The label names the act, not the destination.** `Select`, in the register the pencil's `Edit`
 * and the bin's `Delete` already set.
 *
 * **`Locate…` is gone because it has no destination.** Under the single-`setup/` ruling a gig can
 * only live at `<gigs>/setup/<gig>`, so there is nowhere to locate one to. Its removal falls out of
 * this redesign rather than needing a decision of its own.
 *
 * **The bin deletes the gig, and `Forget` is what it replaced** (Jorge, 2026-09-03). Forgetting
 * dropped Pregonero's reference and left the folder — the same shape as the trash can that came off
 * the song library, and meaningless for the same reason. **What goes is `<gigs>/setup/<gig>/`**, the
 * machine's folder: `gig.json`, `visuals.json`. Nothing of the artist's is in there to lose, because
 * the single-`setup/` ruling puts their night folders beside `setup/` rather than inside it. **To
 * the Trash, never unlinked**, on the rule already settled for a song file — and behind the same
 * consent dialog, naming what goes and what stays.
 */
function GigRow({
  path,
  label,
  busy,
  onOpen,
  onDelete,
}: {
  path: string
  label: string
  busy: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  // **The test ids and the visible name part company here, and that is the point.** An id is
  // machinery and stays the folder's, which never changes; the label follows the file.
  const id = basename(path)
  return (
    <li className="setup-home-row setup-gig-row" data-testid={`setup-gig-row-${id}`}>
      <span className="setup-home-row-name">{label}</span>
      {/* **A GIG ROW IS NAME, PENCIL, BIN** (Jorge, 2026-09-05). The play triangle came off:
          **nothing opens a gig for performance from the room where gigs are made.** Choosing
          tonight's gig is `Choose` on Standby, which is where performing happens, and this room
          makes gigs and edits them. The 03/09 shape — *a gig row is its name, a pencil and a bin,
          like a song row is its title, its mode and the same two marks* — is what is left, and it
          is what that ruling asked for before the triangle was added to it on 04/09. */}
      <div className="setup-home-row-actions">
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn"
          disabled={busy}
          aria-label={`Edit ${label}`}
          title="Edit"
          data-testid={`setup-gig-open-${id}`}
          onClick={onOpen}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
          disabled={busy}
          aria-label={`Delete ${label}`}
          title="Delete"
          data-testid={`setup-gig-delete-${id}`}
          onClick={onDelete}
        >
          <TrashCanIcon />
        </button>
      </div>
    </li>
  )
}

/**
 * **A row is the way into the flow for a song that already exists** (2026-09-02, step 6).
 *
 * It used to expand into a panel holding the whole of Bombista's process, flattened onto half of
 * a screen. **Editing is the same flow as making one** — Bombista's page 1 prefills every field
 * from an SP JSON, which is what lets one flow serve both — so the row does what `New` does, and
 * the panel is gone.
 *
 * **The actions are on the row, in the marks the app already uses** (2026-09-02, walking
 * `v0.34.0`). `Edit` was a labelled button stacked under the title, which made a two-line row out
 * of a one-line fact and left no room for a second action. A pencil and a bin on the title's own
 * line is what the manage-setlists screen did, and the icons are literally the same ones — see
 * `RowIcons`. That screen is gone; the marks it introduced are now the app's own.
 *
 * **`manual only` is a property, not a warning.** A song with no timeline is a legitimate song: it
 * goes in setlists and is advanced by hand, which is what this app was built to do before it could
 * do anything else. So it sits on the row like a mode, in the muted grey of a fact — not in
 * `--state-warn`, and not as a line telling you something is missing. **Where a message goes is
 * decided by what caused it**, and nothing caused this.
 */
function SongRow({
  entry,
  busy,
  onOpen,
  onDelete,
}: {
  entry: LibraryEntry
  busy: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const title = entry.song?.title ?? entry.ref.id
  const manualOnly = (entry.song?.timeline?.length ?? 0) === 0
  return (
    <li className="setup-home-row setup-song-row" data-testid={`setup-song-row-${entry.ref.id}`}>
      <span className="setup-home-row-name">{title}</span>
      {manualOnly && (
        <span className="setup-song-mode" data-testid={`setup-song-mode-${entry.ref.id}`}>
          manual only
        </span>
      )}
      {/* **No mark for a file that will not read, because such a file is not a row here at all.**
          It is named once in a popup and then dropped — see `UnreadableSongsPopup`. */}
      <div className="setup-home-row-actions">
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn"
          disabled={busy}
          aria-label={`Edit ${title}`}
          title="Edit"
          data-testid={`setup-song-open-${entry.ref.id}`}
          onClick={onOpen}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="manage-setlists-action-btn manage-setlists-icon-btn manage-setlists-delete-btn"
          disabled={busy}
          aria-label={`Delete ${title}`}
          title="Delete"
          data-testid={`setup-song-delete-${entry.ref.id}`}
          onClick={onDelete}
        >
          <TrashCanIcon />
        </button>
      </div>
    </li>
  )
}

/**
 * **Deleting a gig is never silent either, and the dialog is about what survives.**
 *
 * Jorge, 2026-09-03, ruling on the second icon. **What goes is the machine's folder** —
 * `<gigs>/setup/<gig>/`, holding `gig.json` and `visuals.json` — **to the Trash, never unlinked**,
 * on the rule already settled for a song file.
 *
 * **What stays is everything that is the artist's**, and that is not a reassurance, it is the
 * single-`setup/` ruling restated: the tools own one `setup/` folder inside the gigs folder and
 * write nowhere else in it, so the night's own folder, the poster, the contract and the stage plan
 * are not in the thing being removed. **Nor are the songs** — a setlist stores ids, not copies.
 *
 * **What is actually lost is named, because it is real:** the running order and the visuals mapping
 * for that night. A dialog that only said what was safe would be selling the press rather than
 * informing it.
 *
 * **This adds no new kind of popup.** It is the second of the three the suite allows — a
 * destructive action needing consent — in the same box, the same shape and the same two buttons as
 * `DeleteSongPopup` and `LeaveWithoutSaving`. Three is the ceiling.
 */
function DeleteGigPopup({
  name,
  folder,
  open,
  busy,
  problem,
  onCancel,
  onConfirm,
}: {
  name: string
  folder: string
  open: boolean
  busy: boolean
  problem: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="ctrl-timeline-save-overlay" data-testid="setup-gig-delete-popup">
      <div
        className="ctrl-timeline-save-dialog setup-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${name}`}
      >
        <p className="ctrl-timeline-save-message" data-testid="setup-gig-delete-title">
          Delete {name}?
        </p>
        <p className="setup-consent-what" data-testid="setup-gig-delete-what">
          <code>{folder}</code> goes to the Trash, with this gig’s running order and its visuals.{' '}
          <strong>Everything else in your gigs folder stays where it is</strong> — the night’s own
          folder, the poster, the contract, the stage plan. <strong>No song is touched</strong>: a
          setlist stores names, not copies.
        </p>
        {open && (
          <p className="setup-song-delete-uses-foot" data-testid="setup-gig-delete-open">
            This is the gig that is currently open. It will be closed.
          </p>
        )}
        {problem !== null && (
          <p className="setup-song-problem" data-testid="setup-gig-delete-problem">
            {problem}
          </p>
        )}
        <div className="ctrl-timeline-save-actions setup-consent-actions">
          <button type="button" className="ctrl-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ctrl-btn setup-consent-confirm"
            disabled={busy}
            data-testid="setup-gig-delete-confirm"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * **Deleting a song is never silent, and the dialog is about what survives.**
 *
 * Jorge, 2026-09-02. Two facts, and the second is the one worth interrupting for: **the song file
 * goes and the lyrics and the recordings do not.** They are the author's, they live in other
 * folders, and a person about to press this needs to know that the thing they spent an afternoon
 * on is not what is at stake.
 *
 * **A song in a gig is named, and not blocked.** A gig's setlist keeps its ids and reports what it
 * cannot resolve, so the record of that night stays truthful either way; refusing would make the
 * catalogue hostage to its own history. So the nights are listed and the button still says
 * `Delete`.
 *
 * **This is the second of the three popups the app allows** — an outside-caused fact you must
 * know, a destructive action needing consent, and a commitment whose consequence is off screen.
 * Three is the ceiling, and a fourth kind means something was misclassified.
 *
 * ## It wears the suite's one consent-dialog shape, and it is the last of the three to
 *
 * **Left-aligned title and text, two outlined buttons, the destructive action on the right, in the
 * fail colour — and Bombista's dimensions** (Jorge, 2026-09-03). The table is in
 * `tramoya-integration/project-context.md` and it cannot be a shared component: Bombista renders
 * its half from a Python process. So it is written down once and implemented three times — there,
 * in `LeaveWithoutSaving`, and here.
 *
 * **This one moved last and it moved because it had drifted.** `LeaveWithoutSaving` was built to
 * look exactly like this dialog; when that one went to Bombista's shape, this one stayed centred
 * at 770px and the pair that were meant to be indistinguishable stopped being so.
 *
 * **`rem`, never `em`, everywhere in this box.** `.songs-screen` sets `font-size: calc(16px *
 * var(--control-ui-scale))` — 24px, right for a control view read from a stage and wrong for a
 * modal read at a desk. Every `em` here was 1.5x Bombista's, which is the whole of why the box was
 * 1.7x too wide. `LeaveWithoutSaving.test.tsx` asserts both boxes against one table.
 */
function DeleteSongPopup({
  title,
  file,
  uses,
  busy,
  problem,
  onCancel,
  onConfirm,
}: {
  title: string
  file: string
  uses: GigUse[] | null
  busy: boolean
  problem: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="ctrl-timeline-save-overlay" data-testid="setup-song-delete-popup">
      <div
        className="ctrl-timeline-save-dialog setup-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${title}`}
      >
        <p className="ctrl-timeline-save-message" data-testid="setup-song-delete-title">
          Delete {title}?
        </p>
        <p className="setup-consent-what" data-testid="setup-song-delete-what">
          <code>{file}</code> goes to the Trash. <strong>Your lyrics and your recordings stay
          where they are</strong> — Pregonero does not touch them.
        </p>
        {uses !== null && uses.length > 0 && (
          <div className="setup-song-delete-uses" data-testid="setup-song-delete-uses">
            <p className="setup-song-delete-uses-head">
              {uses.length === 1 ? 'It is in one gig’s setlist:' : `It is in ${uses.length} gigs’ setlists:`}
            </p>
            <ul className="setup-songs-gone-list">
              {uses.map((use) => (
                <li key={use.path}>{use.name}</li>
              ))}
            </ul>
            {/* Named, not blocked: the night's record keeps its ids and says what it cannot find. */}
            <p className="setup-song-delete-uses-foot">
              Those setlists keep their record of the night and will report the song as missing.
            </p>
          </div>
        )}
        {problem !== null && (
          <p className="setup-song-problem" data-testid="setup-song-delete-problem">
            {problem}
          </p>
        )}
        <div className="ctrl-timeline-save-actions setup-consent-actions">
          <button type="button" className="ctrl-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ctrl-btn setup-consent-confirm"
            disabled={busy}
            data-testid="setup-song-delete-confirm"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * **`New` goes straight into the flow, and nothing is written first** (2026-09-02, step 6).
 *
 * **What it replaced.** `New song` opened a form on this screen, asked for a name, and ran
 * `bombista new` to write a skeleton into the catalogue. Three things were wrong with that and
 * they were one thing: the step asks to *arrive in a flow*, and this kept you here; the name was a
 * question whose answer already exists in the lyrics file you are about to hand over; and the
 * skeleton it wrote carried one placeholder lyric line, which is what made the walk of 2026-09-02
 * fail at step 7 — `promote` merges only the timeline envelope into a song that exists, so the
 * words never reached it and the count guard refused. **Nothing is created up front now**, so
 * `promote` takes its create path and carries the whole song.
 *
 * **The button is the whole control.** No form, no field, no `Create`. The flow's first screen is
 * Bombista's page 1, which is where the words, the recording, the general information and the
 * tempo are collected — the metadata the skeleton existed to supply.
 */
function NewSong({
  blockedBy,
  describedBy,
  onStart,
}: {
  /** The half's own block — a songs folder that cannot be read — which outranks every other. */
  blockedBy: string | null
  /** Where that reason is already written: the line in the frame below. */
  describedBy: string
  onStart: () => void
}) {
  const songsFolder = getSongFilesFolder()
  const hosted = canRunBombista()

  const cannot =
    blockedBy !== null
      ? blockedBy
      : songsFolder === null
        ? 'There is no songs folder yet, so there is nowhere for a song to land.'
        : !hosted
          ? 'bombista cannot be run from here. Run bombista serve in a terminal — it is fully usable on its own — and come back; Tramoya re-reads the files when you return.'
          : null

  // **The precondition never removes the action.** It disables it and says why — see
  // `GatedAction`. The reason for a blocked half is the line in the frame, written once.
  return (
    <GatedAction
      site="setup-new-song"
      label="New"
      blockedBy={cannot}
      describedBy={blockedBy !== null ? describedBy : undefined}
      onClick={onStart}
    />
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
            ? 'The file is untouched and stays where it is. It is not in Tramoya’s song list, so it cannot be added to a gig.'
            : 'The files are untouched and stay where they are. They are not in Tramoya’s song list, so they cannot be added to a gig.'}
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
 * **A gig whose `gig.json` will not read.**
 *
 * **The unreadable-song rule, applied to gigs** (2026-09-03). Something was claimed to be a gig —
 * there is a `gig.json` in that folder — and it cannot be read, so it is said once and is never a
 * row: a row is a thing you can open, and this cannot be opened. **A folder with no `gig.json` at
 * all is a different thing and says nothing**, because nobody ever called it a gig.
 *
 * The folder's own name is what it is called here, because there is no file to get a label out of.
 */
function UnreadableGigsPopup({
  folders,
  onClose,
}: {
  folders: { folder: string; reason: string }[]
  onClose: () => void
}) {
  if (folders.length === 0) return null
  return (
    <div className="ctrl-timeline-save-overlay" data-testid="setup-gigs-unreadable-popup">
      <div
        className="ctrl-timeline-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Gigs that will not read"
      >
        <p className="ctrl-timeline-save-message" data-testid="setup-gigs-unreadable-title">
          {folders.length === 1 ? 'One gig will not read' : `${folders.length} gigs will not read`}
        </p>
        <ul className="setup-songs-gone-list" data-testid="setup-gigs-unreadable-list">
          {folders.map(({ folder, reason }) => (
            <li key={folder}>
              <code>{folder}</code>:{' '}
              <span className="setup-songs-unreadable-reason">{reason}</span>
            </li>
          ))}
        </ul>
        <p className="ctrl-timeline-save-message" data-testid="setup-gigs-unreadable-note">
          {folders.length === 1
            ? 'The folder is untouched and stays where it is. It is not in the gigs list, so it cannot be opened.'
            : 'The folders are untouched and stay where they are. They are not in the gigs list, so they cannot be opened.'}
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
  | { key: string; kind: 'unreadable-gigs'; folders: { folder: string; reason: string }[] }

export function SetupHomeView() {
  // **The gigs are the folder, read on arrival** (Jorge, 2026-09-03). Empty until the read comes
  // back, which is one tick — never seeded from anything the app remembered, because a remembered
  // list is the thing this replaced.
  const [gigs, setGigs] = useState<string[]>([])
  // **What each gig is called, read from its own file rather than from its path.** Empty until the
  // read comes back, and a row shows its folder's id in the meantime — which is the same fallback
  // a gig whose file will not read keeps for good. Never persisted: a stored label is a label that
  // goes stale the moment a venue is corrected, which is the whole defect this replaced.
  const [gigLabels, setGigLabels] = useState<Map<string, string>>(new Map())
  // **The Songs list is the catalogue, not the library.** Arriving re-reads the folder and this is
  // what that read said; a reference the folder did not list is in `gone`, never in a row, and a
  // file that will not read is in the popup, never in a row either.
  const [songs, setSongs] = useState<LibraryEntry[]>(getCatalogueEntries)
  const [busy, setBusy] = useState(false)
  const [flowProblem, setFlowProblem] = useState<string | null>(null)
  // **What the delete dialog is about**, and null when there is no dialog. `uses` arrives after it
  // opens: the gig files are read on the press, and the dialog is up before that read returns
  // rather than after — an empty pause between a click and a dialog reads as a dropped click.
  const [deleting, setDeleting] = useState<{
    entry: LibraryEntry
    uses: GigUse[] | null
    problem: string | null
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  // **The gig about to be deleted**, and null when there is no dialog. Its own state rather than a
  // shared one: the two dialogs ask different questions about different things, and one variable
  // holding either is a variable whose type is *whichever dialog is up*.
  const [deletingGig, setDeletingGig] = useState<{ path: string; problem: string | null } | null>(
    null
  )
  const [gigDeleteBusy, setGigDeleteBusy] = useState(false)
  // **The standing condition, per half.** True for as long as the folder refuses; what happens once
  // is the popup in the queue below.
  const [songsFolderProblem, setSongsFolderProblem] = useState(false)
  const [gigsFolderProblem, setGigsFolderProblem] = useState(false)
  // **What is news on this arrival**, held apart from the standing sets above because they are a
  // different question: those are conditions, these are the part of each that just changed.
  const [queue, setQueue] = useState<Announcement[]>([])

  /**
   * **Both lists, re-read from their folders.** Every arrival and every action, because that is
   * what makes a gig made in another window, or a song added in a terminal, simply be here.
   *
   * It returns what the gig read found, so the arrival effect can announce the gigs that would not
   * parse and the gigs folder that would not read without asking twice and risking two answers.
   */
  const reload = useCallback(async (): Promise<{
    unreadable: { folder: string; reason: string }[]
    problem: string | null
  }> => {
    setSongs(getCatalogueEntries())
    const gigsRoot = getGigsFolder()
    if (gigsRoot === null) {
      setGigs([])
      setGigLabels(new Map())
      return { unreadable: [], problem: null }
    }
    const listing = await readGigFolders(gigsRoot)
    setGigs(listing.gigs)
    // Read on every reload: the label has to follow an edit made in the gig flow, and coming back
    // here is when it would be seen to have.
    setGigLabels(await readGigLabels(listing.gigs))
    return { unreadable: listing.unreadable, problem: listing.problem }
  }, [])

  // Arriving here is a door, so the files are re-read — the songs folder as well as the gig. Same
  // on-open re-check the rest of the app does, with no watcher and no boundary to police. It is
  // what makes a song added in a terminal, or a folder just chosen in preferences, simply be here.
  useEffect(() => {
    void (async () => {
      await ensureSongLibraryHydrated()
      await refreshGigReadiness()

      // **Both folders, both halves, each through its own list's read.** The songs one comes back
      // through the catalogue listing, which asks about the root before it asks what is in it; the
      // gigs one comes back the same way now that the gigs list is the folder — one read, one
      // answer, rather than a folder check beside a list that could disagree with it.
      const songsRoot = getSongsFolder()
      const gigsRoot = getGigsFolder()
      const songsBad = songsRoot !== null && (await listSongsFolder(songsRoot)).problem !== null
      const gigListing = await reload()
      const gigsBad = gigListing.problem !== null
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

      // **A `gig.json` that will not parse is the unreadable-song case** (2026-09-03). Something
      // *was* claimed to be a gig and cannot be read, so it is said once and is never a row — a
      // row is a thing you can open. A folder with no `gig.json` at all is neither: nobody ever
      // called it a gig, so it is silent.
      const brokenGigs = gigListing.unreadable
      const newlyBrokenGigs = new Set(unreadableGigs.newly(brokenGigs.map((g) => g.folder)))
      if (newlyBrokenGigs.size > 0) {
        news.push({
          key: 'unreadable-gigs',
          kind: 'unreadable-gigs',
          folders: brokenGigs.filter((g) => newlyBrokenGigs.has(g.folder)),
        })
      }
      unreadableGigs.record(brokenGigs.map((g) => g.folder))

      setQueue(news)
    })()
  }, [reload])

  const openFolder = getRememberedGigFolder()
  const canReachFolder = hasGigFolderAccess()

  const run = (action: () => Promise<unknown>) => () => {
    setBusy(true)
    void action().finally(() => {
      setBusy(false)
      void reload()
    })
  }

  const toSetup = () => {
    window.location.hash = '#/gig'
  }

  const outsideElectron = 'A gig folder can only be reached from the desktop app, not from a browser tab.'

  /**
   * **Into the song flow, from either side of it.**
   *
   * `New` passes no song and the flow makes one; a row passes its song and the flow edits it.
   * **They are the same flow** — Bombista's page 1 prefills every field from an SP JSON — and the
   * only thing that differs here is which staging directory it works in. A song being edited keeps
   * its own, so a second pass over the same recording skips the transcription; a new song gets one
   * that is not keyed to anything, because there is no id yet and asking for one is the question
   * this round removed.
   */
  /**
   * **The gigs are read on the press**, not held. An index of which songs are in which setlists
   * would be a second copy of what the gig files say, and this is asked once, at the moment
   * somebody is about to do something irreversible.
   */
  const askToDelete = (entry: LibraryEntry) => {
    setDeleting({ entry, uses: null, problem: null })
    void gigsUsingSong(entry.ref.id).then((uses) => {
      setDeleting((current) => (current?.entry.ref.id === entry.ref.id ? { ...current, uses } : current))
    })
  }

  const confirmDelete = () => {
    if (deleting === null) return
    const entry = deleting.entry
    setDeleteBusy(true)
    void (async () => {
      const result = await deleteSongFile(resolveSongPath(entry.ref.path))
      setDeleteBusy(false)
      if (!result.ok) {
        setDeleting((current) => (current === null ? null : { ...current, problem: result.error }))
        return
      }
      setDeleting(null)
      // The list is the folder, so it is re-read.
      await ensureSongLibraryHydrated()
      // **The app forgets what it deleted, rather than remembering it as missing** (2026-09-02).
      // Hydration never drops a reference, because an unmounted drive looks exactly like a
      // deletion — but this one does not look like anything, the app did it. Left in place, the
      // reference made the next arrival here announce `libertad.json` as no longer in the
      // catalogue, five seconds after the person removed it themselves.
      //
      // **After the re-read and not before**, which is the whole of what makes the rule hold
      // rather than usually hold: hydration seeds references back from the folder, so forgetting
      // first would be undone by a listing that had not caught up with the file leaving it.
      forgetDeletedSong(entry.ref.id)
      void refreshGigReadiness()
      void reload()
    })()
  }

  /**
   * **Trash the gig's folder, and that is the whole of it.**
   *
   * **Nothing is forgotten afterwards, because there is nothing holding it** (2026-09-03). The
   * gigs list is `<gigs>/setup/` re-read on every arrival, exactly as the songs list is
   * `<songs>/song-performance/`, so a folder that has gone simply stops being a row. `forgetGig`
   * and the bookmark list behind it went with that change; a second step to keep a stored list in
   * step with the disk is the whole class of defect this replaced.
   *
   * **An open gig is closed first**, because the alternative is a session pointed at a folder in
   * the Trash.
   */
  const confirmDeleteGig = () => {
    if (deletingGig === null) return
    const path = deletingGig.path
    setGigDeleteBusy(true)
    void (async () => {
      if (path === getRememberedGigFolder()) await closeGig()
      const result = await deleteGigFolder(path)
      setGigDeleteBusy(false)
      if (!result.ok) {
        setDeletingGig((current) => (current === null ? null : { ...current, problem: result.error }))
        return
      }
      setDeletingGig(null)
      await refreshGigReadiness()
      void reload()
    })()
  }

  const enterSongFlow = (entry: LibraryEntry | null) => {
    setBusy(true)
    void (async () => {
      const key = entry === null ? '_new' : entry.ref.id
      const staging = await bombistaStagingDir(key)
      setBusy(false)
      if (staging === null) {
        setFlowProblem('Could not name a working directory for the song flow.')
        return
      }
      setSongFlowRequest({
        staging,
        // A second before now: file modification times are coarser than this clock, and a file
        // written in the same tick as the flow started must not read as older than it.
        startedAt: Date.now() - 1000,
        songPath: entry === null ? null : resolveSongPath(entry.ref.path),
        title: entry === null ? 'New song' : (entry.song?.title ?? entry.ref.id),
      })
      window.location.hash = '#/song'
    })()
  }
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
      {showing?.kind === 'unreadable-gigs' && (
        <UnreadableGigsPopup folders={showing.folders} onClose={closeTop} />
      )}
      {/* The consent dialog is not in the queue: the queue is what the app has to say on arrival,
          and this is the answer to a press that has just happened. */}
      {deleting !== null && (
        <DeleteSongPopup
          title={deleting.entry.song?.title ?? deleting.entry.ref.id}
          file={basename(deleting.entry.ref.path)}
          uses={deleting.uses}
          busy={deleteBusy}
          problem={deleting.problem}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
      {deletingGig !== null && (
        <DeleteGigPopup
          name={gigLabels.get(deletingGig.path) ?? basename(deletingGig.path)}
          folder={deletingGig.path}
          open={deletingGig.path === openFolder}
          busy={gigDeleteBusy}
          problem={deletingGig.problem}
          onCancel={() => setDeletingGig(null)}
          onConfirm={confirmDeleteGig}
        />
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
            {/* **`New` is on its own now, and `Import` is dropped** (Jorge, 2026-09-02). Import
                meant *point at a gig folder elsewhere*, and under the ruling that the tools own one
                `setup/` folder inside the gigs folder there are no gig folders to point at. It is
                not a button waiting to come back. */}
            <div className="setup-home-actions">
              {/* **New gig asks nothing about the filesystem.** It used to open a directory picker,
                  and then a name field whose answer was a folder name; both were the same mistake
                  in different clothes. It goes to the gig flow's first screen, which asks for the
                  date and the venue and derives the rest. */}
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
                      label={gigLabels.get(path) ?? basename(path)}
                      busy={busy}
                      onOpen={run(async () => {
                        await openGigFolder(path)
                        toSetup()
                      })}
                      onDelete={() => setDeletingGig({ path, problem: null })}
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
                onStart={() => enterSongFlow(null)}
              />
            </div>
            {flowProblem !== null && (
              <p className="setup-song-problem" data-testid="setup-song-flow-problem">
                {flowProblem}
              </p>
            )}
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
                      busy={busy}
                      onOpen={() => enterSongFlow(entry)}
                      onDelete={() => askToDelete(entry)}
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
