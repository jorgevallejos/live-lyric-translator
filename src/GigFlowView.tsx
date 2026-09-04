import { useEffect, useRef, useState } from 'react'
import {
  confirmSetup,
  createGig,
  refreshGigReadiness,
  publishSetlistToGig,
  saveGigIdentity,
} from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { gigIdentityIsAnswered, gigLabelFrom } from './gigFile'
import { getGigsFolder } from './contentFolders'
import { gigFolderIn } from './fileLayout'
import { LeaveWithoutSaving } from './LeaveWithoutSaving'
import { canHostTools, serveTool } from './platform'
import type { GigReadiness, StepStatus } from './gigReadiness'
import { MURALISTA_KEY, MURALISTA_PAGE } from './MuralistaDoor'
import { GatedAction } from './GatedAction'
import {
  addSongToSetlist,
  getActiveSetlistId,
  getCatalogueEntries,
  getOrderedEntriesForActiveSetlist,
  moveSongInSetlist,
  removeSongFromSetlist,
} from './setlistStore'

/**
 * **The gig flow: four screens, a step bar, and one thing asked per screen.**
 *
 * Designed 2026-09-02, before being built, and shaped so **the two flows in this app read as the
 * same kind of thing**: Bombista's pages carry a step bar, so this does too, and the handoff to
 * Muralista at step 3 stops feeling like a departure.
 *
 *     1 GIG    2 SETLIST    3 VISUALS    4 CHECK
 *
 * **All four screens are built as of 2026-09-03.** Step 3 opened when Muralista's own flow landed
 * (its `v1.8.0`) — it is the tool itself, in a frame, on this gig, not a door to it. Step 4 is the
 * check, and it is the last unbuilt screen of the setup journey.
 *
 * ## Where the file goes, and it is not a question anybody is asked
 *
 * **The tools own one `setup/` folder inside the gigs folder and touch nothing else** (Jorge,
 * 2026-09-02). Every gig is `<gigs>/setup/<gig>/`, holding `gig.json` and later `visuals.json`.
 * **`<gig>` is an opaque id** (Jorge, 2026-09-03) — it was shaped `2026-05-16-bom-festival` until
 * then, and a name derived from the date and the venue is a name that has to change when they do.
 * **No tool creates a folder in the artist's territory**, which is what `New gig` used to do.
 *
 * So this flow never asks where anything goes. It asks what the night is, and gives it a folder.
 *
 * ## When the file is written, and what `Back` does about it
 *
 * **Nothing is written until identity is complete at the end of step 1.** Leaving during step 1
 * asks and discards, and nothing was ever on disk. **Once `gig.json` exists the gig is on
 * Backstage**, incomplete and honest, so leaving after that costs nothing and asks nothing.
 *
 * **No half-made thing is ever on disk without being in a list.** That shape is what produced a
 * phantom popup on 2026-09-02 — a file the app had written, met later by a screen that could only
 * report it as somebody else's mess.
 */

/** The bar's four segments, in order. The words are the screens' own. */
const STEPS: readonly { step: number; label: string }[] = [
  { step: 1, label: 'Gig' },
  { step: 2, label: 'Setlist' },
  { step: 3, label: 'Visuals' },
  { step: 4, label: 'Check' },
]

/**
 * **All four exist since 2026-09-03.** The later-step branch below is therefore unreachable today,
 * and it is kept rather than deleted: it carries Jorge's ruling of 03/09 about how a step that has
 * not arrived is drawn — dimmed and inert, never struck through — and that ruling outlives the
 * moment there happens to be nothing after step 4.
 */
const BUILT = 4

/**
 * **The step bar, pinned.** In an embedded subflow the bar is fixed and everything else scrolls —
 * the rule is in `tramoya-integration/project-context.md`, and it came out of a walk that lost its
 * place when the bar scrolled away on a long page. **The setlist screen is where it bites**: two
 * long lists, and *where am I* would otherwise depend on scroll position.
 *
 * **The band is what sticks, not the bar.** `.gig-steps` is `width: max-content`, so pinning it
 * directly would leave the page scrolling through the gap beside it — which half-works, and
 * half-working is worse than not doing it. The band is full width and opaque; see `.gig-stepband`.
 *
 * **A later step is a span, not a button.** Bombista renders a step that did not happen the same
 * way, for the same reason: a bar that still offered it would say it is available.
 *
 * **It carries no word saying so** (Jorge, 2026-09-03). It used to wear a `later` chip, kept on the
 * argument that it was the only thing separating *shut for now* from *not built at all*. Jorge
 * judged that distinction not worth the words: **disabled is enough**, and the segment is dimmed
 * and inert like every other shut control in the app.
 */
