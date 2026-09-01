import { useEffect, useMemo, useState } from 'react'
import { chooseGigFolder, closeGig, confirmSetup, refreshGigReadiness } from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { hasGigFolderAccess } from './platform'
import { useBroadcastVisuals } from './visualsBroadcast'
import { shapeTypeOf, shapeIsVisible, type VisualShape } from './visualsFile'
import { currentStep, flowSteps, type FlowStep } from './setupFlow'
import { SongDoors, SONG_INPUT_RULE, type SongDoor } from './SongDoors'
import { SongSubflow } from './SongSubflow'
import { MuralistaDoor } from './MuralistaDoor'
import { resolveSongPath } from './contentFolders'
import type { GigReadiness, SongReadiness, StepStatus } from './gigReadiness'
import { getLibraryEntries } from './setlistStore'
import { hasLyricLines } from './songState'

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
  skeleton,
}: {
  door: SongDoor
  songId: string
  songPath: string | null
  skeleton: boolean
}) {
  if (door === 'song') {
    return (
      <div data-testid="door-body-song">
        <p className="gig-hint">
          Everything inside a song file is <strong>Bombista’s</strong> — the words, the timeline, the
          tempo, the media it names. Pregonero reads them and writes none of them.
        </p>
        <SongSubflow songId={songId} songPath={songPath} skeleton={skeleton} />
      </div>
    )
  }
  return <MuralistaDoor />
}

function SongRow({
  songId,
  title,
  songPath,
  skeleton = false,
  children,
}: {
  songId: string
  title: string
  songPath: string | null
  /** The song file is there but carries no words yet. See `SongSubflow`. */
  skeleton?: boolean
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
          <DoorBody door={door} songId={songId} songPath={songPath} skeleton={skeleton} />
        )}
      />
    </li>
  )
}

function StepOne() {
  const entries = getLibraryEntries()
  return (
    <div data-testid="setup-body-1">
      <p className="gig-hint">{SONG_INPUT_RULE}</p>
      {entries.length === 0 ? (
        <p className="gig-empty">No songs in the library yet.</p>
      ) : (
        <ul className="setup-songs">
          {entries.map((entry) => (
            <SongRow
              key={entry.ref.id}
              songId={entry.ref.id}
              title={entry.song?.title ?? entry.ref.id}
              songPath={resolveSongPath(entry.ref.path)}
              skeleton={entry.song !== undefined && !hasLyricLines(entry.song)}
            >
              {!entry.song && (
                <span className="setup-song-problem">{entry.error ?? 'Will not read.'}</span>
              )}
            </SongRow>
          ))}
        </ul>
      )}
    </div>
  )
}

function StepTwo({ readiness }: { readiness: GigReadiness }) {
  return (
    <div data-testid="setup-body-2">
      <dl className="setup-facts">
        <dt>Date</dt>
        <dd data-testid="setup-gig-date">{readiness.date ?? 'Not set'}</dd>
        <dt>Venue</dt>
        <dd data-testid="setup-gig-venue">{readiness.venue?.name ?? 'Not set'}</dd>
        <dt>Setlist</dt>
        <dd data-testid="setup-gig-setlist">
          {readiness.songs.length === 0
            ? 'Empty'
            : readiness.songs.map((song) => song.title).join(', ')}
        </dd>
      </dl>
      <p className="gig-hint">
        The running order lives in <code>gig.json</code> and is what this app performs. Changing it
        here writes the file; changing the file changes what is performed.
      </p>
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn ctrl-setup-link"
          onClick={() => {
            window.location.hash = '#/songs/manage-setlists'
          }}
        >
          Edit the setlist
        </button>
      </div>
    </div>
  )
}

function shapeLabel(shape: VisualShape): string {
  return `${shape.name ?? shape.id} — ${shapeTypeOf(shape)}`
}

