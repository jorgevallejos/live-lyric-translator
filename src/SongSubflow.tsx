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
import { adoptSongFile } from './setlistStore'
import { SONG_INPUT_RULE } from './SongDoors'
import { GatedAction } from './GatedAction'
import type { BombistaResult } from './electronApi'

/**
 * **The song door: one door, two pickers, three moves.**
 *
 * **What it replaced, and why.** The old door opened with a question — *does a song file exist
 * yet?* — and then laid out the pipeline as six controls in a row: `new`, a named gap, align,
 * review, promote, validate. It asked the person to run a tool. Jorge stopped the R1 walk rather
 * than test it, which was the right call: it implemented a design that had already been replaced.
 *
 * **The words picker takes a lyrics `.txt` or a song `.json`, and does not care which.** `bombista
 * align` accepts `SONG_JSON_OR_LYRICS_TXT` and normalises both before its pipeline runs, so **the
 * branch belongs to Bombista, not to a question on a screen.** That is the whole of what makes this
 * one door instead of two: a new song and an existing one differ in what you hand over, and in
 * nothing you have to decide.
 *
 * **Then align, review, and add — and `promote` creates or merges through the same call.** A song
 * that does not exist yet is created from the candidate; one that does has its timeline merged.
 * Neither is a branch here.
 *
 * **Pregonero writes no song file.** It names a staging directory for `align`, hands `promote` two
 * paths, and takes the *reference* into the library afterwards. `back_up_and_replace` is the one
 * song-write path and it is Bombista's.
 *
 * **Where the song lands is not a question either.** The canonical name, inside the configured
 * songs folder, computed from the words file. Bombista refuses a target that is not the canonical
 * name; Pregonero is the side that knows which folder, so it supplies it. The user never picks a
 * path, because a song is played at many gigs and there is only ever one copy of it.
 *
 * **The flow ends with the song appearing in the list, and with nothing else** — no status, no
 * badge, no completion label. Whether it can go into tonight's setlist is asked at the moment a
 * surface draws it.
 *
 * **`bombista new` is not in this door.** It writes a legal song file with no timing, which is the
 * honest state for a song that is **not recorded yet**, and it lives on Setup home's *New song*.
 * This door needs audio by definition: the timeline comes from aligning words against it.
 */

type Props = {
  songId: string
  /** The song's file on this machine, or null when it does not exist yet. */
  songPath: string | null
}

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

function fileName(path: string): string {
  return path.split('/').filter((p) => p.length > 0).pop() ?? path
}

/**
 * The words file's stem — its name with **any** extension removed.
 *
 * Not `songIdFromPath`, which strips `.json` and only `.json`: that is right for a library
 * reference and wrong here, where the words are as often a `.txt`. Getting it wrong is silent —
 * `align` would write `libertad.txt-song.json` and `promote` would be asked for
 * `libertad.txt.json`, both of which are legal file names and neither of which is the song.
 */
