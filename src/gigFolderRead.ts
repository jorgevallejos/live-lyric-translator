/**
 * **Reading a gig folder without writing to it.**
 *
 * `gigSession.refreshGigReadiness` is the *opening* path, and it writes: a folder with no
 * `gig.json` gets one, and a `gig.json` that has not reached a running order gets the app's
 * written in. Both are right for the gig you are opening — the file accreting, which
 * `docs/formats.md` calls its normal way of growing — and both are wrong for a gig you are merely
 * **looking at**.
 *
 * Setup home draws one row per remembered gig, each row showing that gig's delta. A list built on
 * the opening path would **create `gig.json` in every folder it drew**, and would push whichever
 * setlist happens to be active into all of them. That is not a bug you notice: it is four
 * plausible-looking files appearing because a screen was rendered.
 *
 * So this is the same readiness function reached by a different route, and the whole of its
 * contract is what it does not do:
 *
 * - **it writes nothing**, ever, under any branch;
 * - **it does not touch the session** — nothing is published, no room is broadcast to the
 *   Projection window, and the remembered gig folder does not move;
 * - **it reads the running order from the gig's own file**, never from the app's active setlist,
 *   which belongs to whichever gig is open and would otherwise make every row show the same songs;
 * - **it does not run `bombista` by default**, because fourteen songs across four rows is
 *   fifty-six subprocesses to draw a screen, and Bombista's findings are notes rather than
 *   blockers — a row's verdict does not move without them. It reports that they were skipped
 *   rather than implying they passed.
 *
 * **It is still not a second opinion about readiness.** `computeGigReadiness` decides; this
 * gathers. The fifth view of the one function is a row, and a row is the same delta rendered small.
 */

import { parseGigFile, readGigSetlist, type GigFile } from './gigFile'
import {
  computeGigReadiness,
  type GigReadiness,
  type MediaResolution,
  type SetlistSongInput,
  type SongValidation,
} from './gigReadiness'
import {
  parseVisualsFile,
  visualsRefusalKind,
  type VisualsFile,
  type VisualsRefusalKind,
} from './visualsFile'
import { getLibraryEntries, type LibraryEntry } from './setlistStore'
import { resolveSongPath } from './contentFolders'
import { resolveMediaPath } from './mediaPathStore'
import * as platform from './platform'

export type ReadGigOptions = {
  /**
   * Ask `bombista` about each song. Off by default — see above. A single gig being looked at
   * closely can afford it; a list of them cannot.
   */
  validate?: boolean
}

/**
 * The library, indexed by id, for turning the gig file's song ids into songs this machine can
 * read. **Read, never written**: the cache belongs to hydration and to the open gig, and a row
 * being drawn is not a reason to replace it.
 */
function libraryById(): Map<string, LibraryEntry> {
  try {
    return new Map(getLibraryEntries().map((entry) => [entry.ref.id, entry]))
  } catch {
    return new Map()
  }
}

/**
 * The gig's own running order as readiness input.
 *
 * A song the file names that this machine cannot turn into a file is carried as an entry with an
 * error rather than dropped: a row that silently shortened its own setlist would be reporting a
 * gig that is more complete than it is.
 */
function setlistFromGig(gig: GigFile, folderPath: string): SetlistSongInput[] {
  const known = libraryById()
  return readGigSetlist(gig, folderPath).map((entry) => {
    const cached = known.get(entry.id)
    const path = entry.path ?? (cached ? resolveSongPath(cached.ref.path) : entry.id)
    const song = cached?.song ?? null
    return {
      id: entry.id,
      title: entry.title ?? cached?.song?.title ?? entry.id,
      path,
      song,
      ...(song
        ? {}
        : { error: cached?.error ?? `${path} could not be read on this machine.` }),
    }
  })
}

async function resolveMedia(
  setlist: readonly SetlistSongInput[]
): Promise<Record<string, MediaResolution>> {
  const out: Record<string, MediaResolution> = {}
  for (const entry of setlist) {
    const src = entry.song?.media?.src
    if (!src || out[src]) continue
    const linkedPath = resolveMediaPath(src)
    if (!linkedPath) {
      out[src] = { linked: false, exists: false }
      continue
    }
    out[src] = { linked: true, exists: await platform.fileExists(linkedPath) }
  }
  return out
}

async function validateSetlist(
  setlist: readonly SetlistSongInput[],
  validate: boolean
): Promise<Record<string, SongValidation>> {
  const out: Record<string, SongValidation> = {}
  if (!validate) {
    // **Skipped, and it says so.** `validationSkipped` is derived from every song carrying this
    // status, and it makes the screen report a missing check rather than a passed one.
    for (const entry of setlist) {
      out[entry.id] = { status: 'skipped', reason: 'not run while listing gigs' }
    }
    return out
  }
  let skipReason: string | null = null
  for (const entry of setlist) {
    if (skipReason !== null) {
      out[entry.id] = { status: 'skipped', reason: skipReason }
      continue
    }
    const result = await platform.validateSongForPerformance(entry.path)
    out[entry.id] = result
    if (result.status === 'skipped') skipReason = result.reason
  }
  return out
}

/** One gig folder's delta, read and never written. */
export async function readGigReadiness(
  folderPath: string,
  options: ReadGigOptions = {}
): Promise<GigReadiness> {
  let read = await platform.readGigFolder(folderPath)

  let gig: GigFile | null = null
  let gigProblem: string | null = read.gigError

  if (read.gigText !== null && gigProblem === null) {
    try {
      gig = parseGigFile(read.gigText)
    } catch (e) {
      gigProblem = e instanceof Error ? e.message : String(e)
    }
  }

  // The gig may point somewhere other than ./visuals.json; the first read used the default.
  // **This is a second read, not a write** — the opening path does the same thing here.
  if (gig !== null && gig.visuals && gig.visuals !== './visuals.json') {
    read = await platform.readGigFolder(folderPath, gig.visuals)
  }

  let visuals: VisualsFile | null = null
  let visualsProblem: string | null = read.visualsError
  // **Which refusal it was, carried beside the sentence** (2026-09-03), so the check screen can
  // tell *this mapping is another room's* from *this file will not parse* without reading prose.
  // A folder read that failed before the parse is `unreadable`, so callers have one vocabulary.
  let visualsRefusal: VisualsRefusalKind | null = read.visualsError ? 'unreadable' : null
  if (read.visualsText !== null && gig !== null && visualsProblem === null) {
    try {
      visuals = parseVisualsFile(read.visualsText, gig.id)
    } catch (e) {
      visualsProblem = e instanceof Error ? e.message : String(e)
      visualsRefusal = visualsRefusalKind(e)
    }
  }

  const setlist = gig === null ? [] : setlistFromGig(gig, folderPath)
  const [mediaResolution, validation] = await Promise.all([
    resolveMedia(setlist),
    validateSetlist(setlist, options.validate === true),
  ])

  // **No fingerprints.** They exist so the setup confirmation can notice something moved, and
  // taking them here would mean asking the main process about displays once per row for a value
  // nothing on this screen reads.
  return computeGigReadiness({
    folderPath,
    gig,
    gigProblem,
    visualsPresent: read.visualsPresent,
    visuals,
    visualsProblem,
    visualsRefusal,
    setlist,
    mediaResolution,
    validation,
  })
}