function StepThree() {
  const visuals = useBroadcastVisuals()
  const shapes = (visuals?.shapes ?? []).filter(shapeIsVisible)
  return (
    <div data-testid="setup-body-3">
      {shapes.length === 0 ? (
        <p className="gig-empty" data-testid="setup-no-shapes">
          No room mapped yet. Shapes and their types are authored in Muralista, at the wall, which is
          the only place those decisions can honestly be made.
        </p>
      ) : (
        <ul className="setup-shapes" data-testid="setup-shapes">
          {shapes.map((shape) => (
            <li key={shape.id}>{shapeLabel(shape)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StepFour({ songs }: { songs: readonly SongReadiness[] }) {
  // The setlist's own rows, so a song's door hands Bombista the file this machine actually reads.
  const songPaths: Record<string, string> = {}
  const skeletons = new Set<string>()
  for (const entry of getLibraryEntries()) {
    songPaths[entry.ref.id] = resolveSongPath(entry.ref.path)
    if (entry.song !== undefined && !hasLyricLines(entry.song)) skeletons.add(entry.ref.id)
  }
  return (
    <div data-testid="setup-body-4">
      <p className="gig-hint">
        Most songs need nothing here. A song with no visual setup of its own uses the gig-level
        shapes, which already carry the lyrics and intro every song needs — so the common case is a
        song that is fully set up by doing nothing at all.
      </p>
      {songs.length === 0 ? (
        <p className="gig-empty">This gig has no setlist yet.</p>
      ) : (
        <ul className="setup-songs">
          {songs.map((song) => (
            <SongRow
              key={song.songId}
              songId={song.songId}
              title={song.title}
              songPath={songPaths[song.songId] ?? null}
              skeleton={skeletons.has(song.songId)}
            >
              {song.missing.length > 0 && (
                <span className="setup-song-problem">{song.missing.join('; ')}</span>
              )}
            </SongRow>
          ))}
        </ul>
      )}
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

function StepFive() {
  return (
    <div data-testid="setup-body-5">
      <p className="gig-hint">
        This step reconfirms; it does not discover. Anything new here was missed by an earlier gate.
      </p>
      <RigChecklist testId="setup-rig" />
    </div>
  )
}

/**
 * **Step 6: setup confirmed — a milestone, not a lock.**
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
 */
function StepSix({
  readiness,
  onConfirm,
  onReview,
  busy,
}: {
  readiness: GigReadiness
  onConfirm: () => void
  onReview: () => void
  busy: boolean
}) {
  const blocked = readiness.songs.filter((song) => !song.ready)
  const earlier = readiness.steps.filter((s) => s.step < 6)
  const checksPass = earlier.every((s) => s.status === 'complete')
  const confirmation = readiness.confirmation

  return (
    <div data-testid="setup-body-6">
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

      <RigChecklist testId="setup-rig-6" />

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
          {confirmation === null ? 'Confirm setup' : 'Confirm setup again'}
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
        nothing. <strong>Review setup</strong> goes back to step 2 with everything as it is; nothing
        is ever retyped, and re-entering re-checks the files.
      </p>
    </div>
  )
}

function StepBody({
  step,
  readiness,
  onConfirm,
  onReview,
  busy,
}: {
  step: number
  readiness: GigReadiness
  onConfirm: () => void
  onReview: () => void
  busy: boolean
}) {
  if (step === 1) return <StepOne />
  if (step === 2) return <StepTwo readiness={readiness} />
  if (step === 3) return <StepThree />
  if (step === 4) return <StepFour songs={readiness.songs} />
  if (step === 5) return <StepFive />
  return <StepSix readiness={readiness} onConfirm={onConfirm} onReview={onReview} busy={busy} />
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
   * **Review setup returns to step 2, not step 1.** Song preparation is gig-independent, so
   * re-entering a gig's setup starts at the gig.
   *
   * Nothing is retyped, because nothing was typed into the flow in the first place: every step is
   * derived from the files, so "prefilled" is what it always is. **Re-entering re-checks**, which
   * is the same on-open re-read the rest of the app does — no watcher, and no boundary to police.
   */
  const reviewSetup = () => {
    setSelected(2)
    setBusy(true)
    void refreshGigReadiness().finally(() => setBusy(false))
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
              No gig folder yet. Choose the folder that holds this gig — Pregonero writes{' '}
              <code>gig.json</code> into it, and Muralista writes <code>visuals.json</code> beside
              it.
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
            {canReachFolder ? (
              <button
                type="button"
                className="ctrl-btn ctrl-setup-link"
                disabled={busy}
                onClick={run(chooseGigFolder)}
              >
                {readiness.folderPath === null ? 'Choose gig folder' : 'Choose another folder'}
              </button>
            ) : (
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
                {readiness.adoption.unresolved.join(', ')}. Point the songs folder at them, or give
                each one a <code>file</code> in <code>gig.json</code>.
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
            onConfirm={run(confirmSetup)}
            onReview={reviewSetup}
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
