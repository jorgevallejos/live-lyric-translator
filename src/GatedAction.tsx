/**
 * **An action with an unmet precondition renders disabled, with the reason attached. It is never
 * absent.**
 *
 * This is written as a rule rather than as a layout preference because it is the one that erodes a
 * screen at a time, and because it has now produced the same defect twice in the same week.
 *
 * **Where it came from.** The 2026-08-31 end-to-end run stopped at setup step 1: the step stated a
 * requirement, disabled both navigation buttons, offered no action and pointed at a terminal. The
 * whole setup redesign exists to remove that. Walking the redesign the same day, `New song` had no
 * action because no songs folder was set — **the same shape, reappearing inside the fix for it.**
 * The message was correct and named what to do, and it still read as a wall.
 *
 * **The lesson is not the setting.** A precondition discovered at the moment you need it is a dead
 * end however well it is worded, and the two halves of the answer are different sizes:
 *
 * - The cure is to stop discovering settings at the moment they are needed — first run, which asks
 *   once for what the app needs and leaves preferences as the place you *change* things rather than
 *   the place you find out they exist.
 * - This is the other half, and it stays useful after the cure. **A vanished control reads as a
 *   wall; a disabled one with a sentence beside it reads as a next step.** The difference is
 *   whether the person can see that the thing they wanted is a thing the app does at all.
 *
 * **Say the caveat out loud rather than letting it be discovered.** Once first run exists, most of
 * these blocked states become nearly unreachable. *Nearly* is not *never* — a cleared setting, a
 * folder moved in Finder, a machine restored from a backup — and the rule generalises far past the
 * button that produced it. It is cheap, and the failure it prevents is the most expensive kind this
 * app has: a person concluding the app cannot do something it can.
 *
 * **What this is not.** It is not an argument for enabling everything and failing on click. The
 * button is genuinely disabled and genuinely does nothing; what changes is that it is *there*, and
 * that the reason is beside it rather than in its place. Nor does it apply to a control that is
 * meaningless rather than blocked — a **Close gig** button with no gig open is not a blocked
 * action, it is an action about nothing, and it stays absent.
 */

import type { ReactNode } from 'react'

/**
 * The places this rule governs today.
 *
 * **A list, because counting it is the only way this rule survives** — the same reason `SONG_DOORS`
 * is a list a test counts. A site removed from here without its screen changing is a control that
 * has quietly gone back to vanishing.
 */
export const GATED_SITES = [
  /** Setup home → New song → Create, when no songs folder is set or `bombista` cannot be run. */
  'setup-new-song-create',
  /** Setup home → New gig, when there is no Electron and so no gig can be made at all. */
  'setup-new-gig',
  /** The gig flow, step 1 → Create the gig, before there is a gigs folder or a legal name. */
  'setup-create-gig',
  /** A song's visuals door → Open Muralista, when tool hosting is unavailable. */
  'muralista-open',
  /** The gig's own visuals half → Open Muralista, same door and same block, different question. */
  'muralista-open-gig',
  /** The song door → Align, before both the words and the recording are chosen. */
  'subflow-align',
  /** The song door → Review and tempo, before there is an alignment to review. */
  'subflow-review',
  /** The song door → Add to the library, before there is anything to add. */
  'subflow-add',
  /** First run → Use these folders, until both questions have an answer. */
  'first-run-confirm',
] as const

export type GatedSite = (typeof GATED_SITES)[number]

type Props = {
  /** Stable id, and a member of `GATED_SITES`. */
  site: GatedSite
  label: string
  /**
   * Why the action cannot run, or null when it can. **A sentence, not a word** — it is the whole of
   * what turns a dead control into a next step, so it names what is missing and where it is set.
   */
  blockedBy: string | null
  onClick: () => void
  /** Held for a reason other than a precondition — a request already in flight. */
  busy?: boolean
  /** Optional way to go and satisfy the precondition, rendered beside the reason. */
  remedy?: ReactNode
}

export function GatedAction({ site, label, blockedBy, onClick, busy = false, remedy }: Props) {
  const blocked = blockedBy !== null
  return (
    <div className="gated-action" data-testid={`${site}-wrap`}>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={site}
        disabled={blocked || busy}
        // The reason reaches a pointer and a screen reader as well as the eye. It is rendered
        // below too: a `title` alone is a reason nobody on a touch screen ever sees.
        title={blockedBy ?? undefined}
        aria-describedby={blocked ? `${site}-reason` : undefined}
        onClick={onClick}
      >
        {label}
      </button>
      {blocked && (
        <p className="gated-action-reason" id={`${site}-reason`} data-testid={`${site}-reason`}>
          {blockedBy}
          {remedy !== undefined && <> {remedy}</>}
        </p>
      )}
    </div>
  )
}
