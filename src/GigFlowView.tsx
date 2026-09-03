import { useEffect, useRef, useState } from 'react'
import { createGig, refreshGigReadiness, publishSetlistToGig, saveGigIdentity } from './gigSession'
import { useGigReadiness } from './useGigReadiness'
import { gigIdentityIsAnswered, gigLabelFrom } from './gigFile'
import { getGigsFolder } from './contentFolders'
import { gigFolderIn } from './fileLayout'
import { LeaveWithoutSaving } from './LeaveWithoutSaving'
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
 * **Screens 1 and 2 are built. 3 and 4 are the bar's later steps** and are deliberately not
 * enterable: a segment that opened an empty page would say the step exists and does nothing, which
 * is worse than a segment that says it is not here yet. Muralista's own flow is another repo's
 * round, and step 4's checks are their own.
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

/** The two that exist. Everything after them is a later step, and the bar says so. */
const BUILT = 2

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

  const setlistChanged = () => {
    setRevision((n) => n + 1)
    setBusy(true)
    void publishSetlistToGig().finally(() => setBusy(false))
  }

  // Step 2 is reachable once the gig is on disk, and not before: it writes a running order into a
  // file, and there is no file until step 1 has been committed.
  const reachable = exists ? BUILT : 1
  // **The header names the night, not the folder.** The folder is an opaque id since 2026-09-03,
  // and a header reading `k3f9x2abcd` tells nobody which gig they are in. Same rule as the row on
  // Backstage, through the same function; screen 1 is where the folder's own name is shown.
  const title = exists
    ? gigLabelFrom(readiness.date, readiness.venue?.name ?? null, readiness.folderPath ?? '')
    : 'New gig'

  const body = (() => {
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
