import { useEffect, useMemo, useState } from 'react'
import {
  closeGig,
  confirmSetup,
  publishSetlistToGig,
  refreshGigReadiness,
  saveGigIdentity,
} from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { hasGigFolderAccess } from './platform'
import { useBroadcastVisuals } from './visualsBroadcast'
import { shapeTypeOf, shapeIsVisible, type VisualShape } from './visualsFile'
import { currentStep, flowSteps, type FlowStep } from './setupFlow'
import { SongDoors, SONG_INPUT_RULE, type SongDoor } from './SongDoors'
import { setSongFlowRequest } from './songFlowState'
import { bombistaStagingDir } from './platform'
import { MuralistaDoor } from './MuralistaDoor'
import { resolveSongPath } from './contentFolders'
import type { GigReadiness, SongReadiness, StepStatus } from './gigReadiness'
import {
  addSongToSetlist,
  getActiveSetlistId,
  getCatalogueEntries,
  getLibraryEntries,
  getOrderedEntriesForActiveSetlist,
  moveSongInSetlist,
  removeSongFromSetlist,
} from './setlistStore'

/**
 * **The setup flow** — the guided path through the six ordered steps, and the third and fourth
 * views of the one readiness delta: *you are here, this is what is missing*, with a forward button
 * that greys.
 *
 * **Everything on this screen is `computeGigReadiness` rendered.** Nothing here decides whether
 * anything is ready. The ordering and the gating are `setupFlow.ts`, which is also pure.
 *
 * **The block is on the guided path and nowhere else.** This screen never refuses to open, parse or
 * display a half-built gig — the gig file exists from step 2 and being incomplete is its normal
 * state — so every step stays readable, every song stays listed, and only *moving on* is held.
 *
 * **The escape hatch is said out loud on every step that is not done.** One sentence naming the
 * tool that owns the work. It is what makes strict blocking affordable: each tool is fully usable
 * on its own by requirement, so the blocked path is never the only path. Pregonero owns the flow,
 * not the capability.
 */

const STATUS_LABEL: Record<StepStatus, string> = {
  complete: 'Done',
  'not-yet': 'Not yet',
  broken: 'Broken',
}

import { RIG_CHECKLIST } from './rigChecklist'

