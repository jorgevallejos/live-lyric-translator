/** @vitest-environment jsdom */
/**
 * **MEDIA STAYS INSIDE THE VISUALS FOLDER** (Jorge, 2026-09-05). No copy, no reference: a file
 * chosen outside it is refused, and moving it in is his to do.
 *
 * These test the containment question on its own, because it is the half that can be wrong
 * silently. **A refusal that fires is visible; an acceptance that should not have happened is a
 * shape pointing at a file that vanishes between setup and the night**, which is the failure the
 * rejected *reference by absolute path* alternative was rejected for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nameInsideFolder, chooseVisualInsideFolder } from './visualsPick'
import { setVisualsFolder } from './contentFolders'

const chooseFilePath = vi.fn()
vi.mock('./platform', () => ({
  chooseFilePath: (...a: unknown[]) => chooseFilePath(...a),
}))

/** A real `localStorage`, because this environment's own is a stub with no working get or set. */
function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

describe('whether a file is inside the visuals folder', () => {
  it('takes a file directly in the folder, by its bare name', () => {
    expect(nameInsideFolder('/vault/visuals', '/vault/visuals/logo.png')).toBe('logo.png')
  })

  /**
   * **A real visuals folder keeps its animations one level down in a per-song directory**, and
   * Muralista's own listing already returns `tragedia/pig.mov`. The separator travels; only the
   * folder's own prefix comes off.
   */
  it('takes a nested file and keeps the relative path', () => {
    expect(nameInsideFolder('/vault/visuals', '/vault/visuals/tragedia/pig.mov')).toBe(
      'tragedia/pig.mov'
    )
  })

  /**
   * **THE ONE A `startsWith` WOULD GET WRONG, AND IT IS WHY THIS IS SEGMENT-WISE.**
   * `/vault/visuals-old/logo.png` starts with `/vault/visuals` and is a different folder. A prefix
   * test accepts it, stores `-old/logo.png` as the name, and the wall paints nothing on the night.
   */
  it('refuses a sibling folder whose name merely starts the same', () => {
    expect(nameInsideFolder('/vault/visuals', '/vault/visuals-old/logo.png')).toBeNull()
  })

  it('refuses a file somewhere else entirely', () => {
    expect(nameInsideFolder('/vault/visuals', '/Users/jorge/Desktop/logo.png')).toBeNull()
  })

  /** The folder itself is not a file in it, and neither is anything above it. */
  it('refuses the folder itself and its parent', () => {
    expect(nameInsideFolder('/vault/visuals', '/vault/visuals')).toBeNull()
    expect(nameInsideFolder('/vault/visuals', '/vault')).toBeNull()
  })

  it('is unbothered by a trailing slash or a doubled separator', () => {
    expect(nameInsideFolder('/vault/visuals/', '/vault/visuals//logo.png')).toBe('logo.png')
  })

  /** `..` is collapsed before the comparison, so a path that climbs out cannot sneak back in. */
  it('refuses a path that climbs out of the folder and back to somewhere else', () => {
    expect(nameInsideFolder('/vault/visuals', '/vault/visuals/../other/logo.png')).toBeNull()
  })
})

describe('picking a file for a shape', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
    chooseFilePath.mockReset()
  })

  /**
   * **The dialog opens AT the visuals folder, not where it was last used.** Every other picker in
   * the app remembers, because every other picker may legitimately go anywhere; this one has
   * exactly one legal destination, and opening somewhere else invites the pick that is about to be
   * refused.
   */
  it('opens the dialog in the visuals folder', async () => {
    setVisualsFolder('/vault/visuals')
    chooseFilePath.mockResolvedValue('/vault/visuals/logo.png')

    const pick = await chooseVisualInsideFolder('image')

    expect(chooseFilePath).toHaveBeenCalledWith('image', '/vault/visuals')
    expect(pick).toEqual({ outcome: 'picked', name: 'logo.png' })
  })

  it('refuses a file outside it, and carries the folder so the popup can name it', async () => {
    setVisualsFolder('/vault/visuals')
    chooseFilePath.mockResolvedValue('/Users/jorge/Desktop/logo.png')

    expect(await chooseVisualInsideFolder('image')).toEqual({
      outcome: 'refused',
      folder: '/vault/visuals',
    })
  })

  /**
   * **Dismissed is not refused.** Nothing happened, so nothing is reported — a dialog over a
   * cancelled dialog is the app arguing with a decision already made.
   */
  it('says nothing when the dialog is dismissed', async () => {
    setVisualsFolder('/vault/visuals')
    chooseFilePath.mockResolvedValue(null)

    expect(await chooseVisualInsideFolder('video')).toEqual({ outcome: 'dismissed' })
  })

  /** No folder is the same refusal with nothing to name, and the dialog is never opened. */
  it('does not open a dialog at all when no visuals folder is set', async () => {
    expect(await chooseVisualInsideFolder('image')).toEqual({ outcome: 'no-folder' })
    expect(chooseFilePath).not.toHaveBeenCalled()
  })
})
