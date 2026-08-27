import { useEffect, useState } from 'react'
import { chooseGigFolder, closeGig, refreshGigReadiness } from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { hasGigFolderAccess } from './platform'
import type { GigStep, StepStatus } from './gigReadiness'

/**
 * **The report when a gig is opened** — one of the two views of the readiness delta this stage
 * ships. It reads; it never blocks. The gig file exists from setup step 2 and being incomplete is
 * its normal state, so a screen that refused to show a half-built gig would make one impossible
 * to finish.
 *
 * Round G turns this into the guided setup flow with a forward button that greys. Everything on
 * this screen is already the delta that flow will render.
 */

const STATUS_LABEL: Record<StepStatus, string> = {
  complete: 'Done',
  'not-yet': 'Not yet',
  broken: 'Broken',
}

function StepRow({ step }: { step: GigStep }) {
  return (
    <li className={`gig-step gig-step-${step.status}`} data-testid={`gig-step-${step.step}`}>
      <span className="gig-step-name">
        {step.step}. {step.name}
      </span>
      <span className="gig-step-status">{STATUS_LABEL[step.status]}</span>
      {step.missing.length > 0 && (
        <ul className="gig-step-missing">
          {step.missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function GigView() {
  const readiness = useGigReadiness()
  const [busy, setBusy] = useState(false)

  // Re-read on open. Not a watcher: the reload boundary is right before doors and wrong mid-song,
  // and arriving on this screen is trivially not mid-song.
  useEffect(() => {
    void refreshGigReadiness()
  }, [])

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
        <h1 className="songs-title">Gig</h1>
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

        {readiness.folderPath !== null && (
          <>
            <section className="gig-steps">
              <h2 className="gig-section-title">Setup</h2>
              <ul>
                {readiness.steps.map((step) => (
                  <StepRow key={step.step} step={step} />
                ))}
              </ul>
              <p className="gig-hint">
                A step that is not yet done is not a fault. Gig visuals are mapped in Muralista,
                which you can open on its own at any time and come back.
              </p>
            </section>

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
                  <code>bombista</code> was not run, so no song carries its verdict. That is a
                  missing check, not a failed one.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
