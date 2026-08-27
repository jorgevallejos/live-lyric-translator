import { useState } from 'react'
import {
  bombistaStagingDir,
  canRunBombista,
  chooseFilePath,
  closeTool,
  openBombistaReview,
  runBombista,
} from './platform'
import { refreshGigReadiness } from './gigSession'
import { getSongsFolder } from './contentFolders'
import { joinPath } from './paths'
import { SONG_INPUT_RULE, SONG_SUBFLOW } from './SongDoors'
import type { BombistaResult } from './electronApi'

/**
 * **Step 1's subflow, hosted: `new`, a named gap, align, review and tempo, `validate`.**
 *
 * **Two entry points, one flow.** A new song starts at `bombista new` and leaves for an LLM session
 * that writes the words; an existing song starts by handing over the file and the audio. They
 * converge there, so this asks **one question — does a song file exist yet?** — and everything
 * after the join is identical.
 *
 * **A song needs lyrics and audio**, and that is said at the entry rather than discovered halfway:
 * the timeline comes from aligning one against the other, so a song with no audio cannot leave this
 * step. That is a fact about the work, not a rule Pregonero invented.
 *
 * **Nothing here manages candidate files, temp files or swaps.** `bombista promote` merges a
 * candidate home and `bombista/songfile.py`'s `back_up_and_replace` is *THE one song-write path*.
 * This calls `promote` and shows what it printed — the per-line diff — and never touches a file
 * itself. A second file-replacement step in this repo would drift from the first.
 *
 * **Bombista is handed a song file path and never a gig.** It does not know Pregonero exists and
 * does not know gigs exist; hosting its review page changes packaging, not knowledge.
 *
 * **Bombista's output lands in the songs folder under the canonical name, and the user never picks
 * a path.** Song files never move into a gig folder: a song is played at many gigs, and a copy per
 * gig would destroy fix-once-benefits-every-gig.
 */

type Props = {
  songId: string
  /** The song's file on this machine, or null when it does not exist yet. */
  songPath: string | null
}

type Phase = 'entry' | 'flow'

function ResultBlock({ label, result }: { label: string; result: BombistaResult }) {
  return (
    <div className={`bombista-result bombista-result-${result.status}`} data-testid={`bombista-${label}`}>
      <p className="bombista-result-head">
        {label} — {result.status}
      </p>
      {result.output.trim() !== '' && <pre className="bombista-output">{result.output.trim()}</pre>}
    </div>
  )
}