export function wordsStem(path: string): string {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function SongSubflow({ songId, songPath }: Props) {
  const [words, setWords] = useState<string | null>(songPath)
  const [audio, setAudio] = useState<string | null>(null)
  const [staging, setStaging] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<{ label: string; result: BombistaResult }[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  const hosted = canRunBombista()
  const songsFolder = getSongsFolder()

  /**
   * The id, and therefore the file name, comes from the words file. `align` names its output
   * `<stem>-song.json`, and `promote` will only create `<stem>.json` from it — so this is not a
   * choice Pregonero makes, it is one it reads.
   */
  const stem = words === null ? songId : wordsStem(words)
  const target =
    songPath ?? (songsFolder === null ? null : joinPath(songsFolder, `${stem}.json`))

  const run = async (label: string, subcommand: string, args: string[]) => {
    setBusy(label)
    setProblem(null)
    const result = await runBombista(subcommand, args)
    setResults((all) => [...all, { label, result }])
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
        {/* **Step 0 is named whether or not Bombista is installed.** It is a fact about the work,
            not about this machine's tooling, and the first version of this door dropped it here. */}
      <p className="gig-hint" data-testid="subflow-gap">
        <strong>Translations</strong> are written in an LLM session <strong>outside the suite</strong>,
        in the file itself. Pregonero names that step and does not perform it — no tool here gets a
        language model, and none ever will. The original lyrics are not a step: they arrive with the
        song.
      </p>
      </div>
    )
  }

  return (
    <div data-testid="subflow-flow">
      <p className="gig-hint">{SONG_INPUT_RULE}</p>

      <div className="subflow-inputs">
        <div className="gig-actions">
          <button
            type="button"
            className="ctrl-btn ctrl-setup-link"
            data-testid="subflow-choose-words"
            disabled={busy !== null}
            onClick={() => {
              void (async () => {
                const chosen = await chooseFilePath('lyrics')
                if (chosen) setWords(chosen)
              })()
            }}
          >
            {words === null ? 'Choose the words' : 'Choose different words'}
          </button>
          <button
            type="button"
            className="ctrl-btn ctrl-setup-link"
            data-testid="subflow-choose-audio"
            disabled={busy !== null}
            onClick={() => {
              void (async () => {
                const chosen = await chooseFilePath('audio')
                if (chosen) setAudio(chosen)
              })()
            }}
          >
            {audio === null ? 'Choose the recording' : 'Choose a different recording'}
          </button>
        </div>
        <p className="gig-hint" data-testid="subflow-inputs-summary">
          {words === null ? 'No words yet' : fileName(words)} ·{' '}
          {audio === null ? 'no recording yet' : fileName(audio)}
        </p>
        <p className="gig-hint">
          The words can be a lyrics <code>.txt</code> or a song <code>.json</code>.{' '}
          <strong>Bombista takes either</strong>, so it is not a question you have to answer — a new
          song and one you already have differ in what you hand over and in nothing you decide.
        </p>
      </div>

      <div className="gig-actions">
        <GatedAction
          site="subflow-align"
          label="Align"
          busy={busy !== null}
          blockedBy={
            words === null || audio === null
              ? 'A song needs words and a recording: the timeline comes from aligning one against the other.'
              : target === null
                ? 'There is no songs folder set, so there is nowhere for the song to land. Set one in preferences.'
                : null
          }
          onClick={() => {
            void (async () => {
              const dir = await bombistaStagingDir(stem)
              if (dir === null) {
                setProblem('Could not name a working directory for the alignment.')
                return
              }
              setStaging(dir)
              await run('bombista align', 'align', [
                audio!,
                words!,
                '-o',
                dir,
                '--emit',
                'songjson',
                '--emit',
                'html',
              ])
            })()
          }}
        />
        <GatedAction
          site="subflow-review"
          label="Review and tempo"
          busy={busy !== null}
          blockedBy={staging === null ? 'Align first — there is nothing to review yet.' : null}
          onClick={() => {
            void (async () => {
              setBusy('bombista serve')
              setProblem(null)
              const result = await openBombistaReview([
                staging!,
                words!,
                ...(audio !== null ? ['--audio', audio] : []),
              ])
              if (result.ok) setReviewOpen(true)
              else setProblem(result.error)
              setBusy(null)
            })()
          }}
        />
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
              })()
            }}
          >
            Done
          </button>
        )}
        <GatedAction
          site="subflow-add"
          label="Add to the library"
          busy={busy !== null}
          blockedBy={
            staging === null
              ? 'Align first — there is nothing to add yet.'
              : target === null
                ? 'There is no songs folder set, so there is nowhere for the song to land.'
                : null
          }
          onClick={() => {
            void (async () => {
              // **Creating and merging are the same call.** `promote` writes the candidate whole
              // when the target does not exist, and merges the timeline when it does.
              const result = await run('bombista promote', 'promote', [
                joinPath(staging!, `${stem}-song.json`),
                target!,
              ])
              if (result.status !== 'ok') return
              await adoptSongFile(target!)
              void refreshGigReadiness()
            })()
          }}
        />
      </div>

      {target !== null && (
        <p className="gig-hint" data-testid="subflow-target">
          Lands as <code>{target}</code> — you never pick a path, because a song is played at many
          gigs and there is only ever one copy of it.
        </p>
      )}

      <p className="gig-hint">
        <strong>Review and tempo</strong> is <code>bombista serve</code>, Bombista’s own page in a
        window: it plays the recording, and it is where the tempo is typed in.{' '}
        <strong>Add to the library</strong> is <code>bombista promote</code> — Bombista’s one
        song-write path, which creates the song when it is new and merges the timeline when it is
        not. Pregonero never writes a song file.
      </p>
      <p className="gig-hint" data-testid="subflow-gap">
        <strong>Translations</strong> are written in an LLM session <strong>outside the suite</strong>,
        in the file itself. Pregonero names that step and does not perform it — no tool here gets a
        language model, and none ever will. The original lyrics are not a step: they arrive with the
        song.
      </p>

      {problem !== null && (
        <p className="setup-song-problem" data-testid="subflow-problem">
          {problem}
        </p>
      )}
      {busy !== null && (
        <p className="gig-hint" data-testid="subflow-busy">
          {busy} is running. Aligning transcribes the recording, which takes about a minute for a
          three-minute song — longer the first time, while the model downloads.
        </p>
      )}
      {results.map((r, i) => (
        <ResultBlock key={`${r.label}-${i}`} label={r.label} result={r.result} />
      ))}
    </div>
  )
}
