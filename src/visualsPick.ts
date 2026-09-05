/**
 * **PICKING A FILE FOR A SHAPE, AND IT HAS TO COME FROM THE VISUALS FOLDER** (Jorge, 2026-09-05).
 *
 * Muralista asks; this answers. **Both alternatives were put to Jorge and both were rejected** —
 * *copy it in with consent, into a folder the tools own inside the visuals folder*, which was
 * Cowork's recommendation since it is the shape settled twice elsewhere; and *reference it by
 * absolute path from anywhere*, which reorganises nothing at the price of media that can vanish
 * between setup and the night.
 *
 * **His ruling: no copy, no reference. A file outside the visuals folder is refused, and moving it
 * in is his to do.**
 *
 * ## Why this is not an exception to the boundary rule
 *
 * **In his words: *visuals is used to read, not to write*.** The tools own a room where they write
 * — `song-performance/` inside the songs folder, `setup/` inside a gig folder — because writing
 * into somebody else's territory needs a room of one's own. **The visuals folder is only ever read
 * from**, so there is nothing to carve out and the folder is taken exactly as it is. Cowork called
 * the missing subfolder a hole in the rule; **it is the rule stated properly**, and the three
 * folders now follow one principle instead of two and an exception. **A later round reasoning
 * toward a governed subfolder here has misread which side of the rule this folder is on.**
 *
 * ## Why Pregonero answers and Muralista does not
 *
 * **A cross-origin frame cannot open a file picker at all**, and an `<input type=file>` hands over
 * a bare name with no path — so Muralista could not tell a `logo.png` in the visuals folder from
 * one on the Desktop. **That is a false ACCEPT, which is worse than a false reject.**
 *
 * So the request crosses and the answer comes back as **a name**, which is the currency `?media=`
 * already deals in and the only thing a mapping stores. **No path crosses in either direction** —
 * that is the whole reason Muralista holds names — which is also why the refusal is shown on this
 * side: naming the folder means naming a path.
 */
import { getVisualsFolder } from './contentFolders'
import { chooseFilePath } from './platform'
import { normalizePath } from './paths'

export type VisualPickKind = 'video' | 'image'

/**
 * What a pick came to. **`refused` carries the folder** so the popup can name it; `dismissed` says
 * nothing happened, which is not a refusal and earns no dialog.
 */
export type VisualPick =
  | { outcome: 'picked'; name: string }
  | { outcome: 'dismissed' }
  | { outcome: 'refused'; folder: string }
  | { outcome: 'no-folder' }

/**
 * **Whether `filePath` is inside `folder`, and the name it has there.**
 *
 * Null when it is not. **Segment-wise, never `startsWith`**: `/visuals-old/logo.png` starts with
 * `/visuals` and is a different folder, and a prefix test would accept it.
 */
export function nameInsideFolder(folder: string, filePath: string): string | null {
  const base = normalizePath(folder).split('/').filter((s) => s !== '')
  const file = normalizePath(filePath).split('/').filter((s) => s !== '')
  if (file.length <= base.length) return null
  for (let i = 0; i < base.length; i++) {
    if (base[i] !== file[i]) return null
  }
  // **A relative name, separators and all.** A real visuals folder keeps its animations one level
  // down in a per-song directory, and Muralista's own listing already returns `tragedia/pig.mov`.
  return file.slice(base.length).join('/')
}

/**
 * Opens the dialog **in the visuals folder** and returns what it came to.
 *
 * **The dialog opens at the folder rather than where it was last used.** Every other picker in this
 * app remembers, because every other picker may legitimately go anywhere; this one has exactly one
 * legal destination, and opening somewhere else would invite the pick that is about to be refused.
 */
export async function chooseVisualInsideFolder(kind: VisualPickKind): Promise<VisualPick> {
  const folder = getVisualsFolder()
  if (folder === null) return { outcome: 'no-folder' }
  const chosen = await chooseFilePath(kind, folder)
  if (chosen === null) return { outcome: 'dismissed' }
  const name = nameInsideFolder(folder, chosen)
  if (name === null) return { outcome: 'refused', folder }
  return { outcome: 'picked', name }
}
