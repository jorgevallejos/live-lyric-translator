import { useEffect, useRef, useState } from 'react'
import { adoptSongFile, getCatalogueEntries } from './setlistStore'
import { refreshGigReadiness } from './gigSession'
import { getSongFilesFolder, getSongsFolder } from './contentFolders'
import { joinPath } from './paths'
import {
  emittedSong,
  fileExists,
  readSongFileText,
  replaceSongFile,
  runBombista,
  startBombistaFlow,
  stopBombistaFlow,
} from './platform'
import { parseSongFile, type ParsedSongFile } from './songState'
import { clearSongFlowRequest, getSongFlowRequest, type SongFlowRequest } from './songFlowState'
import { LeaveWithoutSaving } from './LeaveWithoutSaving'

/**
 * **The song flow: Bombista's three screens, inside Pregonero's window.**
 *
 * **One window** (Jorge, 2026-09-02, journey-setup step 6). It used to be two: `bombista serve`
 * printed an address and Pregonero opened a second `BrowserWindow` on it, so the flow you were in
 * was somewhere else on the desktop and *how you get back* was written on neither screen. The page
 * is still served by Bombista over localhost — that has to stay, because the review page names its
 * audio relative to the staging directory and hosting it anywhere else gives a review with no
 * sound. What changed is where it is drawn.
 *
 * **The boundary is untouched, and this file is where that is easiest to break.** A frame, not a
 * bridge: no preload, nothing injected, nothing read out of the page. **A directory goes in and a
 * file path comes back out**, which is the same contract as every other join in this suite.
 * Bombista does not know Pregonero exists, and nothing here teaches it.
 *
 * **How the flow ends, and why it is a poll.** `Save to the catalogue` writes
 * `<staging>/<stem>.json` and stays on the page — there is no navigation to watch and no event
 * that crosses the frame. So Pregonero watches the directory it named. That is not a workaround
 * for a missing channel; the file **is** the channel, and watching for it is the same act as
 * `promote` reading it a moment later.
 *
 * **No skeleton is written before any of this** (2026-09-02). `New` used to run `bombista new`
 * first, which put a file in the catalogue carrying one placeholder lyric line — and `promote`
 * merges only the timeline envelope into a song that exists, so the words in the candidate never
 * reached it and the guard refused on `timeline length (24) must match the song's lyrics item
 * count (1)`. Nothing is created until the flow ends, so `promote` takes its **create** path and
 * carries the whole song. That is the step 7 blocker, closed by removing the thing that caused it.
 *
 * **The song's id comes out of the flow, not into it.** It is the stem of the file Save wrote,
 * which is the stem of the lyrics file the person handed over on page 1. Pregonero reads it rather
 * than asking for it — `promote` will only create `<stem>.json` from a `<stem>` candidate, so a
 * name typed here would be a second opinion about a decision that is already made.
 *
 * **What Pregonero says to Bombista is five command-line options and nothing else** — see
 * `serveArgs`. The seam is the same after them as before: a directory in, a file path out.
 */

/**
 * **Everything Pregonero says to Bombista, in one place.**
 *
 * Five answers, none of which tells Bombista who is calling and none of which changes a byte of
 * what it writes. The defaults behind them are all right for running Bombista on its own and all
 * wrong inside a window that already has a title and already knows where the songs are — which is
 * why they are options on `serve` rather than a second mode.
 *
 * - **`--staging`, the directory in.** Without it Bombista works in its own cache, and Pregonero
 *   would have to know that cache's layout to find the file it means to promote.
 * - **`--browse-from`, the catalogue.** The pickers opened at the home folder, on the one screen
 *   whose job is to find a lyrics file and a recording — both of which live in the songs folder,
 *   in `lyrics/` and `audio/` beside each other. **The songs root, not `song-performance/`**: the
 *   song files are in that folder and neither of the two things being looked for is.
 * - **`--no-header`.** Name, tagline, version and *a Tramoya tool by Chango Pepper*, inside a
 *   window already headed `New song` — the tool introducing itself to someone who did not choose
 *   it. **The version goes with it** (Jorge, 2026-09-03): it used to stay behind as one dim line
 *   under the step bar, and it comes off the embedded flow entirely. **It survives in standalone
 *   Bombista**, which is what the rule needs — *the version has to survive somewhere*, because two
 *   builds calling themselves the same number is the trap this project has already paid a day for.
 *   What this switch buys is a clean embedded flow, not a hidden version.
 * - **`--song`, on an edit and only on an edit.** It is what makes an edit an edit rather than a
 *   second new song: page 1 starts prefilled from the file, instead of dropping the person on an
 *   empty page and asking them to find the song they just clicked — with `<id>-song.json` sitting
 *   next to `<id>.json` in the same folder, which is the wrong answer beside the right one.
 *
 * - **`--deal` / `--no-deal`, and it is Pregonero's answer to give.** The deal is Bombista's step
 *   0 — *what you get, what it costs, what it does not do* — and the rule for showing it is one
 *   sentence: **show it when this machine has produced no song yet.** Standalone, Bombista answers
 *   that from its own cache. **In here it cannot**: the cache is not even the directory this flow
 *   works in, and the fact that settles it is the catalogue being empty. **Bombista does not know
 *   what a catalogue is and must not learn**, so the answer crosses as a boolean and nothing else
 *   — the same shape as `--no-header`, saying what to draw and not who is asking.
 *
 *   **Answered both ways on purpose.** The option is unset by default so Bombista can fall back to
 *   its cache; omitting it here would leave that fallback deciding, and it would say *show it*
 *   every single time, because this flow never writes to that cache.
 *
 *   **Nothing remembers that it was seen** — on either side. There is no *do not show again*: the
 *   catalogue fills on the first save and answers `--no-deal` from then on, which is one fewer
 *   thing for the walk's reset to clear.
 *
 * A path that has gone since Backstage read it makes `serve` refuse by name — `--browse-from` and
 * `--song` are both checked by Bombista — and that refusal is what the screen shows. Omitting them
 * to be safe would trade a sentence naming the file for a flow that quietly behaves like a
 * different one.
 */
