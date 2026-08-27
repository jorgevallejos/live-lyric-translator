import { useEffect, useMemo, useState } from 'react'
import { chooseGigFolder, closeGig, refreshGigReadiness } from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { hasGigFolderAccess } from './platform'
import { useBroadcastVisuals } from './visualsBroadcast'
import { shapeTypeOf, shapeIsVisible, type VisualShape } from './visualsFile'
import { currentStep, flowSteps, type FlowStep } from './setupFlow'
import {
  SongDoors,
  SONG_INPUT_RULE,
  SONG_SUBFLOW,
  type SongDoor,
} from './SongDoors'
import type { GigReadiness, SongReadiness, StepStatus } from './gigReadiness'
import { getLibraryEntries } from './setlistStore'

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

/** What is behind a door today: the tool that owns the work, and what to run. */
function DoorBody({ door }: { door: SongDoor }) {
  if (door === 'song') {
    return (
      <div data-testid="door-body-song">
        <p className="gig-hint">
          Everything inside a song file is <strong>Bombista’s</strong> — the words, the timeline, the
          tempo, the media it names. Pregonero reads them and writes none of them.
        </p>
        <p className="gig-hint">{SONG_INPUT_RULE}</p>
        <ol className="song-subflow" data-testid="song-subflow">
          {SONG_SUBFLOW.map((phase) => (
            <li key={phase.name}>
              <span className="song-subflow-name">{phase.name}</span>
              <span className="song-subflow-detail">{phase.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  return (
    <div data-testid="door-body-visuals">
      <p className="gig-hint">
        Where a song’s content lands on the wall is <strong>Muralista’s</strong>. A song reassigns —
        it picks which existing shape of a kind it uses — and never holds its own geometry, because
        re-mapping the room would leave it silently on the old position.
      </p>
      <p className="gig-hint">
        If no shape fits, go back to step 3 and add one at gig level. Shapes stay at gig level; this
        extends the set, it never gives a song a room of its own.
      </p>
    </div>
  )
}

function SongRow({ songId, title, children }: { songId: string; title: string; children?: React.ReactNode }) {
  return (
    <li className="setup-song" data-testid={`setup-song-${songId}`}>
      <span className="setup-song-title">{title}</span>
      {children}
      <SongDoors songId={songId} title={title} renderDoor={(door) => <DoorBody door={door} />} />
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
            <SongRow key={song.songId} songId={song.songId} title={song.title}>
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

function StepSix({ readiness }: { readiness: GigReadiness }) {
  const blocked = readiness.songs.filter((song) => !song.ready)
  const done = readiness.steps.filter((s) => s.step < 6).every((s) => s.status === 'complete')
  return (
    <div data-testid="setup-body-6">
      <section className="setup-evidence" data-testid="setup-evidence">
        <h3 className="gig-section-title">What is true right now</h3>
        <ul>
          {readiness.steps
            .filter((s) => s.step < 6)
            .map((s) => (
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
      <p className="gig-hint" data-testid="setup-confirmation-derived">
        {done
          ? 'Setup is complete: every check above passes.'
          : 'Setup is not complete yet — the steps above say what is left.'}{' '}
        Recording that you confirmed it, against what, and noticing when that stops being true, is
        what this screen gains next.
      </p>
    </div>
  )
}

function StepBody({ step, readiness }: { step: number; readiness: GigReadiness }) {
  if (step === 1) return <StepOne />
  if (step === 2) return <StepTwo readiness={readiness} />
  if (step === 3) return <StepThree />
  if (step === 4) return <StepFour songs={readiness.songs} />
  if (step === 5) return <StepFive />
  return <StepSix readiness={readiness} />
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

          <StepBody step={step.step} readiness={readiness} />

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