function GigStepBar({
  here,
  isOpen,
  onGo,
}: {
  here: number
  isOpen: (step: number) => boolean
  onGo: (step: number) => void
}) {
  return (
    <div className="gig-stepband">
      <nav className="gig-steps" data-testid="gig-flow-steps" aria-label="Gig setup">
        {STEPS.map(({ step, label }) => {
          const later = step > BUILT
          if (later) {
            return (
              <span
                key={step}
                className="gig-step-later"
                data-testid={`gig-flow-step-${step}`}
                data-state="later"
              >
                <span className="n">{step}</span> {label}
              </span>
            )
          }
          // **A PREDICATE, NOT A HIGH-WATER MARK** (2026-09-04). It was `step <= reachable`, which
          // can only express *everything up to here*; the visuals step is now shut on a condition
          // of its own — an empty setlist — that says nothing about step 4.
          const open = isOpen(step)
          return (
            <button
              key={step}
              type="button"
              className={`gig-step-seg${step === here ? ' on' : ''}`}
              data-testid={`gig-flow-step-${step}`}
              data-state={step === here ? 'here' : open ? 'open' : 'closed'}
              aria-current={step === here}
              disabled={!open}
              onClick={() => onGo(step)}
            >
              <span className="n">{step}</span> {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/**
 * **Screen 1: the gig. The only screen that asks you to type.**
 *
 * Date, venue, city — and **once the gig exists, the name its folder was given**, because that is
 * the one place a person can see it. **It is no longer derived from what is typed** (Jorge,
 * 2026-09-03): the folder is an opaque id, minted at creation and never changed, so before the gig
 * exists there is no name to show and this says so.
 *
 * **The two answers that gate the write are the date and the venue**, and the line under the
 * fields says that rather than talking about a name. `gigIdentityIsAnswered` is the rule; it is
 * checked here so the button can be shut, and again in `createGig`, which is where it binds.
 *
 * **It never asks where anything goes.** The gigs root was answered once, on first run, and every
 * gig is a folder under `setup/`. There is no path on this screen and no picker.
 */
function ScreenGig({
  exists,
  gigId,
  date,
  venue,
  city,
  problem,
  busy,
  onField,
  onCommit,
}: {
  exists: boolean
  gigId: string | null
  date: string
  venue: string
  city: string
  problem: string | null
  busy: boolean
  onField: (field: 'date' | 'venue' | 'city', value: string) => void
  onCommit: () => void
}) {
  const answered = gigIdentityIsAnswered({ date, venue })
  const gigsRoot = getGigsFolder()

  return (
    <section className="gig-flow-page" data-testid="gig-flow-screen-1">
      <p className="gig-flow-lede">
        A gig is a date and a place. Everything else about it — the songs, the room, the check —
        follows from those, and none of it is a decision about your disk.
      </p>

      <div className="gig-flow-fields">
        <label className="setup-home-field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            data-testid="gig-flow-date"
            disabled={busy}
            onChange={(e) => onField('date', e.target.value)}
          />
        </label>
        <label className="setup-home-field">
          <span>Venue</span>
          <input
            type="text"
            value={venue}
            data-testid="gig-flow-venue"
            disabled={busy}
            onChange={(e) => onField('venue', e.target.value)}
          />
        </label>
        <label className="setup-home-field">
          <span>City</span>
          <input
            type="text"
            value={city}
            data-testid="gig-flow-city"
            disabled={busy}
            onChange={(e) => onField('city', e.target.value)}
          />
        </label>
      </div>

      {/* **The gig's folder, which is the only thing that is really its name.** It is given when
          the gig is made and never rewritten — `visuals.json` records which gig it maps and is
          checked against this — so the venue can be corrected in the file without the folder
          chasing it. **It is not derived from anything above**, which is why there is nothing to
          show until the gig exists. */}
      <div className="gig-flow-identity" data-testid="gig-flow-identity">
        <span className="gig-flow-identity-label">This gig is called</span>
        {exists ? (
          <code className="gig-flow-identity-name" data-testid="gig-flow-identity-name">
            {gigId}
          </code>
        ) : (
          <span className="gig-flow-identity-pending" data-testid="gig-flow-identity-pending">
            Not yet — the folder is named when the gig is made.
          </span>
        )}
      </div>
      <p className="gig-flow-note">
        {exists ? (
          <>
            The name is the folder your gig data is in, and it means nothing on purpose: it was
            settled when the gig was made and never changes, so correcting the date or the venue
            above moves the gig everywhere it is listed and leaves the folder alone. It is{' '}
            <code>{gigsRoot === null ? `…/setup/${gigId ?? ''}` : gigFolderIn(gigsRoot, gigId ?? '')}</code>.
          </>
        ) : (
          <>
            Your gig data goes in a folder inside the one <code>setup</code> folder Pregonero keeps
            in your gigs folder. <strong>Nothing else in there is touched</strong>, and{' '}
            <strong>nothing at all is written until you have answered the date and the venue</strong>.
          </>
        )}
      </p>

      {problem !== null && (
        <p className="setup-song-problem" data-testid="gig-flow-problem">
          {problem}
        </p>
      )}

      {/* **EVERY FORWARD CONTROL NAMES ITS DESTINATION** (Jorge, 2026-09-04, walking `v0.53.0`).
          `To the setlist →`, `To the visuals →`, `To the check →` — one vocabulary, and the arrow
          is Bombista's mark for the same thing.

          **It said `Save the gig →` for one round and that was wrong**: `gig.json` has already
          been written by the time this button reads that, so naming the save made saving sound
          optional. What the press actually does that the person cares about is take them to the
          setlist, and that is what it says. The write still happens and still gates the move — a
          failed write keeps you here, in front of the problem. */}
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn gig-flow-primary"
          data-testid="gig-flow-commit"
          disabled={busy || (!exists && !answered)}
          onClick={onCommit}
        >
          To the setlist →
        </button>
      </div>
    </section>
  )
}

/**
 * **Screen 2: the setlist. Two lists side by side.**
 *
 * The catalogue as Pregonero reads it on the left, the gig's running order on the right, a way to
 * move a song across and a way to move it up and down within the order.
 *
 * **Not *tonight*, and that is the whole of the 2026-09-03 finding.** A gig is set up weeks ahead —
 * the walk read *TONIGHT, IN ORDER* on 03/09 about a gig on 23/10 — and *tonight* is the
 * performance view's word, which needs it and is the only surface entitled to it. Setup speaks
 * about **the gig**; the night speaks about tonight.
 *
 * **Only songs Pregonero can read appear.** This list says *you can use this*, and a file the app
 * cannot read is not usable — it is named once in a popup on Backstage and then dropped. The list
 * beside it is the opposite kind of list: the running order keeps its ids and reports what it
 * cannot resolve, because it is the record of a decision about a night.
 *
 * **It cannot be left empty**: a gig with no setlist is not a gig. That is said on the screen and
 * it is `gigReadiness`'s own verdict — a `gig.json` with identity and no setlist **parses**, and
 * fails readiness at step 2 with *The gig has no setlist.* Valid is not ready, and this screen is
 * where the difference is felt.
 */
function ScreenSetlist({
  busy,
  onChange,
  onForward,
  blockedBy,
}: {
  busy: boolean
  onChange: () => void
  onForward: () => void
  blockedBy: string | null
}) {
  const setlistId = getActiveSetlistId()
  const order = getOrderedEntriesForActiveSetlist()
  const chosen = new Set(order.map((entry) => entry.ref.id))
  const catalogue = getCatalogueEntries().filter((entry) => !chosen.has(entry.ref.id))

  return (
    <section className="gig-flow-page gig-flow-setlist" data-testid="gig-flow-screen-2">
      <div className="gig-flow-lists">
        <section className="gig-flow-list" data-testid="gig-flow-catalogue">
          <h2 className="gig-flow-list-name">Your catalogue</h2>
          <div className="gig-flow-list-frame">
            {catalogue.length === 0 ? (
              <p className="setup-home-empty" data-testid="gig-flow-catalogue-empty">
                {chosen.size === 0
                  ? 'No songs yet. Songs are made on Backstage — they are gig-independent and last for years.'
                  : 'Every song you have is in this gig’s setlist.'}
              </p>
            ) : (
              <ul className="setup-home-list">
                {catalogue.map((entry) => (
                  <li
                    key={entry.ref.id}
                    className="gig-flow-row"
                    data-testid={`gig-flow-catalogue-${entry.ref.id}`}
                  >
                    <span className="setup-song-title">{entry.song?.title ?? entry.ref.id}</span>
                    <button
                      type="button"
                      className="ctrl-btn gig-flow-mark"
                      disabled={busy}
                      data-testid={`gig-flow-add-${entry.ref.id}`}
                      aria-label={`Add ${entry.song?.title ?? entry.ref.id} to the gig’s setlist`}
                      onClick={() => {
                        addSongToSetlist(setlistId, entry.ref.id)
                        onChange()
                      }}
                    >
                      Add →
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="gig-flow-list" data-testid="gig-flow-order">
          <h2 className="gig-flow-list-name">The gig&rsquo;s setlist</h2>
          <div className="gig-flow-list-frame">
            {order.length === 0 ? (
              <p className="setup-home-empty" data-testid="gig-flow-order-empty">
                Nothing in it yet. A gig with no setlist is not a gig — add a song from the left.
              </p>
            ) : (
              <ol className="setup-home-list gig-flow-ordered">
                {order.map((entry, index) => (
                  <li
                    key={entry.ref.id}
                    className="gig-flow-row"
                    data-testid={`gig-flow-order-${entry.ref.id}`}
                  >
                    <span className="gig-flow-position">{index + 1}</span>
                    <span className="setup-song-title">{entry.song?.title ?? entry.ref.id}</span>
                    <div className="setup-home-row-actions">
                      <button
                        type="button"
                        className="ctrl-btn gig-flow-mark"
                        disabled={busy || index === 0}
                        aria-label={`Move ${entry.song?.title ?? entry.ref.id} earlier`}
                        data-testid={`gig-flow-up-${entry.ref.id}`}
                        onClick={() => {
                          moveSongInSetlist(setlistId, entry.ref.id, 'up')
                          onChange()
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ctrl-btn gig-flow-mark"
                        disabled={busy || index === order.length - 1}
                        aria-label={`Move ${entry.song?.title ?? entry.ref.id} later`}
                        data-testid={`gig-flow-down-${entry.ref.id}`}
                        onClick={() => {
                          moveSongInSetlist(setlistId, entry.ref.id, 'down')
                          onChange()
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ctrl-btn gig-flow-mark"
                        disabled={busy}
                        data-testid={`gig-flow-remove-${entry.ref.id}`}
                        aria-label={`Take ${entry.song?.title ?? entry.ref.id} out of the gig’s setlist`}
                        onClick={() => {
                          removeSongFromSetlist(setlistId, entry.ref.id)
                          onChange()
                        }}
                      >
                        ←
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <p className="gig-flow-note">
        The running order lives in <code>gig.json</code> and is what this app performs. Changing it
        here writes the file.
      </p>

      {/* **THE WAY ONWARD, AND IT IS A GATE** (Jorge, 2026-09-04, walking `v0.53.0`).
          **A gig with no setlist is not a gig** — this screen has said so since it was built, and
          nothing enforced it: a gig was created, no song was added, and the visuals opened. A
          defect against an existing ruling rather than a new rule.

          **Disabled with the reason attached, never absent** — `GatedAction`'s rule, which this
          control follows rather than vanishing. The bar's own step 3 is shut on the same condition,
          so there is no second door around it. **Step 4 stays open**: the check is the screen that
          NAMES what is missing, and shutting it would hide the answer. */}
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn gig-flow-primary"
          data-testid="gig-flow-forward"
          disabled={busy || blockedBy !== null}
          onClick={onForward}
        >
          To the visuals →
        </button>
      </div>
      {blockedBy !== null && (
        <p className="setup-song-problem" data-testid="gig-flow-forward-blocked">
          {blockedBy}
        </p>
      )}

      {/* **Nothing here points at the old setup screen, and that is deliberate** (Jorge,
          2026-09-03). The line that used to stand here announced that visuals and the check were
          not built and offered `#/gig/steps` as the way to do them anyway — a screen this flow
          exists to replace, named on the screen that replaces it.

          **The known consequence, accepted rather than overlooked:** that link was the only door
          left to Muralista and to `Confirm setup`, so steps 10 to 12 have no route from here until
          9.3 and 9.4 are built. Those steps are parked. `GigView` is still in the code at
          `#/gig/steps` and still works; nothing in the flow leads to it. */}
    </section>
  )
}

/**
 * **Screen 3: the room, and it is Muralista doing it — in the whole window.**
 *
 * **It opens the way the song flow opens** (Jorge, 2026-09-04, walking `v0.52.0`). It used to be
 * Muralista in a box inside the gig flow's step 3: two step bars nested, a masthead over a toolbar
 * over a frame, and **the tool that needs the most room getting the least of it**. Jorge's words:
 * *too verbose*, *a very little frame*, *steps within steps is stressing*.
 *
 * **The song flow is the worked example and this now matches it**: the hosted tool gets the whole
 * window with Pregonero's own chrome around it — `Back`, a title — and the tool's own step bar as
 * the only bar on the screen. Entering visuals leaves the gig flow's bar behind; `Back` returns to
 * the gig flow, at the step it was entered from.
 *
 * **And the two prose blocks are gone.** *Where things land on the wall is Muralista's…* and *It
 * opens on this gig: `gig.json` is read from its folder…* both described the plumbing, which is
 * what this project has deleted from every screen it has appeared on. What they said is true and
 * is recorded here, which is where it belongs:
 *
 * **It never asks for a folder, and that is the whole of what Pregonero contributes.** Pregonero
 * made this gig's `setup/` and knows where it is, so it serves that folder and Muralista reads and
 * writes over a **relative** URL. A question with one knowable answer is not a question — and this
 * one's failure was silent: one level too high and `visuals.json` lands where nothing looks.
 *
 * **Nothing passes between the two.** No preload reaches the frame, nothing is read out of it, and
 * Pregonero learns the room afterwards by reading `visuals.json` — the file is the only channel,
 * which is the boundary the desk-tool cut drew. Since Muralista's `v1.8.0` the folder also gains a
 * `stage.png`; Pregonero puts those bytes on disk without looking at them, exactly as it does the
 * visuals.
 */
function ScreenVisuals({ folderPath, onForward }: { folderPath: string | null; onForward: () => void }) {
  const hosted = canHostTools()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  /**
   * **WHICH OF MURALISTA'S OWN SCREENS IS SHOWING**, and it is the only thing that crosses.
   *
   * **`To the check →` belongs on `2 OUTPUT` and nowhere else** (Jorge, 2026-09-04). While you are
   * on `THE DEAL` or `1 SHAPES` it is a second forward control on a screen that already has one —
   * the nesting problem this step spent a round removing, one layer down.
   *
   * **Muralista announces it; Pregonero does not ask.** One string naming one of Muralista's three
   * cells, posted to `window.parent`. Nothing is read out of the frame, nothing is injected into
   * it, no preload reaches it, and no gig, song, file or geometry crosses in either direction —
   * `announceFlowStep` in `mapper.js` is the whole of the other side. It is the same class of
   * thing as `--no-header` on `bombista serve`: *what to draw*, never *who is asking*.
   *
   * **Only the frame is believed.** The message is taken only when its source is this iframe's own
   * window: any other page on the machine can post to this one, and a control that advances a flow
   * is not a thing to hand to whoever shouts.
   *
   * **Null until it speaks.** An older Muralista, or one that has not rendered yet, says nothing,
   * and the control stays off rather than appearing on a guess.
   */
  const [toolStep, setToolStep] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (frame.current === null || event.source !== frame.current.contentWindow) return
      const data = event.data as { muralista?: unknown; step?: unknown } | null
      if (!data || data.muralista !== 'flow-step' || typeof data.step !== 'string') return
      setToolStep(data.step)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!hosted) return
    let alive = true
    void (async () => {
      // **Served on arrival, not on a press.** The step *is* the tool; a button here would be a
      // door, and a door is the thing this screen removed.
      const result = await serveTool(MURALISTA_KEY, folderPath ?? '', MURALISTA_PAGE)
      if (!alive) return
      if (result.ok) setUrl(result.url)
      else setError(result.error)
    })()
    return () => {
      alive = false
    }
  }, [hosted, folderPath])

  return (
    <section className="gig-flow-page gig-flow-visuals" data-testid="gig-flow-visuals">
      {!hosted ? (
        // **Disabled, not absent.** Muralista is fully usable on its own by requirement, and the
        // escape hatch below is the real answer — but a screen with no control on it reads as a
        // wall rather than as a fork in the road. See `GatedAction`.
        <div data-testid="gig-flow-visuals-unhosted">
          <GatedAction
            site="gig-flow-muralista"
            label="Open Muralista"
            blockedBy="Muralista can only be hosted from the desktop app, not from a browser tab."
            onClick={() => undefined}
          />
          <p className="gig-hint">
            Open <code>mapper.html</code> in Chrome and hand it this gig&rsquo;s folder — that is
            where <code>gig.json</code> is, and where <code>visuals.json</code> goes beside it.
            Pregonero discovers the room on the next re-check.
          </p>
          {folderPath !== null && (
            <p className="folders-source-path" data-testid="gig-flow-visuals-folder">
              {folderPath}
            </p>
          )}
        </div>
      ) : error !== null ? (
        <p className="setup-song-problem" data-testid="gig-flow-visuals-error">
          {error}
        </p>
      ) : url === null ? (
        <p className="gig-hint" data-testid="gig-flow-visuals-starting">
          Starting Muralista…
        </p>
      ) : (
        // **A frame, and nothing but a frame.** No preload, no `nodeIntegration`, nothing read out
        // of it and nothing put into it. What Pregonero knows about this page is the address it was
        // told to draw.
        <iframe
          ref={frame}
          className="gig-flow-frame"
          data-testid="gig-flow-visuals-frame"
          title="Muralista"
          /* **THE CAMERA, AND THIS ONE ATTRIBUTE IS THE WHOLE OF WHY IT WAS MISSING**
             (walked 2026-09-04, cause found the same day). Muralista's `Enable camera` listed no
             camera on a machine with two. It is **Permissions Policy**, not a macOS permission and
             not an entitlement: a cross-origin iframe gets `camera` DISABLED by default, and
             Pregonero's renderer is `file://` while the tool is served from `http://127.0.0.1`.
             Measured in Electron 41 on this machine — without this attribute
             `document.featurePolicy.allowsFeature('camera')` is `false`, `enumerateDevices()`
             returns ONE videoinput with an empty id and a blank label, and `getUserMedia` rejects
             `NotAllowedError`; with it, both real cameras come back by name and the stream opens.
             **Nothing else was needed** — the packaged `Info.plist` already carries
             `NSCameraUsageDescription`, and Electron's default handler grants the request.
             **Standalone Muralista is top-level, which is why this never showed up before the tool
             moved into a frame.** */
          allow="camera"
          src={url}
        />
      )}

      {/* **ONLY ON `2 OUTPUT`.** See `toolStep` above for why, and for what crosses to know it.

          **Unless there is no inner flow to be inside.** Outside the desktop app, and when the
          server refused to start, Muralista is not on this screen at all — the rule is *not while
          you are inside Muralista's own flow*, and in those two states nobody is. Leaving the step
          with no way onward would be the dead end this project has a rule about. */}
      {(!hosted || error !== null || toolStep === 'output') && (
        <div className="gig-actions">
          <button
            type="button"
            className="ctrl-btn gig-flow-primary"
            data-testid="gig-flow-forward"
            onClick={onForward}
          >
            To the check →
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * **Screen 4: the check.**
 *
 * **Not a form.** One line per thing that has to be true, each passing or failing, then one action
 * that leaves. Nothing on it is typed and nothing on it is stored except the press at the bottom.
 *
 * ## It READS `gigReadiness`, and every line names the field it reads
 *
 * **Nothing here forms its own opinion about what ready means** — that is `gigReadiness.ts`'s rule
 * about itself, and a second implementation is the warp problem in a different costume. So every
 * line below is bound to a **structured** field: a `StepStatus`, or `songs[].ready`.
 *
 * **No line is derived from a message.** Step 9's blocking trap was exactly that: a predicate
 * matching the substring `"could not be read"` against rendered prose, so `libertad`'s own wording
 * blocked silently. The `missing` and `notes` strings are shown; they are never read.
 *
 * ## Each designed check is its own line, because each is its own field
 *
 * `v0.47.0` shipped four lines and reported that the design's three checks could not be drawn
 * separately: two lived inside `songs[].missing` prose and the third was mixed in with a bad
 * version and a bad parse. **`gigReadiness` was widened for exactly this** (Jorge, 2026-09-03) —
 * *the last screen before a gig is confirmed should say which thing is wrong, not that something
 * is.* Every line below reads a field:
 *
 * | Line | Reads |
 * |---|---|
 * | The gig knows what night it is | `steps[1].status` |
 * | There is a setlist, and every song in it is one this machine knows | `steps[2].status` |
 * | Every song in the setlist resolves to a file | `songs[].fileResolves` |
 * | Every file those songs name resolves on this machine | `songs[].contentResolves` |
 * | The room is mapped | `steps[3].status` and `visualsRefusal` |
 * | The mapping belongs to this gig | `visualsRefusal === 'other-gig'` |
 * | Every song in the setlist can be performed | `songs[].ready` |
 *
 * ## What blocks, and what only reports
 *
 * **The gate is `steps[4].status`** — readiness's own verdict, not a second opinion assembled
 * here. Since 2026-09-03 that includes **a setlist song whose file will not read**, which stays a
 * *note* at step 2 and *fails* here: **a problem you can route around while composing becomes a
 * blocker at the moment you assert readiness.**
 *
 * **The other failing lines report and do not block**, and the sentence under the button says so
 * rather than leaving a red line beside a live control unexplained. A missing media file is the
 * live case: it stops that song being armed and the ruling widened the gate for the unreadable
 * file and named nothing else.
 */

const CHECK_STATUS_LABEL: Record<StepStatus, string> = {
  complete: 'Pass',
  'not-yet': 'Not yet',
  broken: 'Fails',
}

/** One line: what has to be true, whether it is, and what is in the way. */
function CheckLine({
  id,
  claim,
  status,
  detail,
  notes,
}: {
  id: string
  claim: string
  status: StepStatus
  detail: string[]
  notes?: string[]
}) {
  return (
    <li className="gig-check-line" data-testid={`gig-check-${id}`} data-state={status}>
      <div className="gig-check-head">
        <span className="gig-check-claim">{claim}</span>
        <span className="gig-check-status" data-testid={`gig-check-${id}-status`}>
          {CHECK_STATUS_LABEL[status]}
        </span>
      </div>
      {detail.length > 0 && (
        <ul className="gig-check-detail" data-testid={`gig-check-${id}-detail`}>
          {detail.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {/* **Reported, never blocking**, and marked as such rather than mixed in with what is in the
          way. This is readiness's own distinction, rendered — not a softening of it. */}
      {notes !== undefined && notes.length > 0 && (
        <ul className="gig-check-notes" data-testid={`gig-check-${id}-notes`}>
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ScreenCheck({
  readiness,
  busy,
  onConfirm,
}: {
  readiness: GigReadiness
  busy: boolean
  onConfirm: () => void
}) {
  const step = (n: number) => readiness.steps.find((s) => s.step === n)
  const step1 = step(1)
  const step2 = step(2)
  const step3 = step(3)
  const songs = readiness.songs
  const unreadable = songs.filter((song) => !song.fileResolves)
  const unresolvedFiles = songs.filter((song) => !song.contentResolves)
  const blocked = songs.filter((song) => !song.ready)
  // **An empty setlist is never a pass on a per-song line**: `[].every()` answers true about
  // nothing, which would print PASS over a gig with no songs. Step 2 is what fails it.
  const overSongs = (bad: readonly unknown[]): StepStatus =>
    songs.length === 0 ? 'not-yet' : bad.length === 0 ? 'complete' : 'not-yet'
  // **The room, split into the two questions the design names.** `steps[3].status` covers *is
  // there a room and does it read*; `visualsRefusal` is what tells *another room's mapping* apart
  // from *this file will not parse*, so the second line is a field and not a substring.
  const otherGig = readiness.visualsRefusal === 'other-gig'
  const mappedStatus: StepStatus = otherGig ? 'not-yet' : (step3?.status ?? 'not-yet')
  const belongsStatus: StepStatus = otherGig
    ? 'broken'
    : step3?.status === 'complete'
      ? 'complete'
      : // Nothing to belong to yet. Saying PASS here would be a claim about a mapping that is
        // not there, which is the class of false answer this project has a rule about.
        'not-yet'
  // **THE GATE IS ONE FIELD, AND IT IS READINESS'S.** Nothing is assembled here: `canConfirm` is
  // everything step 4 asserts apart from the confirmation existing, and since 2026-09-03 that
  // includes a setlist song whose file will not read.
  const checksPass = readiness.canConfirm
  const confirmation = readiness.confirmation

  return (
    <section className="gig-flow-page gig-flow-check" data-testid="gig-flow-check">
      <p className="gig-flow-lede">
        <strong>Do this standing in the room.</strong> Everything below was checked against the
        files. Only you can check it against the wall.
      </p>

      <ul className="gig-check-list" data-testid="gig-check-list">
        {step1 !== undefined && (
          <CheckLine
            id="gig"
            claim="The gig knows what night it is."
            status={step1.status}
            detail={step1.missing}
          />
        )}
        {step2 !== undefined && (
          <CheckLine
            id="setlist"
            claim="There is a setlist, and every song in it is one this machine knows."
            status={step2.status}
            detail={step2.missing}
            notes={step2.notes}
          />
        )}
        {/* **The design's first check, and the one that blocks.** A reference this machine has a
            file for, whose file will not read — `libertad`'s live shape. Step 2 keeps it as a
            note; here it fails. */}
        <CheckLine
          id="files"
          claim="Every song in the setlist resolves to a file."
          status={overSongs(unreadable)}
          detail={
            songs.length === 0
              ? ['There are no songs to check.']
              : unreadable.map((song) => `${song.title}: ${song.missing.join('; ')}`)
          }
        />
        {/* **The design's second check.** Only the files a song actually needs count: a
            lyrics-only song names none, and a song whose own file did not read never got as far
            as naming anything. */}
        <CheckLine
          id="media"
          claim="Every file those songs name resolves on this machine."
          status={overSongs(unresolvedFiles)}
          detail={
            songs.length === 0
              ? ['There are no songs to check.']
              : unresolvedFiles.map((song) => `${song.title}: ${song.missing.join('; ')}`)
          }
        />
        {step3 !== undefined && (
          <CheckLine
            id="visuals"
            claim="The room is mapped."
            status={mappedStatus}
            detail={otherGig ? [] : step3.missing}
            notes={step3.notes}
          />
        )}
        {/* **The design's third check, on its own line at last.** It used to share one with a bad
            `visualsVersion` and a file that will not parse; `visualsRefusal` is what tells them
            apart. **Copying last month's gig folder to start the next one renders perfectly and
            reports nothing** — this is the line that reports it. */}
        <CheckLine
          id="belongs"
          claim="The mapping belongs to this gig."
          status={belongsStatus}
          detail={
            otherGig
              ? readiness.refusals
              : belongsStatus === 'complete'
                ? []
                : ['There is no mapping yet to check.']
          }
        />
        <CheckLine
          id="songs"
          claim="Every song in the setlist can be performed."
          status={overSongs(blocked)}
          detail={
            songs.length === 0
              ? ['There are no songs to check.']
              : blocked.map((song) => `${song.title}: ${song.missing.join('; ')}`)
          }
        />
      </ul>

      {confirmation === null ? (
        <p className="gig-hint" data-testid="gig-check-confirmation">
          Setup has not been confirmed for this gig. Arming warns about that; it does not refuse.
        </p>
      ) : confirmation.stale ? (
        <div className="setup-lapsed" data-testid="gig-check-lapsed">
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
        <p className="gig-hint" data-testid="gig-check-confirmation">
          Setup was confirmed on {confirmation.confirmedAt}, and everything it was confirmed against
          is still as it was.
        </p>
      )}

      {/* **ONE action, and it does one thing** (Jorge, 2026-09-03). It confirms setup and lands on
          Backstage. It used to read `Confirm setup and go to the control view`, wrong twice over:
          it named the stage as the destination, and it performed the act that was separated from
          confirming. **Choosing tonight's gig belongs to the gig row's play icon and the control
          view's first column**, not here.

          **`Save to the gigs list` was proposed and rejected on truth.** `gig.json` is written at
          the end of step 1, the setlist writes as it changes, and since the gigs list became the
          folder the gig has been in that list since step 1. The button would save nothing and add
          something already there.

          **A gig can be edited afterwards.** Returning to change a setlist is the normal case, and
          nothing here closes anything. */}
      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn gig-flow-primary"
          data-testid="gig-flow-confirm"
          disabled={busy || !checksPass}
          onClick={onConfirm}
        >
          {confirmation === null ? 'Confirm setup' : 'Confirm setup again'}
        </button>
      </div>
      {/* **A red line beside a live button needs a sentence, or the screen is lying by omission.**
          Some lines block and some report, and which is which is a ruling rather than something
          to be inferred from the colour. */}
      {!checksPass ? (
        <p className="setup-song-problem" data-testid="gig-check-blocked">
          Setup cannot be confirmed while a line above is failing.
        </p>
      ) : (
        blocked.length > 0 && (
          <p className="gig-hint" data-testid="gig-check-reported">
            The failing lines above do not stop setup being confirmed — they stop those songs being
            armed, which is a gate on the night rather than on the gig.
          </p>
        )
      )}
      <p className="gig-hint">
        Confirming records that these checks passed and <strong>what they passed against</strong> —
        the song files, the room, the displays — so it can notice it has stopped being true. It
        never records a matrix, a layout or a pixel size, and it blocks nothing. A gig can be
        changed afterwards; coming back here re-checks the files.
      </p>
    </section>
  )
}

export function GigFlowView() {
  const readiness = useGigReadiness()
  const [busy, setBusy] = useState(false)
  const [here, setHere] = useState(1)
  // **Where `Back` goes from the visuals screen.** That screen leaves the gig flow's bar behind, so
  // the bar cannot say where you came from; this does. Entering from step 2 and entering from the
  // bar on step 4 are both ordinary, and both come back to where they were.
  const [cameFrom, setCameFrom] = useState(2)
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // The version the screen redraws off after a setlist edit. The store is not reactive, and the
  // lists are read straight out of it.
  const [revision, setRevision] = useState(0)

  const exists = readiness.folderPath !== null

  // **The fields, held here rather than per screen**, so stepping back to 1 finds them as they
  // were. The song flow's step bar cost a walk by not doing this: the state existed and the page
  // ignored it.
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [city, setCity] = useState('')
  // What the file said when it was last read, so *dirty* is a comparison and not a flag.
  const [loaded, setLoaded] = useState<{ date: string; venue: string; city: string } | null>(null)

  useEffect(() => {
    void refreshGigReadiness()
  }, [])

  /**
   * **Prefilled from the gig, once per gig.** Nothing on this screen is ever typed twice: the date
   * and the venue are read out of `gig.json`. It keys off the folder rather than the fields, so a
   * character typed into the venue is not undone by the next render — the whole defect the song
   * flow's step bar had, where the state existed and the page ignored it.
   */
  const prefilledFrom = useRef<string | null>(null)
  useEffect(() => {
    const folder = readiness.folderPath
    if (folder === null || prefilledFrom.current === folder) return
    prefilledFrom.current = folder
    const next = {
      date: readiness.date ?? '',
      venue: readiness.venue?.name ?? '',
      city: readiness.venue?.city ?? '',
    }
    setDate(next.date)
    setVenue(next.venue)
    setCity(next.city)
    setLoaded(next)
  }, [readiness.folderPath, readiness.date, readiness.venue])

  const typedSomething = date !== '' || venue.trim() !== '' || city.trim() !== ''
  const edited =
    loaded !== null && (date !== loaded.date || venue !== loaded.venue || city !== loaded.city)

  /**
   * **Whether `Back` has anything to consent to.**
   *
   * **Before the file exists:** anything typed. Nothing has reached disk, so leaving discards it,
   * and that is the whole of what the dialog is about.
   *
   * **After it exists:** only fields edited and not saved. The gig itself is safe — it is on
   * Backstage, incomplete and honest — so its half-made state is not worth a dialog. Typing that
   * has not been saved still is, on the same rule as the song flow: it is a destructive action
   * needing consent, and the walk of 2026-09-02 found exactly this loss twice.
   */
  const somethingToLose = here === 1 && (exists ? edited : typedSomething)

  const leave = () => {
    window.location.hash = '#/setup'
  }

  const askBeforeLeaving = () => {
    if (somethingToLose) setAsking(true)
    else leave()
  }

  /**
   * **Step 1's one action writes, and then the flow moves on.** Creating and saving are the same
   * press because they are the same moment: you have said what the night is, and the next question
   * is which songs.
   *
   * **It moves on only if the write happened.** Navigating away from a failed write would report
   * success by arriving somewhere, which is the defect `Confirm setup` was fixed for.
   */
  const commit = () => {
    setBusy(true)
    setProblem(null)
    void (async () => {
      if (exists) {
        await saveGigIdentity({ date, venue: { name: venue, city } })
        setLoaded({ date, venue, city })
        setBusy(false)
        setHere(2)
        return
      }
      const made = await createGig({ date, venue: { name: venue, city } })
      setBusy(false)
      if (!made.ok) {
        setProblem(made.error)
        return
      }
      setLoaded({ date, venue, city })
      setHere(2)
    })()
  }

  /**
   * **Confirm setup, and land on Backstage** (Jorge, 2026-09-03).
   *
   * **It leaves only if the confirmation was actually recorded.** A failed write keeps you here, in
   * front of the problem: navigating away would report success by arriving somewhere, which is the
   * defect this button was fixed for once already.
   *
   * **Backstage, not the control view.** Confirming asserts that the checks passed; **choosing
   * tonight's gig is a different act**, owned by the gig row's play icon and the control view's
   * first column. One press asserting both is what the split of 02/09 took apart.
   */
  const confirmAndLeave = () => {
    setBusy(true)
    void confirmSetup()
      .then((next) => {
        if (next.confirmation !== null && !next.confirmation.stale) {
          window.location.hash = '#/setup'
        }
      })
      .finally(() => setBusy(false))
  }

  const setlistChanged = () => {
    setRevision((n) => n + 1)
    setBusy(true)
    void publishSetlistToGig().finally(() => setBusy(false))
  }

  /**
   * **WHICH STEPS ARE OPEN, AND EACH ON ITS OWN CONDITION.**
   *
   * Steps 2, 3 and 4 need the gig on disk: step 2 writes a running order into a file, step 3 hands
   * that same folder to Muralista, and step 4 reads what is in it — and there is no folder until
   * step 1 has been committed.
   *
   * **AND STEP 3 NEEDS A SETLIST** (Jorge, 2026-09-04, walking `v0.53.0`). *A gig with no setlist
   * is not a gig* has been step 2's own design since it was built, and nothing enforced it: a gig
   * was created, no song was added, and the visuals opened. **A defect against an existing ruling,
   * not a new rule.**
   *
   * **Step 4 stays open**, because the check is the screen that names what is missing and shutting
   * it would hide the answer — and `Confirm setup` is strict there regardless, on readiness's own
   * `canConfirm`.
   *
   * **The verdict is readiness's**, read off `songs`, not a second opinion assembled here.
   */
  const hasSetlist = readiness.songs.length > 0
  const stepIsOpen = (step: number) => {
    if (step === 1) return true
    if (!exists) return false
    if (step === 3) return hasSetlist
    return step <= BUILT
  }
  const visualsBlockedBy = hasSetlist
    ? null
    : 'A gig with no setlist is not a gig. Add a song above before mapping the room.'

  /** Every move between steps goes through here, so entering visuals always records its way back. */
  const go = (step: number) => {
    if (step === 3 && here !== 3) setCameFrom(here)
    setHere(step)
  }
  // **The header names the night, not the folder.** The folder is an opaque id since 2026-09-03,
  // and a header reading `k3f9x2abcd` tells nobody which gig they are in. Same rule as the row on
  // Backstage, through the same function; screen 1 is where the folder's own name is shown.
  const title = exists
    ? gigLabelFrom(readiness.date, readiness.venue?.name ?? null, readiness.folderPath ?? '')
    : 'New gig'

  const body = (() => {
    if (here === 4)
      return <ScreenCheck readiness={readiness} busy={busy} onConfirm={confirmAndLeave} />
    if (here === 2)
      return (
        <ScreenSetlist
          key={revision}
          busy={busy}
          onChange={setlistChanged}
          onForward={() => go(3)}
          blockedBy={visualsBlockedBy}
        />
      )
    return (
      <ScreenGig
        exists={exists}
        gigId={readiness.gigId}
        date={date}
        venue={venue}
        city={city}
        problem={problem}
        busy={busy}
        onField={(field, value) => {
          if (field === 'date') setDate(value)
          else if (field === 'venue') setVenue(value)
          else setCity(value)
        }}
        onCommit={commit}
      />
    )
  })()

  /**
   * **THE VISUALS STEP IS NOT DRAWN INSIDE THIS FLOW** (Jorge, 2026-09-04, walking `v0.52.0`).
   *
   * It was: Muralista in a box under the gig flow's step bar, so two step bars nested and the tool
   * that most needs the window got a panel of it. **The song flow is the worked example** — it
   * hands Bombista the whole window with Pregonero's chrome, `Back` and a title, and Bombista's own
   * bar as the only bar — and this is the same shape, in the same classes, for the same reason.
   *
   * **The gig flow's bar is left behind on the way in**, which is the whole of what *not nested*
   * means here. `Back` returns to the flow at the step it was entered from; `To the check →` is the
   * way onward and lands on step 4.
   */
  if (here === 3 && !hasSetlist) {
    // **The condition can go away while you are standing on the step** — every song taken back out
    // of the running order on step 2, then the bar's step 3 pressed before this render. Falling
    // back to the setlist is the same answer the bar gives, rather than a screen that is open
    // because it already was.
    setHere(2)
  }

  if (here === 3 && hasSetlist) {
    return (
      <div className="songs-screen gig-visuals-screen">
        <header className="songs-top-bar">
          <button
            type="button"
            className="songs-back"
            data-testid="gig-flow-visuals-back"
            onClick={() => setHere(cameFrom)}
          >
            Back
          </button>
          <h1 className="songs-title" data-testid="gig-flow-visuals-title">
            {title}
          </h1>
        </header>
        <main className="songs-body gig-visuals-body">
          <ScreenVisuals folderPath={readiness.folderPath} onForward={() => setHere(4)} />
        </main>
      </div>
    )
  }

  return (
    <div className="songs-screen gig-flow-screen">
      {/* **Step 1 before the file exists is the one place `Back` destroys something here**, and it
          takes consent for it — the same component and the same second-of-three popup the song
          flow uses. Once `gig.json` exists there is nothing to consent to: the gig is in a list. */}
      {asking && (
        <LeaveWithoutSaving
          site="gig-flow"
          what={
            exists
              ? 'The changes to this gig have not been saved.'
              : 'This gig has not been created.'
          }
          onStay={() => setAsking(false)}
          onLeave={leave}
        />
      )}
      <header className="songs-top-bar">
        <button
          type="button"
          className="songs-back"
          data-testid="gig-flow-leave"
          onClick={askBeforeLeaving}
        >
          Back
        </button>
        <h1 className="songs-title" data-testid="gig-flow-title">
          {title}
        </h1>
      </header>

      <main className="songs-body gig-flow-body">
        <GigStepBar here={here} isOpen={stepIsOpen} onGo={go} />
        {body}
      </main>
    </div>
  )
}
