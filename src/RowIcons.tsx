/**
 * **The marks a row's own actions wear: a pencil, a bin, and — on a gig — a play triangle.**
 *
 * Pregonero already had both, drawn inside the manage-setlists screen, and Backstage's song rows
 * took the same two rather than a second pair that would drift. **A shared mark is the vocabulary;
 * two copies of it is an accident waiting to be noticed as a difference.** That screen was deleted
 * on 2026-09-03 and these outlived it, which is what a shared mark is for.
 *
 * Feather's geometry, `currentColor`, `aria-hidden`: the button beside them carries the name, so
 * the mark is decoration to a screen reader and meaning to an eye.
 */

export function PencilIcon() {
  return (
    <svg
      className="manage-setlists-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function TrashCanIcon() {
  return (
    <svg
      className="manage-setlists-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

/**
 * **A play triangle, and deliberately not the word `Play`** (Jorge, 2026-09-03, built 09-04).
 *
 * `Play` would overclaim: **nothing starts until you arm.** The triangle says *this is the one you
 * are going to perform* without promising that pressing it begins anything, which is exactly what
 * selecting a gig does.
 *
 * **Filled, where the pencil and the bin are stroked.** The other two act on the row; this one
 * leaves with it, and a solid mark is how that difference is legible at a glance rather than by
 * reading three tooltips. Same 16px box and same `currentColor`, so it sits in the same rhythm.
 *
 * **Feather's own `play` geometry, verbatim** — the same source the pencil and the bin came from,
 * so the three are one vocabulary rather than two drawn alike. It is a `polygon` because Feather's
 * is: a hand-rolled path with rounded tips would be a fourth idea about what these marks look
 * like.
 */
export function PlayTriangleIcon() {
  return (
    <svg
      className="manage-setlists-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21" />
    </svg>
  )
}
