/**
 * **Which gigs have this song in their setlist.**
 *
 * Asked at one moment only: the press of a song's bin, so the confirmation can **name** the nights
 * it appears in. **It never blocks the delete** (Jorge, 2026-09-02). A gig's setlist keeps its ids
 * and reports what it cannot resolve, so the record of that night stays truthful whether or not the
 * file is still there — and refusing would make the catalogue hostage to its own history, where a
 * song played once in 2024 could never be tidied away.
 *
 * **Each gig folder is read, on the press.** There is no index of this and there should not be: an
 * index would be a second copy of what the gig files say, and the gigs are a handful of folders,
 * read once at the moment somebody is about to do something irreversible. A gig folder that cannot
 * be read is silently not a match — the wrong thing to do about an unplugged drive is to block the
 * delete, and the right one is not to claim it is in a setlist we could not look at.
 *
 * **The gigs come from `<gigs>/setup/`, not from a remembered list** (2026-09-03). The bookmark
 * list is gone, so this asks the same question the gigs column asks and cannot answer differently:
 * a gig missing from a stale list would have made the delete dialog say a song is used nowhere
 * while a setlist on disk still names it.
 */

import { parseGigFile } from './gigFile'
import { readGigFolders } from './gigFolderList'
import { getGigsFolder } from './contentFolders'
import { readGigFolder } from './platform'

export type GigUse = {
  /** Where the gig is, which is the only thing every gig has. */
  path: string
  /** What to call it: the venue when the file names one, the folder otherwise. */
  name: string
}

function basename(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0)
  return parts[parts.length - 1] ?? path
}

/**
 * The gigs whose setlist names `songId`, in the order the gigs folder lists them.
 *
 * Reading is injected so the tests do not need a filesystem — the same seam every other reader in
 * this app uses.
 */
export async function gigsUsingSong(
  songId: string,
  options: {
    list?: () => Promise<string[]>
    read?: (folderPath: string) => Promise<{ gigText: string | null }>
  } = {}
): Promise<GigUse[]> {
  const list =
    options.list ??
    (async () => {
      const gigsRoot = getGigsFolder()
      if (gigsRoot === null) return []
      return (await readGigFolders(gigsRoot)).gigs
    })
  const read = options.read ?? readGigFolder
  const uses: GigUse[] = []
  for (const path of await list()) {
    let text: string | null = null
    try {
      text = (await read(path)).gigText
    } catch {
      continue
    }
    if (text === null) continue
    try {
      const gig = parseGigFile(text)
      if (!(gig.setlist ?? []).includes(songId)) continue
      const venue = gig.venue?.name?.trim()
      uses.push({ path, name: venue && venue.length > 0 ? venue : basename(path) })
    } catch {
      // A gig file that will not parse is not evidence that the song is in it.
      continue
    }
  }
  return uses
}
