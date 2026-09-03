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
function GigStepBar({ here, reachable, onGo }: { here: number; reachable: number; onGo: (step: number) => void }) {
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
          const open = step <= reachable
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

      <div className="gig-actions">
        <button
          type="button"
          className="ctrl-btn gig-flow-primary"
          data-testid="gig-flow-commit"
          disabled={busy || (!exists && !answered)}
          onClick={onCommit}
        >
          {exists ? 'Save the gig' : 'Create the gig'}
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
function ScreenSetlist({ busy, onChange }: { busy: boolean; onChange: () => void }) {
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
 * **Screen 3: the room, and it is Muralista doing it.**
 *
 * **The tool in a frame, not a door to it** (2026-09-03). Muralista's own flow — `THE DEAL ·
 * 1 LAYOUT · 2 SHAPES · 3 OUTPUT` — runs inside this page the way Bombista's three pages run inside
 * the song flow, so pressing *keep the default* over there is not a launch into another program.
 * A door with an `Open Muralista` button is what this replaces; `MuralistaDoor` is still the
 * unhosted answer and still the one used from `GigView`.
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
function ScreenVisuals({ folderPath }: { folderPath: string | null }) {
  const hosted = canHostTools()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <p className="gig-flow-lede">
        Where things land on the wall is <strong>Muralista’s</strong>, and this is Muralista: the
        shapes and the type of each, mapped standing in front of the wall, which is the only place
        those decisions can honestly be made. One setup serves every song in the gig.
      </p>

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
            Open <code>mapper.html</code> in Chrome and hand it this gig’s folder — that is where{' '}
            <code>gig.json</code> is, and where <code>visuals.json</code> goes beside it. Pregonero
            discovers the room on the next re-check.
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
        <>
          {/* **A frame, and nothing but a frame.** No preload, no `nodeIntegration`, nothing read
              out of it and nothing put into it. What Pregonero knows about this page is the
              address it was told to draw. */}
          <iframe
            className="gig-flow-frame"
            data-testid="gig-flow-visuals-frame"
            title="Muralista"
            src={url}
          />
          <p className="gig-hint" data-testid="gig-flow-visuals-endpoint">
            It opens on this gig: <code>gig.json</code> is read from its folder and{' '}
            <code>visuals.json</code> is written back beside it.{' '}
            <strong>You are not asked where</strong> — Pregonero made that folder and knows it.
            Muralista decides every byte; Pregonero puts them on disk without reading them and
            learns the room afterwards by reading the file.
          </p>
        </>
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
 * ## Where these lines and the designed ones differ, which is a finding rather than a liberty
 *
 * The design names three checks — *every song in the setlist resolves to a file*, *every file those
 * name resolves*, *the visuals belong to this gig*. **`GigReadiness` computes all three and exposes
 * none of them separably.** They live inside per-step `missing`/`notes` prose and inside
 * `songs[].missing`, so:
 *
 * - The first two collapse into one line, `every song can be performed`, which is
 *   `songs.every(s => s.ready)` — the union of *its file read*, *its media resolves* and *a shape
 *   carries it*. Splitting them means reading prose, which is the trap above.
 * - The third is `steps[3].status !== 'broken'`, which also covers an unknown `visualsVersion` and
 *   a file that will not parse. The refusal's own sentence names which it was.
 *
 * **And they disagree about what blocks.** A setlist song whose file will not read is a `note` on
 * step 2, deliberately: a step that can never complete while a known-broken song sits in the
 * library is a guided path nobody can walk, and `libertad` is the standing example. The design's
 * first line says that *fails*. **The gate here is readiness's, unchanged** — steps 1 to 3 complete
 * — and the song line reports without blocking. Widening `gigReadiness` to reconcile them is not
 * this round's to do.
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
  const blocked = readiness.songs.filter((song) => !song.ready)
  // **Every song can be performed**, from `songs[].ready` and nothing else. An empty setlist is not
  // a pass here: step 2 already fails it, and `[].every()` would answer true about nothing.
  const songsStatus: StepStatus =
    readiness.songs.length === 0 ? 'not-yet' : blocked.length === 0 ? 'complete' : 'not-yet'
  // **The gate is readiness's, unchanged**: steps 1 to 3 complete. Not the song line — see the
  // header. `GigView` gates the same press the same way, off the same fields.
  const checksPass = [step1, step2, step3].every((s) => s?.status === 'complete')
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
        {step3 !== undefined && (
          <CheckLine
            id="visuals"
            claim="The room is mapped, and the mapping is this gig’s."
            status={step3.status}
            detail={step3.missing}
            notes={step3.notes}
          />
        )}
        <CheckLine
          id="songs"
          claim="Every song in the setlist can be performed."
          status={songsStatus}
          detail={
            readiness.songs.length === 0
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
          title={checksPass ? undefined : 'The checks above have to pass first.'}
          onClick={onConfirm}
        >
          {confirmation === null ? 'Confirm setup' : 'Confirm setup again'}
        </button>
      </div>
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

  // Steps 2, 3 and 4 are reachable once the gig is on disk, and not before. Step 2 writes a running
  // order into a file, step 3 hands that same folder to Muralista, and step 4 reads what is in it —
  // and there is no folder until step 1 has been committed.
  const reachable = exists ? BUILT : 1
  // **The header names the night, not the folder.** The folder is an opaque id since 2026-09-03,
  // and a header reading `k3f9x2abcd` tells nobody which gig they are in. Same rule as the row on
  // Backstage, through the same function; screen 1 is where the folder's own name is shown.
  const title = exists
    ? gigLabelFrom(readiness.date, readiness.venue?.name ?? null, readiness.folderPath ?? '')
    : 'New gig'

  const body = (() => {
    if (here === 4)
      return <ScreenCheck readiness={readiness} busy={busy} onConfirm={confirmAndLeave} />
    if (here === 3) return <ScreenVisuals folderPath={readiness.folderPath} />
    if (here === 2) return <ScreenSetlist key={revision} busy={busy} onChange={setlistChanged} />
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
        <GigStepBar here={here} reachable={reachable} onGo={setHere} />
        {body}
      </main>
    </div>
  )
}
