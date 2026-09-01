/**
 * **Which vanished songs have already been said out loud.**
 *
 * The Songs list tells the truth about the folder. This tells the truth about the *change* — and a
 * change is an event, not a state. *These files were removed* is worth interrupting for once; *these
 * files are absent* is a condition, and a popup that reappeared on every arrival would be reporting
 * the condition, which is what a standing line above the list was doing before 2026-09-01.
 *
 * So the popup fires on the arrival where the disappearance is **discovered**: the ids the folder
 * did not list, minus the ids already announced.
 *
 * **Nothing here forgets a song.** These are ids that have been *mentioned*, not references that
 * have been dropped: the library keeps every reference, and an unmounted drive that comes back puts
 * every one of them into the list again. This module is bookkeeping about what the person has been
 * told, which is why it lives in the app's own storage and never in the catalogue.
 *
 * **An id that comes back is forgotten here**, so vanishing a second time is a second event and is
 * announced again. That is the whole reason the record is replaced on every arrival rather than
 * added to.
 */

const KEY = 'pregoneroAnnouncedVanishedSongs'

function readAnnounced(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

/**
 * **The ids that have gone since the app last said so**, in the order they were given.
 *
 * Empty is the ordinary answer and means nothing changed, which is exactly when no popup should
 * appear.
 */
export function newlyVanished(gone: readonly string[]): string[] {
  const announced = new Set(readAnnounced())
  return gone.filter((id) => !announced.has(id))
}

/**
 * Records what the person has now been told about, as the whole of it rather than an addition.
 *
 * **Call this only when the folder was actually read.** With no answer from the folder nothing is
 * absent from it, and writing an empty record on that would forget an announcement that was made —
 * so the same songs would be announced again the next time the catalogue *was* read, on no new
 * event.
 */
export function recordVanishedAnnounced(gone: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (gone.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify([...gone]))
  } catch {
    /* unavailable in some environments */
  }
}