export function SongSubflow({ songId, songPath }: Props) {
  const [phase, setPhase] = useState<Phase>(songPath === null ? 'entry' : 'flow')
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<{ label: string; result: BombistaResult }[]>([])
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [staging, setStaging] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const hosted = canRunBombista()
  const songsFolder = getSongsFolder()
  const canWriteNewSong = songsFolder !== null

  const record = (label: string, result: BombistaResult) =>
    setResults((all) => [...all, { label, result }])

  const run = async (label: string, subcommand: string, args: string[]) => {
    setBusy(label)
    const result = await runBombista(subcommand, args)
    record(label, result)
    setBusy(null)
    return result
  }

  if (!hosted) {
    return (
      <div data-testid="subflow-unhosted">
        <p className="gig-hint">{SONG_INPUT_RULE}</p>
        <p className="gig-hint">
          <code>bombista</code> cannot be run from here. Run it in a terminal — it is fully usable on
          its own — and come back; Pregonero re-reads the files when you return.
        </p>
        <ol className="song-subflow" data-testid="song-subflow">
          {SONG_SUBFLOW.map((phaseItem) => (
            <li key={phaseItem.name}>
              <span className="song-subflow-name">{phaseItem.name}</span>
              <span className="song-subflow-detail">{phaseItem.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (phase === 'entry') {
    // **One question, and it is the only branch in the flow.** Everything after the join is
    // identical, so a new song is one flow with an optional prefix rather than a second flow.
    return (
      <div data-testid="subflow-entry">
        <p className="gig-hint">{SONG_INPUT_RULE}</p>
        <p className="subflow-question" data-testid="subflow-question">
          Does a song file exist yet?
        </p>
        <div className="gig-actions">
          <button
            type="button"
            className="ctrl-btn ctrl-setup-link"
            data-testid="subflow-have-file"
            onClick={() => setPhase('flow')}
          >
            Yes — it is in the songs folder
          </button>
          <button
            type="button"
            className="ctrl-btn ctrl-setup-link"
            data-testid="subflow-new"
            disabled={busy !== null || !canWriteNewSong}
            title={canWriteNewSong ? undefined : 'Set the songs folder first, on the folders screen.'}
            onClick={() => {
              void (async () => {
                // The canonical name, in the songs folder. The user never picks a path.
                const out = joinPath(songsFolder!, `${songId}.json`)
                await run('bombista new', 'new', [songId, '-o', out])
                setPhase('flow')
                void refreshGigReadiness()
              })()
            }}
          >
            No — write the skeleton
          </button>
        </div>
        {results.map((r, i) => (
          <ResultBlock key={`${r.label}-${i}`} label={r.label} result={r.result} />
        ))}
      </div>
    )
  }

  const target = songPath ?? (songsFolder !== null ? joinPath(songsFolder, `${songId}.json`) : null)

  return (
    <div data-testid="subflow-flow">
      <p className="gig-hint">{SONG_INPUT_RULE}</p>

      <ol className="song-subflow" data-testid="song-subflow">
        {SONG_SUBFLOW.map((phaseItem) => (
          <li key={phaseItem.name}>
            <span className="song-subflow-name">{phaseItem.name}</span>
            <span className="song-subflow-detail">{phaseItem.detail}</span>
          </li>
        ))}
      </ol>

      <p className="subflow-gap" data-testid="subflow-gap">
        The words are written in an LLM session <strong>outside the suite</strong>, in the file
        itself. Pregonero names that step and does not perform it — no tool here gets a language
        model, and none ever will.
      </p>

      {target === null ? (
        <p className="setup-song-problem">
          There is no songs folder set, so there is no file to hand over. Set one on the folders
          screen.
        </p>
      ) : (
        <>
          <div className="gig-actions">
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="subflow-choose-audio"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  const chosen = await chooseFilePath('audio')
                  if (chosen) setAudioPath(chosen)
                })()
              }}
            >
              {audioPath === null ? 'Choose the audio' : 'Choose different audio'}
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="subflow-align"
              disabled={busy !== null || audioPath === null}
              title={audioPath === null ? 'A song needs audio before it can be aligned.' : undefined}
              onClick={() => {
                void (async () => {
                  const dir = await bombistaStagingDir(songId)
                  if (dir === null) return
                  setStaging(dir)
                  await run('bombista align', 'align', [
                    audioPath!,
                    target,
                    '-o',
                    dir,
                    '--emit',
                    'html',
                  ])
                })()
              }}
            >
              Align
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="subflow-review"
              disabled={busy !== null || staging === null}
              onClick={() => {
                void (async () => {
                  setBusy('bombista serve')
                  setReviewError(null)
                  // Bombista's own review interface: the alignment, the tempo, and the emit that
                  // writes the song through its one merge path. Pregonero opens a window on it.
                  const result = await openBombistaReview([
                    staging!,
                    target,
                    ...(audioPath !== null ? ['--audio', audioPath] : []),
                  ])
                  if (result.ok) setReviewOpen(true)
                  else setReviewError(result.error)
                  setBusy(null)
                })()
              }}
            >
              Review and tempo
            </button>
            {reviewOpen && (
              <button
                type="button"
                className="ctrl-btn ctrl-setup-link"
                data-testid="subflow-review-done"
                disabled={busy !== null}
                onClick={() => {
                  void (async () => {
                    await closeTool('bombista')
                    setReviewOpen(false)
                    void refreshGigReadiness()
                  })()
                }}
              >
                Done
              </button>
            )}
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="subflow-promote"
              disabled={busy !== null || staging === null}
              onClick={() => {
                void (async () => {
                  await run('bombista promote', 'promote', [
                    joinPath(staging!, `${songId}-timeline.json`),
                    target,
                  ])
                  void refreshGigReadiness()
                })()
              }}
            >
              Promote
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="subflow-validate"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  await run('bombista validate', 'validate', [target, '--for-performance'])
                  void refreshGigReadiness()
                })()
              }}
            >
              Validate
            </button>
          </div>

          {reviewError !== null && (
            <p className="setup-song-problem" data-testid="subflow-review-error">
              {reviewError}
            </p>
          )}
          <p className="gig-hint" data-testid="subflow-target">
            {target}
            {audioPath !== null && <> · {audioPath}</>}
          </p>
          <p className="gig-hint">
            <strong>Review and tempo</strong> is <code>bombista serve</code> — Bombista’s own
            three-step page, in a window. It plays the audio, it is where the tempo is typed in, and
            its emit page writes the song through the same merge path <strong>Promote</strong> uses.
            <strong> Done</strong> closes the window and re-checks; the reload would have happened
            anyway because the file changed.
          </p>
          <p className="gig-hint">
            <strong>Promote</strong> is Bombista’s own write path — it backs the song up beside
            itself, replaces only the timeline, and prints the per-line diff below. Pregonero never
            writes a song file, and there is no second copy anywhere.
          </p>
        </>
      )}

      {busy !== null && (
        <p className="gig-hint" data-testid="subflow-busy">
          {busy} is running. Aligning transcribes the audio, which takes about a minute for a
          three-minute song — longer the first time, while the model downloads.
        </p>
      )}

      {results.map((r, i) => (
        <ResultBlock key={`${r.label}-${i}`} label={r.label} result={r.result} />
      ))}
    </div>
  )
}
