/**
 * **The two marks a row's own actions wear: a pencil and a bin.**
 *
 * Pregonero already had both, drawn inside `ManageSetlistsView`, and Backstage's song rows now use
 * the same two rather than a second pair that would drift. **A shared mark is the vocabulary; two
 * copies of it is an accident waiting to be noticed as a difference.**
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
