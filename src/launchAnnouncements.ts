/**
 * **What has already been said out loud this launch, and about what.**
 *
 * Two conditions are reported here, and they are the same kind of thing: a **song file that will
 * not read** and a **folder that will not read**. Both are created outside the tools — somebody
 * edited a file, moved a folder, unplugged a drive — so both are reported in a dialog and then
 * dropped, rather than standing in the page as a red mark on a screen whose job is the two lists
 * that decide tonight.
 *
 * **Once per launch, not once ever.** Nothing tells the app that a file was repaired or a drive
 * plugged back in, so a record that outlived the process would silence a problem the person never
 * fixed. These are deliberately in memory and deliberately not in `localStorage` — the difference
 * from `vanishedSongs.ts`, which persists because a *removal* is an event that happened once in
 * the world rather than a condition rediscovered on every launch.
 *
 * **Each record is replaced, not added to**, for the same reason as that sibling: a file that reads
 * again drops out of the set, so breaking a second time in the same launch is a second event.
 *
 * **The standing condition is not this module's business.** A folder that cannot be read keeps its
 * half's buttons disabled and its frame line on screen for as long as it holds; what happens once
 * is the interruption.
 */

function launchRecord() {
  let announced = new Set<string>()
  return {
    /** The names that have become a problem since the app last said so, in the order given. */
    newly(names: readonly string[]): string[] {
      return names.filter((name) => !announced.has(name))
    },
    /** Records what the person has now been told about, as the whole of it, not an addition. */
    record(names: readonly string[]): void {
      announced = new Set(names)
    },
    /** Test seam only: a fresh launch. Nothing in the app calls this — a launch is a fresh module. */
    forget(): void {
      announced = new Set()
    },
  }
}

/** Song files in the catalogue that would not parse, by file name. */
export const unreadableSongs = launchRecord()

/** The two folders this machine was pointed at, by the key of the half they belong to. */
export const unreadableFolders = launchRecord()

/** Test seam only: both records, as a fresh launch would have them. */
export function forgetLaunchAnnouncements(): void {
  unreadableSongs.forget()
  unreadableFolders.forget()
}