export function serveArgs(
  request: SongFlowRequest,
  songsFolder: string | null,
  producedASong: boolean
): string[] {
  return [
    '--staging',
    request.staging,
    '--no-header',
    producedASong ? '--no-deal' : '--deal',
    ...(songsFolder === null ? [] : ['--browse-from', songsFolder]),
    ...(request.songPath === null ? [] : ['--song', request.songPath]),
  ]
}

/**
 * **Whether this machine has produced a song yet, as Pregonero can answer it.**
 *
 * The catalogue — the folder Pregonero lists and offers from. Not the setlists, not the gigs: the
 * question is whether a song has ever come out of this flow, and a song that came out of it is in
 * there.
 *
 * **A file in the folder that will not parse does not count.** `getCatalogueEntries` is what every
 * list in this app means by *the songs you have*, and answering from a different set here would
 * make the deal appear on a machine whose Songs list is full. The cost of being wrong is one
 * screen shown once, and it is met with one press.
 */
export function hasProducedASong(): boolean {
  return getCatalogueEntries().length > 0
}

/** How often the staging directory is asked whether the flow has ended. */
const POLL_MS = 700

type Phase =
  | { kind: 'starting' }
  | { kind: 'running'; url: string }
  | { kind: 'landing' }
  | { kind: 'failed'; error: string }

/**
 * **Why a file the flow just wrote was not added, said while the flow is still on screen.**
 *
 * Held beside the phase rather than inside it, because it is not a phase: the flow is still
 * running, the page is still there, and the person can change the thing and press `Save to the
 * catalogue` again. A refusal that replaced the page would take away the one screen that can fix
 * it.
 */
type Refusal = { file: string; reason: string }

