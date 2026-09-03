/**
 * **The gigs this machine knows about: paths, and nothing else.**
 *
 * Setup home shows every gig in full, and remembering where they are is new stored state that is
 * legitimate — **it is a bookmark list, like recent files.** Losing it costs one trip to a folder
 * picker, which is why it can live in browser storage beside the single open-gig path without
 * anyone having to be careful with it.
 *
 * **Readiness is never stored here, and that is an instruction rather than an observation.** Each
 * row's delta is computed on read, through `gigFolderRead.readGigReadiness` — the fifth rendering
 * of the one readiness function. A stored verdict would go stale precisely when a gig folder is
 * edited from outside Pregonero, which the escape hatch guarantees will happen: every tool in the
 * suite is usable on its own by requirement, so work happens in those folders without this app
 * witnessing it. `libertad` is the standing argument — a flag written when it last passed would
 * still read Ready today, and it is not.
 *
 * **A row whose folder is gone stays in the list**, named. A folder on a disconnected drive is not a
 * deleted gig, and a list that tidied itself would erase the evidence that something moved.
 * (Noticing that it is gone at all is R2's: `readGigFolder` cannot yet tell a moved folder from a
 * fresh empty one.) **The one way a row leaves is the gig being deleted**, which is a thing the
 * person did on purpose and the app watched happen.
 *
 * **This is not the open gig.** `gigFolderStore` holds that, in its own key, and the two never
 * merge: listing a gig is not opening it, and opening one does not empty the list.
 */

export const GIG_LIST_KEY = 'pregoneroGigList'

function read(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(GIG_LIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // **A partly bad list keeps its good rows.** The key is hand-editable and outlives versions;
    // dropping the whole list over one bad entry would lose gigs to a typo.
    return parsed.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
    )
  } catch {
    return []
  }
}

function write(paths: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(paths))
  } catch {
    /* unavailable in some environments */
  }
}

/** Every gig this machine knows about, most recently opened first. */
export function getGigList(): string[] {
  return read()
}

/**
 * Puts a gig at the front of the list, or moves it there if it is already in it.
 *
 * Called when a gig is opened or created. Front, because the list's order is *when you last
 * touched it*, and tonight's gig should not be the fourth row down.
 */
export function rememberGigInList(folderPath: string): void {
  const path = folderPath.trim()
  if (path.length === 0) return
  write([path, ...read().filter((entry) => entry !== path)])
}

/**
 * Takes a gig out of the list.
 *
 * **No longer a control anybody presses** (Jorge, 2026-09-03). `Forget` was a button on the gig row
 * and it went with the row's redesign: dropping the reference and leaving the folder is an action
 * that looks like removal and is not — the same shape as the trash can that came off the song
 * library. The bin on that row deletes the folder instead.
 *
 * **It survives as the second half of deleting**, because this list is not the folder. The Songs
 * list is re-read from `<songs>/song-performance/` on every arrival, so a deleted file stops being a
 * row on its own; these are remembered paths, so a deleted gig has to be taken out of them or its
 * row outlives it. Called only after the folder has actually gone — see `confirmDeleteGig`.
 */
export function forgetGig(folderPath: string): void {
  write(read().filter((entry) => entry !== folderPath))
}

/**
 * Repoints a row at where its folder actually is now, **keeping its place in the list**.
 *
 * *Locate*, not re-add: a gig folder that moved is the same gig, and adding the new path would
 * put it at the front and leave the dead row behind — two rows for one night.
 */
export function replaceGigPath(oldPath: string, newPath: string): void {
  const next = newPath.trim()
  if (next.length === 0) return
  const current = read()
  const at = current.indexOf(oldPath)
  if (at === -1) {
    rememberGigInList(next)
    return
  }
  const replaced = current.map((entry, i) => (i === at ? next : entry))
  // Locating onto a folder that is already listed collapses the two rows rather than duplicating.
  write(replaced.filter((entry, i) => replaced.indexOf(entry) === i))
}
