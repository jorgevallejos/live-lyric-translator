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
  /**
   * Backstage → Songs → New, when no songs folder is set, the folder cannot be read, or
   * `bombista` cannot be run. It was `setup-new-song-create` until 2026-09-02, on a form that
   * asked for a name and wrote a skeleton; both are gone and the button enters the flow.
   */
  'setup-new-song',
  /** Setup home → New gig, when there is no Electron and so no gig can be made at all. */
  'setup-new-gig',
  /**
   * Setup home → Import, same block and same reason. It is a **sibling of `New`** as of
   * 2026-09-02, and a sibling that vanishes while its peer stays disabled is not on the same
   * level — which is the whole of what that change was about.
   */
  'setup-import-gig',
  /** The gig flow, step 1 → Create the gig, before there is a gigs folder or a legal name. */
  'setup-create-gig',
  /** A song's visuals door → Open Muralista, when tool hosting is unavailable. */
  'muralista-open',
  /** The gig's own visuals half → Open Muralista, same door and same block, different question. */
  'muralista-open-gig',
  /** First run → Confirm, until both questions have an answer. */
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
  /**
   * **The id of an element already saying why, when one exists** (2026-09-02). The reason is then
   * not printed under this button — it points at that element instead.
   *
   * **This is not the rule being relaxed.** The rule is that a blocked control is visible and its
   * reason is legible, never that the sentence is printed in this particular place. Backstage's
   * folder block holds three controls in one half at once, and printing the same sentence three
   * times over two frames is the wall the rule exists to prevent, arrived at from the other side.
   * The line in the frame is the reason, and it is one line.
   */
  describedBy?: string
}

export function GatedAction({
  site,
  label,
  blockedBy,
  onClick,
  busy = false,
  remedy,
  describedBy,
}: Props) {
  const blocked = blockedBy !== null
  const elsewhere = blocked && describedBy !== undefined
  return (
    <div className="gated-action" data-testid={`${site}-wrap`}>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={site}
        disabled={blocked || busy}
        // The reason reaches a pointer and a screen reader as well as the eye. It is rendered
        // below too — or, when `describedBy` names where it already is, over there: a `title`
        // alone is a reason nobody on a touch screen ever sees.
        title={blockedBy ?? undefined}
        aria-describedby={blocked ? (describedBy ?? `${site}-reason`) : undefined}
        onClick={onClick}
      >
        {label}
      </button>
      {blocked && !elsewhere && (
        <p className="gated-action-reason" id={`${site}-reason`} data-testid={`${site}-reason`}>
          {blockedBy}
          {remedy !== undefined && <> {remedy}</>}
        </p>
      )}
    </div>
  )
}