function StepRow({
  step,
  here,
  onSelect,
}: {
  step: FlowStep
  here: boolean
  onSelect: () => void
}) {
  return (
    <li
      className={`gig-step gig-step-${step.status}${here ? ' gig-step-here' : ''}`}
      data-testid={`gig-step-${step.step}`}
    >
      <button type="button" className="gig-step-select" onClick={onSelect} aria-current={here}>
        <span className="gig-step-name">
          {step.step}. {step.name}
        </span>
      </button>
      <span className="gig-step-status">{STATUS_LABEL[step.status]}</span>
      {step.missing.length > 0 && (
        <ul className="gig-step-missing">
          {step.missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {step.notes.length > 0 && (
        <ul className="gig-step-notes">
          {step.notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * What is behind each door.
 *
 * **The song door is Bombista, the visuals door is Muralista**, and hosting them changes where the
 * window is rather than who writes what. Neither passes data to a running process: Bombista is
 * handed a file path and its exit code is read, Muralista writes `visuals.json` and Pregonero reads
 * it on the next open. **The file is the only channel.**
 */
function DoorBody({
  door,
  songId,
  songPath,
}: {
  door: SongDoor
  songId: string
  songPath: string | null
}) {
  if (door === 'song') {
    // **The song flow is one flow, and it is not in half of a screen** (2026-09-02, step 6). This
    // door held a copy of it — two pickers and three `bombista` calls laid out beside the setlist.
    // It now goes to the same screen `New` and a Backstage row go to, which is Bombista's own
    // three pages inside Pregonero's window. **This door is not step 6's work**; what step 6 owes
    // it is not leaving a second implementation behind.
    return (
      <div data-testid="door-body-song">
        <p className="gig-hint">{SONG_INPUT_RULE}</p>
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid={`door-song-open-${songId}`}
          onClick={() => {
            void (async () => {
              const staging = await bombistaStagingDir(songId)
              if (staging === null) return
              setSongFlowRequest({
                staging,
                startedAt: Date.now() - 1000,
                songPath,
                title: songId,
              })
              window.location.hash = '#/song'
            })()
          }}
        >
          Open the song flow
        </button>
        {/* **The Translations note is not here any more** (2026-09-02). It lodged in this door
            for three rounds because the song flow had no Pregonero surface to put it on. It has
            one now — the line under the flow's own page — and a second copy on a screen where no
            song is being made would be the two-descriptions-that-drift shape. */}
      </div>
    )
  }
  return <MuralistaDoor />
}

function SongRow({
  songId,
  title,
  songPath,
  children,
}: {
  songId: string
  title: string
  songPath: string | null
  children?: React.ReactNode
}) {
  return (
    <li className="setup-song" data-testid={`setup-song-${songId}`}>
      <span className="setup-song-title">{title}</span>
      {children}
      <SongDoors
        songId={songId}
        title={title}
        renderDoor={(door) => (
          <DoorBody door={door} songId={songId} songPath={songPath} />
        )}
      />
    </li>
  )
}

/** The gig's date and venue once it exists. Its name is its folder's, and is not editable here. */
function GigIdentityForm({
  readiness,
  busy,
  onSave,
}: {
  readiness: GigReadiness
  busy: boolean
  onSave: (identity: { date: string; venue: { name: string; city: string } }) => void
}) {
  const [venue, setVenue] = useState(readiness.venue?.name ?? '')
  const [city, setCity] = useState(readiness.venue?.city ?? '')
  const [date, setDate] = useState(readiness.date ?? '')

  return (
    <div data-testid="setup-body-1">
      <dl className="setup-facts">
        <dt>Name</dt>
        <dd data-testid="setup-gig-name-fixed">{readiness.gigId ?? 'Unnamed gig'}</dd>
      </dl>
      <p className="gig-hint">
        The name is the folder’s name, and a gig is never renamed from in here:{' '}
        <code>visuals.json</code> records which gig it maps and is checked against this.
      </p>
      <label className="setup-home-field">
        <span>Venue</span>
        <input
          type="text"
          value={venue}
          data-testid="setup-gig-venue-input"
          onChange={(e) => setVenue(e.target.value)}
        />
      </label>
      <label className="setup-home-field">
        <span>City</span>
        <input
          type="text"
          value={city}
          data-testid="setup-gig-city-input"
          onChange={(e) => setCity(e.target.value)}
        />
      </label>
      <label className="setup-home-field">
        <span>Date</span>
        <input
          type="date"
          value={date}
          data-testid="setup-gig-date-input"
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid="setup-save-gig"
          disabled={busy}
          onClick={() => onSave({ date, venue: { name: venue, city } })}
        >
          Save
        </button>
      </div>
    </div>
  )
}

/**
 * **Step 2: the setlist, as two tables.** This gig's running order on the left, the rest of the
 * library on the right.
 *
 * **A song that Bombista refuses stays here, named, and does not hold the flow.** That is the whole
 * point of this round: the six-step version pushed every `bombista:` finding into this step's
 * blockers, so a setlist holding `libertad` greyed the forward button on a screen that cannot
 * repair a song. The finding is reported here and the repair is one screen away, in the song's own
 * door on Setup home.
 */
function StepSetlist({
  readiness,
  busy,
  onChange,
}: {
  readiness: GigReadiness
  busy: boolean
  onChange: () => void
}) {
  const setlistId = getActiveSetlistId()
  const inSetlist = getOrderedEntriesForActiveSetlist()
  const chosen = new Set(inSetlist.map((entry) => entry.ref.id))
  // **The catalogue, not the library** — this table says *you can use this*, and a song whose file
  // has left the folder cannot be used. The table beside it is the opposite kind of list: the
  // setlist keeps its ids and reports what it cannot resolve, because it is the record of a
  // decision about a night and deleting a song must not rewrite it.
  const library = getCatalogueEntries().filter((entry) => !chosen.has(entry.ref.id))
  const noteFor = (songId: string) =>
    readiness.songs.find((song) => song.songId === songId)?.notes ?? []

  return (
    <div className="setup-setlist" data-testid="setup-body-2">
      <div className="setup-setlist-tables">
        <section className="setup-setlist-table" data-testid="setup-setlist-chosen">
          <h3 className="gig-section-title">This gig, in order</h3>
          {inSetlist.length === 0 ? (
            <p className="gig-empty" data-testid="setup-setlist-empty">
              Nothing in it yet. Add a song from the library beside it.
            </p>
          ) : (
            <ol className="setup-setlist-rows">
              {inSetlist.map((entry, index) => (
                <li key={entry.ref.id} data-testid={`setup-setlist-row-${entry.ref.id}`}>
                  <span className="setup-song-title">{entry.song?.title ?? entry.ref.id}</span>
                  <div className="setup-home-row-actions">
                    <button
                      type="button"
                      className="ctrl-btn ctrl-setup-link"
                      disabled={busy || index === 0}
                      aria-label={`Move ${entry.song?.title ?? entry.ref.id} earlier`}
                      onClick={() => {
                        moveSongInSetlist(setlistId, entry.ref.id, 'up')
                        onChange()
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ctrl-btn ctrl-setup-link"
                      disabled={busy || index === inSetlist.length - 1}
                      aria-label={`Move ${entry.song?.title ?? entry.ref.id} later`}
                      onClick={() => {
                        moveSongInSetlist(setlistId, entry.ref.id, 'down')
                        onChange()
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ctrl-btn ctrl-setup-link"
                      disabled={busy}
                      data-testid={`setup-setlist-remove-${entry.ref.id}`}
                      onClick={() => {
                        removeSongFromSetlist(setlistId, entry.ref.id)
                        onChange()
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {!entry.song && (
                    <span className="setup-song-problem">{entry.error ?? 'Will not read.'}</span>
                  )}
                  {noteFor(entry.ref.id).length > 0 && (
                    <ul className="gig-step-notes" data-testid={`setup-setlist-note-${entry.ref.id}`}>
                      {noteFor(entry.ref.id).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="setup-setlist-table" data-testid="setup-setlist-library">
          <h3 className="gig-section-title">The library</h3>
          {library.length === 0 ? (
            <p className="gig-empty" data-testid="setup-setlist-library-empty">
              {chosen.size === 0
                ? 'No songs yet. Songs are made on the Setup screen, where they are gig-independent and last for years.'
                : 'Every song in the library is in this gig.'}
            </p>
          ) : (
            <ul className="setup-setlist-rows">
              {library.map((entry) => (
                <li key={entry.ref.id} data-testid={`setup-library-row-${entry.ref.id}`}>
                  <span className="setup-song-title">{entry.song?.title ?? entry.ref.id}</span>
                  <button
                    type="button"
                    className="ctrl-btn ctrl-setup-link"
                    disabled={busy}
                    data-testid={`setup-setlist-add-${entry.ref.id}`}
                    onClick={() => {
                      addSongToSetlist(setlistId, entry.ref.id)
                      onChange()
                    }}
                  >
                    Add
                  </button>
                  {!entry.song && (
                    <span className="setup-song-problem">{entry.error ?? 'Will not read.'}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="gig-hint">
        The running order lives in <code>gig.json</code> and is what this app performs. Changing it
        here writes the file; changing the file changes what is performed.{' '}
        <strong>A song Bombista has a finding about stays in the list and is named</strong> — it is
        fixed in its own door, on the Setup screen, not here.
      </p>
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid="setup-manage-setlists"
          onClick={() => {
            window.location.hash = '#/songs/manage-setlists'
          }}
        >
          Manage setlists
        </button>
      </div>
    </div>
  )
}

function shapeLabel(shape: VisualShape): string {
  return `${shape.name ?? shape.id} — ${shapeTypeOf(shape)}`
}

/**
 * **Step 3: the visuals, in two parts — and one of them is optional.**
 *
 * The gig's own shapes are required: every song needs a lyrics shape unless it names its own. The
 * songs that deviate are not, and **the common case is a song that is fully set up by doing nothing
 * at all**. That split used to be two steps with the second listed in `OPTIONAL_STEPS`; it is one
 * step now, and the optionality is carried by the delta — required work in `missing`, the rest in
 * `notes` — so nothing on this screen has to know which half is which.
 */
function StepVisuals({ songs }: { songs: readonly SongReadiness[] }) {
  const visuals = useBroadcastVisuals()
  const shapes = (visuals?.shapes ?? []).filter(shapeIsVisible)

  // The setlist's own rows, so a song's door hands Bombista the file this machine actually reads.
  const songPaths: Record<string, string> = {}
  for (const entry of getLibraryEntries()) {
    songPaths[entry.ref.id] = resolveSongPath(entry.ref.path)
  }
  const deviating = songs.filter((song) => !song.ready)

  return (
    <div data-testid="setup-body-3">
      <section className="setup-visuals-half">
        <h3 className="gig-section-title">The gig’s shapes</h3>
        {shapes.length === 0 ? (
          <p className="gig-empty" data-testid="setup-no-shapes">
            No room mapped yet. Shapes and their types are authored in Muralista, at the wall, which
            is the only place those decisions can honestly be made.
          </p>
        ) : (
          <ul className="setup-shapes" data-testid="setup-shapes">
            {shapes.map((shape) => (
              <li key={shape.id}>{shapeLabel(shape)}</li>
            ))}
          </ul>
        )}
        <MuralistaDoor scope="gig" />
      </section>

      <section className="setup-visuals-half" data-testid="setup-song-visuals">
        <h3 className="gig-section-title">Songs that deviate</h3>
        <p className="gig-hint">
          <strong>Most songs need nothing here.</strong> A song with no visual setup of its own uses
          the gig-level shapes, which already carry the lyrics and intro every song needs — so the
          common case is a song that is fully set up by doing nothing at all, and this half never
          holds the flow.
        </p>
        {songs.length === 0 ? (
          <p className="gig-empty">This gig has no setlist yet.</p>
        ) : deviating.length === 0 ? (
          <p className="gig-hint" data-testid="setup-no-deviating">
            No song in this setlist deviates. There is nothing to do here.
          </p>
        ) : (
          <ul className="setup-songs">
            {deviating.map((song) => (
              <SongRow
                key={song.songId}
                songId={song.songId}
                title={song.title}
                songPath={songPaths[song.songId] ?? null}
              >
                {song.missing.length > 0 && (
                  <span className="setup-song-problem">{song.missing.join('; ')}</span>
                )}
              </SongRow>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * **The rig is a checklist, deliberately not a data model.** Camera, projector, second display,
 * audio. Nothing here is stored and nothing reaches `gig.json`: a hardware field rots the first
 * time the gig is reused for another room.
 */
function RigChecklist({ testId }: { testId: string }) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  return (
    <div className="setup-rig" data-testid={testId}>
      <ul>
        {RIG_CHECKLIST.map((item) => (
          <li key={item}>
            <label>
              <input
                type="checkbox"
                checked={ticked[item] === true}
                onChange={(e) => setTicked((t) => ({ ...t, [item]: e.target.checked }))}
              />
              {item}
            </label>
          </li>
        ))}
      </ul>
      <p className="gig-hint">
        Nothing here is saved, and none of it reaches <code>gig.json</code>. It is a list to read in
        the room, not a model of the room.
      </p>
    </div>
  )
}

/**
 * **Step 4: setup confirmed — a milestone, not a lock.**
 *
 * It blocks nothing and freezes nothing. Arming an unconfirmed gig warns; it never refuses, and the
 * hard gate stays per-song completeness, which is a different thing.
 *
 * **He confirms against evidence, never blindly.** The completeness results and the rig checklist
 * are on this screen, above the button. A confirm button with nothing to read above it is theatre.
 *
 * **It records that the checks passed — never a warp matrix, a layout or a pixel size.** Save the
 * recipe, not the cake: setting up at the venue with the projector attached does not change that,
 * because the window can still move and `docs/warp-contract.md` is binding regardless.
 *
 * **"Readiness at the venue" is not a step any more, it is this step's instruction.** As a step of
 * its own it discovered nothing and owned no work — everything it re-checked had already been
 * checked by the step that could act on it. What was real about it is here: you are standing in the
 * room, the rig is in front of you, and the projection wants recalibrating against the actual wall
 * before you say yes.
 */
function StepConfirm({
  readiness,
  onConfirm,
  onReview,
  onBackToVisuals,
  busy,
}: {
  readiness: GigReadiness
  onConfirm: () => void
  onReview: () => void
  onBackToVisuals: () => void
  busy: boolean
}) {
  const blocked = readiness.songs.filter((song) => !song.ready)
  const earlier = readiness.steps.filter((s) => s.step < 4)
  const checksPass = earlier.every((s) => s.status === 'complete')
  const confirmation = readiness.confirmation

  return (
    <div data-testid="setup-body-4">
      <p className="gig-hint" data-testid="setup-recalibrate">
        <strong>Do this standing in the room.</strong> Put the projection on the wall and look at
        the edges: if the image has moved off the surfaces you mapped, go back and drag the corners
        until it sits on them again. Everything below was checked against the files; only you can
        check it against the wall.
      </p>
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid="setup-back-to-visuals"
          disabled={busy}
          onClick={onBackToVisuals}
        >
          Back to the visuals
        </button>
      </div>

      <section className="setup-evidence" data-testid="setup-evidence">
        <h3 className="gig-section-title">What is true right now</h3>
        <ul>
          {earlier.map((s) => (
            <li key={s.step}>
              {s.step}. {s.name} — {STATUS_LABEL[s.status]}
            </li>
          ))}
        </ul>
        <p className={blocked.length === 0 ? 'gig-hint' : 'setup-song-problem'}>
          {blocked.length === 0
            ? 'Every song in the setlist can be armed.'
            : `${blocked.length} song${blocked.length === 1 ? '' : 's'} cannot be armed: ${blocked
                .map((song) => song.title)
                .join(', ')}.`}
        </p>
      </section>

      <RigChecklist testId="setup-rig" />

      {confirmation === null ? (
        <p className="gig-hint" data-testid="setup-confirmation-state">
          Setup has not been confirmed for this gig. Arming warns about that; it does not refuse.
        </p>
      ) : confirmation.stale ? (
        <div className="setup-lapsed" data-testid="setup-confirmation-lapsed">
          <p>
            Setup was confirmed on {confirmation.confirmedAt}, and has <strong>lapsed</strong>:
          </p>
          <ul>
            {confirmation.moved.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="gig-hint" data-testid="setup-confirmation-state">
          Setup was confirmed on {confirmation.confirmedAt}, and everything it was confirmed against
          is still as it was.
        </p>
      )}

      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid="setup-confirm"
          disabled={busy || !checksPass}
          title={checksPass ? undefined : 'The checks above have to pass first.'}
          onClick={onConfirm}
        >
          {confirmation === null
            ? 'Confirm setup and go to the control view'
            : 'Confirm setup again and go to the control view'}
        </button>
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          data-testid="setup-review"
          disabled={busy}
          onClick={onReview}
        >
          Review setup
        </button>
      </div>
      <p className="gig-hint">
        Confirming records that these checks passed and what they passed against — the song files,
        the room, the displays. It never records a matrix, a layout or a pixel size, and it blocks
        nothing. It is also the way out of setup: the confirmation is written and the app lands on
        the control view, which is where the gig is performed from. <strong>Review setup</strong> goes back to the first step with everything as it is;
        nothing is ever retyped, because nothing was typed, and re-entering re-checks the files.
      </p>
    </div>
  )
}

function StepBody({
  step,
  readiness,
  onConfirm,
  onReview,
  onSaveIdentity,
  onSetlistChanged,
  onBackToVisuals,
  busy,
}: {
  step: number
  readiness: GigReadiness
  onConfirm: () => void
  onReview: () => void
  onSaveIdentity: (identity: { date: string; venue: { name: string; city: string } }) => void
  onSetlistChanged: () => void
  onBackToVisuals: () => void
  busy: boolean
}) {
  if (step === 1) {
    // **Making a gig is the flow's, not this screen's** (2026-09-02). `New gig` used to open a
    // form here — a name field whose answer was a folder name — and a gig is named by its date and
    // its venue now, on the flow's own first screen. With no gig open there is nothing for this
    // screen to be about.
    return readiness.folderPath === null ? (
      <p className="gig-empty" data-testid="setup-body-1">
        No gig open. Gigs are made and their setlists chosen in the gig flow, on Backstage.
      </p>
    ) : (
      <GigIdentityForm
        // Remounted per gig, so switching gigs re-reads rather than keeping the last gig's fields.
        key={readiness.gigId ?? readiness.folderPath}
        readiness={readiness}
        busy={busy}
        onSave={onSaveIdentity}
      />
    )
  }
  if (step === 2) return <StepSetlist readiness={readiness} busy={busy} onChange={onSetlistChanged} />
  if (step === 3) return <StepVisuals songs={readiness.songs} />
  return (
    <StepConfirm
      readiness={readiness}
      onConfirm={onConfirm}
      onReview={onReview}
      onBackToVisuals={onBackToVisuals}
      busy={busy}
    />
  )
}

export function GigView() {
  const readiness = useGigReadiness()
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  // Re-read on open. Not a watcher: the reload boundary is right before doors and wrong mid-song,
  // and arriving on this screen is trivially not mid-song.
  useEffect(() => {
    void refreshGigReadiness()
  }, [])

  const steps = useMemo(() => flowSteps(readiness), [readiness])
  // **Derived, never stored.** "You got to step 4" as a flag would diverge the first time work
  // happened outside Pregonero, and would diverge silently.
  const here = selected ?? currentStep(readiness)
  const step = steps.find((s) => s.step === here) ?? steps[0]!

  const run = (action: () => Promise<unknown>) => () => {
    setBusy(true)
    void action().finally(() => setBusy(false))
  }

  /**
   * **Review setup returns to step 1 of four.** It used to return to step 2 of six, to skip the
   * library step in front of it; there is no library step in front of it now, and the first step
   * is the gig itself.
   *
   * Nothing is retyped. The date and the venue are read out of `gig.json`, and every other step is
   * derived from files, so "prefilled" is what this flow always is. **Re-entering re-checks**,
   * which is the same on-open re-read the rest of the app does — no watcher, no boundary to police.
   */
  const reviewSetup = () => {
    setSelected(1)
    setBusy(true)
    void refreshGigReadiness().finally(() => setBusy(false))
  }

  /**
   * **Confirming is the exit from setup.** The walk is *confirm, and land back on the control
   * view*; this used to write the confirmation and stay on step 4, leaving the walker to find
   * `Back` for themselves — a navigation nobody names, at the one point where the flow is over.
   *
   * **It leaves only if the confirmation was actually recorded.** A failed write keeps you here,
   * in front of the problem: navigating away would report success by arriving somewhere.
   */
  const confirmSetupAndLeave = () => {
    setBusy(true)
    void confirmSetup()
      .then((next) => {
        if (next.confirmation !== null && !next.confirmation.stale) {
          window.location.hash = '#/'
        }
      })
      .finally(() => setBusy(false))
  }

  /** A setlist edit is a write to `gig.json`, and it is what makes step 2 mean anything. */
  const setlistChanged = () => {
    setBusy(true)
    void publishSetlistToGig().finally(() => setBusy(false))
  }

  const canReachFolder = hasGigFolderAccess()

  return (
    <div className="songs-screen gig-screen">
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
            disabled={busy}
            onClick={run(refreshGigReadiness)}
          >
            Re-check
          </button>
        </div>
      </header>

      <main className="songs-body gig-body">
        <section className="gig-identity">
          {readiness.folderPath === null ? (
            <p className="gig-empty" data-testid="gig-none">
              No gig open. Gigs are made in the gig flow, from Backstage. Pregonero keeps every
              gig’s data in one <code>setup</code> folder inside your gigs folder and{' '}
              <strong>touches nothing else in there</strong> — the poster, the contract and the
              stage plan stay yours.
            </p>
          ) : (
            <>
              <p className="gig-id" data-testid="gig-id">
                {readiness.gigId ?? 'Unnamed gig'}
              </p>
              <p className="gig-folder" data-testid="gig-folder">
                {readiness.folderPath}
              </p>
            </>
          )}
          <div className="gig-actions">
            {/* **`Import` is dropped** (2026-09-02). It meant *point at a gig folder elsewhere*,
                and under the ruling that the tools own one `setup/` folder inside the gigs folder
                there are no gig folders to point at. It is not a button waiting to come back. */}
            {!canReachFolder && (
              <p className="gig-empty">A gig folder can only be opened from the desktop app.</p>
            )}
            {readiness.folderPath !== null && (
              <button
                type="button"
                className="ctrl-btn ctrl-setup-link"
                disabled={busy}
                onClick={run(closeGig)}
              >
                Close gig
              </button>
            )}
          </div>
        </section>

        {readiness.adoption !== null && (
          <section className="gig-adoption" data-testid="gig-adoption">
            <h2 className="gig-section-title">The running order</h2>
            {readiness.adoption.direction === 'adopted' ? (
              <p>
                <code>gig.json</code> states the running order, so it is the one this app performs.
                {readiness.adoption.displaced.length > 0 && (
                  <> The order held here before ({readiness.adoption.displaced.join(', ')}) was replaced.</>
                )}
              </p>
            ) : (
              <p>
                The running order in <code>gig.json</code> had been changed outside Pregonero (
                {readiness.adoption.displaced.join(', ')}) and has been replaced by the one edited
                here.
              </p>
            )}
            <p className="gig-now" data-testid="gig-adoption-now">
              Now: {readiness.adoption.now.join(', ') || '(empty)'}
            </p>
            {readiness.adoption.unresolved.length > 0 && (
              <p className="gig-hint" data-testid="gig-adoption-unresolved">
                Named in the setlist with no file this machine knows:{' '}
                {readiness.adoption.unresolved.join(', ')}. Put them in your catalogue’s{' '}
                <code>song-performance</code> folder, or give each one a <code>file</code> in{' '}
                <code>gig.json</code>.
              </p>
            )}
          </section>
        )}

        {readiness.refusals.length > 0 && (
          <section className="gig-refusals" role="alert" data-testid="gig-refusals">
            <h2 className="gig-section-title">Refused</h2>
            <ul>
              {readiness.refusals.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="gig-hint">
              Nothing here is repaired automatically. Fix it where it is written — the room is
              Muralista’s file, the gig is this one.
            </p>
          </section>
        )}

        <section className="gig-steps">
          <h2 className="gig-section-title">Setup</h2>
          <ul>
            {steps.map((s) => (
              <StepRow
                key={s.step}
                step={s}
                here={s.step === here}
                onSelect={() => setSelected(s.step)}
              />
            ))}
          </ul>
          <p className="gig-hint">
            A step that is not yet done is not a fault. Gig visuals are mapped in Muralista, which
            you can open on its own at any time and come back.
          </p>
        </section>

        <section className="setup-step-page" data-testid="setup-step-page">
          <h2 className="gig-section-title" data-testid="setup-step-title">
            {step.step}. {step.name}
          </h2>
          <p className="gig-hint">{step.purpose}</p>

          <StepBody
            step={step.step}
            readiness={readiness}
            busy={busy}
            onConfirm={confirmSetupAndLeave}
            onReview={reviewSetup}
            onSaveIdentity={(identity) => run(() => saveGigIdentity(identity))()}
            onSetlistChanged={setlistChanged}
            onBackToVisuals={() => setSelected(3)}
          />

          {step.escapeHatch !== null && (
            <p className="setup-escape-hatch" data-testid="setup-escape-hatch">
              {step.escapeHatch}
            </p>
          )}

          <div className="setup-nav">
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="setup-back"
              disabled={step.step <= 1}
              onClick={() => setSelected(step.step - 1)}
            >
              Back a step
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="setup-forward"
              disabled={!step.canGoForward}
              title={step.blockedReason ?? undefined}
              onClick={() => setSelected(step.step + 1)}
            >
              Next step
            </button>
          </div>
          {step.blockedReason !== null && (
            <p className="setup-blocked" data-testid="setup-blocked">
              {step.blockedReason}
            </p>
          )}
        </section>

        {readiness.folderPath !== null && (
          <section className="gig-songs">
            <h2 className="gig-section-title">Songs</h2>
            {readiness.songs.length === 0 ? (
              <p className="gig-empty">This gig has no setlist yet.</p>
            ) : (
              <ul>
                {readiness.songs.map((song) => (
                  <li
                    key={song.songId}
                    className={`gig-song ${song.ready ? 'gig-song-ready' : 'gig-song-blocked'}`}
                    data-testid={`gig-song-${song.songId}`}
                  >
                    <span className="gig-song-title">{song.title}</span>
                    <span className="gig-song-status">
                      {song.ready ? 'Ready' : 'Cannot be armed'}
                    </span>
                    {song.missing.length > 0 && (
                      <ul className="gig-song-missing">
                        {song.missing.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {song.notes.length > 0 && (
                      <ul className="gig-song-notes">
                        {song.notes.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {readiness.validationSkipped && (
              <p className="gig-hint" data-testid="gig-validation-skipped">
                <code>bombista</code> was not run, so no song carries its verdict. That is a missing
                check, not a failed one.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
