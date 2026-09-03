/**
 * **The dialog that stands in front of a `Back` that destroys something.**
 *
 * `Back` means two things in this app depending on how deep you are. On Backstage it is a
 * navigation and costs nothing. Inside a flow it is a **teardown**: the song flow's `Back` kills
 * the `bombista serve` process and the session's memory is that process's memory, and the gig
 * flow's `Back` on step 1 throws away fields that have never reached disk. One control, two
 * meanings, and the walk of 2026-09-02 lost an afternoon to the difference.
 *
 * **It adds no new kind of popup.** It is the second of the three the suite allows — a destructive
 * action needing consent — and it is deliberately the same shape, the same overlay and the same two
 * buttons as deleting a song. **Three is the ceiling**, and a fourth kind would mean something had
 * been misclassified rather than that a dialog was missing.
 *
 * **One component, because two screens use it.** The song flow and the gig flow are asking the same
 * question about different things, and two copies of a consent dialog is two copies that can drift
 * into meaning different things by looking different. Only the sentence naming what is lost differs,
 * so only that is a prop.
 *
 * **`Stay` is first.** The dialog exists for the press that was a mistake, so the button that undoes
 * the mistake is the one nearest the way back. `Delete` sits second for the same reason.
 *
 * ## One consent-dialog shape across the suite, and this is the half that moved
 *
 * **Left-aligned title and text, two outlined buttons, the leaving action on the right** (Jorge,
 * 2026-09-03). Bombista's `No recording` and this one are the same category of thing either side of
 * a seam the person cannot see, and they were in two visual languages: this one centred, that one
 * left-aligned with a filled button. **It cannot be a shared component** — Bombista is a Python
 * process rendering its own HTML — so the shape is written down in `journey-setup.md` and
 * implemented twice, and each implementation says so.
 *
 * **Left, because every other surface in the suite is left.** A centred dialog is the only centred
 * text in either product, and the ragged-right edge is what the eye already reads everything else
 * down.
 *
 * **The consequence, stated rather than discovered later:** this no longer looks exactly like the
 * delete-song dialog it was built to match. It still shares the overlay, the box and the two
 * buttons; only the alignment differs. Deleting a song is the same category of thing and should
 * follow, but it was not in this round's findings and is not moved on a guess.
 */
export function LeaveWithoutSaving({
  what,
  site,
  onStay,
  onLeave,
}: {
  /** What has not been saved, in the words the screen shows. One sentence, naming the thing. */
  what: React.ReactNode
  /** Which flow is asking. It only names the test ids, so the two dialogs can be told apart. */
  site: string
  onStay: () => void
  onLeave: () => void
}) {
  return (
    <div className="ctrl-timeline-save-overlay" data-testid={`${site}-leave-popup`}>
      <div
        className="ctrl-timeline-save-dialog leave-without-saving"
        role="dialog"
        aria-modal="true"
        aria-label="Leave without saving?"
      >
        <p className="ctrl-timeline-save-message" data-testid={`${site}-leave-title`}>
          Leave without saving?
        </p>
        <p className="leave-without-saving-what" data-testid={`${site}-leave-what`}>
          {what} <strong>What you have typed here will be lost.</strong>
        </p>
        <div className="ctrl-timeline-save-actions leave-without-saving-actions">
          <button
            type="button"
            className="ctrl-btn"
            data-testid={`${site}-leave-stay`}
            onClick={onStay}
          >
            Stay
          </button>
          <button
            type="button"
            className="ctrl-btn leave-without-saving-confirm"
            data-testid={`${site}-leave-confirm`}
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