export function SongFlowView() {
  const request = getSongFlowRequest()
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  // **Whether the dialog is up**, and nothing more: the answer to a press that has just happened,
  // not a condition of the flow. It is deliberately not part of `Phase` — the flow is still
  // running behind it, and a phase would say it had stopped.
  const [asking, setAsking] = useState(false)
  // **The flow ends once.** The poll keeps running while promote does, and a second answer would
  // promote the same file twice — the first of which has already moved the screen on.
  const finishing = useRef(false)

  const leave = () => {
    void stopBombistaFlow()
    clearSongFlowRequest()
    window.location.hash = '#/setup'
  }

  /**
   * **When there is something to lose, and how that is known without crossing the boundary.**
   *
   * Once Bombista's pages are up, the session holds every answer given to them, and `Back` ends
   * the process that holds it. Before that — while the subprocess is starting, or after it refused
   * to — there is nothing typed and nothing to consent to, so the press just leaves.
   *
   * **Pregonero does not ask the page whether it is dirty, and must not.** This file is a frame
   * and not a bridge: nothing is injected and nothing is read out. So *the pages are up* is the
   * closest true statement available, and it is deliberately the cautious side of the line — an
   * extra dialog on a flow nobody typed in costs one press, and the other error costs the
   * afternoon this dialog exists for.
   */
  const askBeforeLeaving = () => {
    if (phase.kind === 'running') setAsking(true)
    else leave()
  }

  useEffect(() => {
    if (request === null) {
      window.location.hash = '#/setup'
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // **The watermark, and it moves.** A refused file stays on disk — nothing deletes it, and the
    // flow that wrote it is still open — so without raising this, every poll would rediscover the
    // same refusal. Raising it means the next press of `Save` is what is looked at next.
    let since = request.startedAt

    /**
     * **The receiving side reads the file before anything is written into the catalogue.**
     *
     * `parseSongFile` is Pregonero's own reader — the same one Backstage's Songs list runs, and
     * the same one that refused `tempo.countInBars: 0` on the walk of 2026-09-02. Running it here
     * rather than a second, kinder check is the point: **two gates that can disagree is the defect
     * this closes**, not the particular value that tripped it.
     */
    const refusalFor = async (emitted: string): Promise<Refusal | null> => {
      const read = await readSongFileText(emitted)
      const file = emitted.split('/').pop() ?? emitted
      if (!read.ok) return { file, reason: read.error }
      let candidate: ParsedSongFile
      try {
        candidate = parseSongFile(read.text)
      } catch (e) {
        return { file, reason: e instanceof Error ? e.message : String(e) }
      }
      // **A timed song is never replaced by one carrying no timeline.** Bombista's `promote` states
      // that rule and this path does not go through it, so it is asked here: writing nothing would
      // leave timings the person believes they removed, and writing the candidate would destroy a
      // measured one. Editing a song with no recording is otherwise ordinary and must stay so.
      const target = targetFor(emitted)
      if (target !== null && (candidate.timeline?.length ?? 0) === 0) {
        const existing = await readSongFileText(target)
        if (existing.ok) {
          let timed = false
          try {
            timed = (parseSongFile(existing.text).timeline?.length ?? 0) > 0
          } catch {
            // A target this app cannot read is not evidence of a timeline. Replacing it is what
            // the person asked for, and the catalogue is better off with a file that reads.
          }
          if (timed) {
            return {
              file,
              reason:
                'this song has a timeline and the edit produced none. Give it a recording and process it again, or delete the song if the timings are meant to go.',
            }
          }
        }
      }
      return null
    }

    /** Where this candidate would land, or null when there is no catalogue to land it in. */
    const targetFor = (emitted: string): string | null => {
      const folder = getSongFilesFolder()
      return folder === null ? null : joinPath(folder, emitted.split('/').pop() ?? '')
    }

    const land = async (emitted: string) => {
      setPhase({ kind: 'landing' })
      // **The flow's pages are done with**, and the subprocess with them, before the catalogue is
      // written: promote is Bombista's one song-write path and it must not race its own server.
      await stopBombistaFlow()
      const folder = getSongFilesFolder()
      if (folder === null) {
        setPhase({
          kind: 'failed',
          error: 'There is no songs folder set, so there is nowhere for the song to land.',
        })
        return
      }
      // **The name is read, not chosen.** `<staging>/libertad.json` lands as
      // `<songs>/song-performance/libertad.json`; a song's id is its filename, and `promote`
      // refuses any other target for that candidate.
      const target = joinPath(folder, emitted.split('/').pop() ?? '')

      /**
       * **A new song is created by `promote`; an edit replaces the file** (Jorge, 2026-09-02).
       *
       * They are two operations and only one of them is promote's. Creating is what promote's
       * create path is for, and it drops the `_bombista` provenance block, so a made song carries
       * no key a hand-made one does not. **Replacing is not a merge at all**: promote writes only
       * the timeline envelope, and page 1 — the edit surface since Bombista `v1.4.0` — collects
       * the title, the artist, the notes and the tempo, every one of which was silently discarded
       * when the target already existed.
       *
       * **It is truthful rather than lossy because the candidate is the original plus the
       * changes.** Checked before this was built, against a song carrying keys Bombista has never
       * heard of: every one survived, in order, with Bombista's five appended.
       */
      const editing = await fileExists(target)
      const result = editing
        ? await replaceSongFile(emitted, target)
        : await runBombista('promote', [emitted, target])
      const failed =
        'status' in result
          ? result.status !== 'ok'
            ? result.output.trim() || 'bombista promote did not write the song.'
            : null
          : result.ok
            ? null
            : result.error
      if (failed !== null) {
        setPhase({ kind: 'failed', error: failed })
        return
      }
      await adoptSongFile(target)
      void refreshGigReadiness()
      clearSongFlowRequest()
      window.location.hash = '#/setup'
    }

    const poll = () => {
      timer = setTimeout(() => {
        void (async () => {
          if (!alive || finishing.current) return
          const emitted = await emittedSong(request.staging, since)
          if (!alive) return
          if (emitted !== null) {
            // **Nothing reaches the catalogue until the receiver has read it** (2026-09-02). The
            // flow used to promote whatever `Save` wrote and land on Backstage, which then met
            // the file for the first time and put up a popup about it — a failure reported on a
            // screen that cannot act on it, after the screen that caused it is gone.
            const refusal = await refusalFor(emitted)
            if (!alive) return
            if (refusal !== null) {
              // The page stays up and the run stays alive: the person is one field away from a
              // file that reads, and this is the only screen where that field is.
              since = Date.now()
              setRefusal(refusal)
              poll()
              return
            }
            setRefusal(null)
            finishing.current = true
            await land(emitted)
            return
          }
          poll()
        })()
      }, POLL_MS)
    }

    void (async () => {
      const started = await startBombistaFlow(
        serveArgs(request, getSongsFolder(), hasProducedASong())
      )
      if (!alive) return
      if (!started.ok) {
        setPhase({ kind: 'failed', error: started.error })
        return
      }
      setPhase({ kind: 'running', url: started.url })
      poll()
    })()

    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
      // Leaving the screen ends the run. A `bombista serve` outliving the screen it was drawn in
      // is a process nobody can see and nobody can stop.
      if (!finishing.current) void stopBombistaFlow()
    }
  }, [request])

  if (request === null) return null

  return (
    <div className="songs-screen song-flow-screen" data-testid="song-flow">
      {/* **`Back` is a teardown here, so it asks** (Jorge, 2026-09-02). It kills the `serve`
          process, and everything typed into Bombista's pages lives in that process. The dialog is
          the suite's second kind — a destructive action needing consent — and is the same component
          the gig flow uses, so the two cannot drift apart. */}
      {asking && (
        <LeaveWithoutSaving
          site="song-flow"
          what="This song has not been saved to your catalogue."
          onStay={() => setAsking(false)}
          onLeave={leave}
        />
      )}
      <header className="songs-top-bar">
        <button
          type="button"
          className="songs-back"
          data-testid="song-flow-leave"
          onClick={askBeforeLeaving}
        >
          Back
        </button>
        <h1 className="songs-title">{request.title}</h1>
      </header>

      <main className="songs-body song-flow-body">
        {phase.kind === 'starting' && (
          <p className="setup-home-empty" data-testid="song-flow-starting">
            Starting Bombista…
          </p>
        )}
        {phase.kind === 'landing' && (
          <p className="setup-home-empty" data-testid="song-flow-landing">
            Saving to the catalogue…
          </p>
        )}
        {phase.kind === 'failed' && (
          <p className="setup-song-problem" data-testid="song-flow-problem">
            {phase.error}
          </p>
        )}
        {phase.kind === 'running' && (
          <>
            {/* **The refusal sits above the page that caused it**, because that page is what
                answers it. It is not a banner about a standing condition — it is one press's
                result, and it clears the moment `Save` is pressed on a file that reads. */}
            {refusal !== null && (
              <div className="song-flow-refused" data-testid="song-flow-refused" role="alert">
                <p className="song-flow-refused-head">
                  Not added to the catalogue — Pregonero will not read this file
                </p>
                <p className="song-flow-refused-why">
                  <code>{refusal.file}</code>: {refusal.reason}
                </p>
                <p className="song-flow-refused-next">
                  Nothing was written to the catalogue. Change it above and press{' '}
                  <strong>Save to the catalogue</strong> again.
                </p>
              </div>
            )}
            {/* **A frame, and nothing but a frame.** No preload, no `nodeIntegration`, nothing read
                out of it and nothing put into it. What Pregonero knows about this page is the
                address it was told to draw. */}
            <iframe
              className="song-flow-frame"
              data-testid="song-flow-frame"
              title="Bombista"
              src={phase.url}
            />
            {/* **THE TRANSLATIONS NOTE IS NOT HERE, AND CANNOT BE** (Jorge, 2026-09-03).
                It stood right here, under the frame, and the comment that used to sit with it
                claimed *one line, at the end of the flow*. It was never at the end: this branch is
                the whole life of the frame, so the line was up on Bombista's page 1, page 2 and
                page 3 alike. Walked, it read as a fixed footer on every screen.

                **It cannot be fixed on this side.** Pregonero draws Bombista in a frame with no
                preload and reads nothing out of it — see the frame above — so it cannot tell which
                page is showing, and teaching it would trade a real boundary for a sentence.

                **So the page that IS the end renders it**: `_TRANSLATIONS_NOTE` at the foot of
                Bombista's page 3, below the actions, in the fail colour. One line of copy crossed
                the seam; nothing else did. Bombista still asks for no translation and performs
                none. `song-flow-translations` is asserted absent below, so it cannot come back
                here and start following the flow again. */}
          </>
        )}
      </main>
    </div>
  )
}
