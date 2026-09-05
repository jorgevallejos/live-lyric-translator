/**
 * **THE DESIGNED DEFAULT, AS MURALISTA ACTUALLY WROTE IT.**
 *
 * `src/fixtures/muralista-default-room.json` is not hand-written: it is the `visuals.json` a real
 * Muralista produced from a fresh room with one song assigned an animation, saved through the
 * localhost mount into a gig folder. **This reads those bytes with the parser that consumes them
 * on the night.** Regenerated at Muralista `v1.19.0`, the same way, when conditional visibility
 * became named modes — **the file is re-made, never edited**, because the moment somebody hand-fixes
 * it to keep a test green it stops being evidence and starts being an assertion about itself.
 *
 * **It is here because it caught something no unit test could.** Both lyrics shapes have to be in
 * the gig-level default for `song-lyrics` — the condition is what separates them, not the
 * assignment — and Muralista's `adoptGigDefaultIfUnset` takes the FIRST shape of a type and stops.
 * So the second lyrics shape was assigned to nothing, resolved to nothing, and **a song without an
 * animation had no words at all.** Every unit test on either side passed: each repo was correct
 * about its own half.
 *
 * **The rule this encodes: when two tools agree a shape, assert the real bytes.** The same reason
 * `warp.js` is hashed rather than described, and the timeline fixture is frozen rather than
 * paraphrased.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseVisualsFile,
  resolveShapesForType,
  shapeModeId,
  songVideoAssets,
} from './visualsFile'

const room = parseVisualsFile(
  readFileSync(join(__dirname, 'fixtures', 'muralista-default-room.json'), 'utf8'),
  'probe'
)

const lyricsFor = (songId: string) =>
  resolveShapesForType(room, 'song-lyrics', songId).map((s) => s.name)

describe('the default room Muralista writes', () => {
  it('is three shapes: a video frame and two lyrics shapes', () => {
    expect(room.shapes.map((s) => `${s.name}:${s.layer?.type}`)).toEqual([
      'Video frame:song-video',
      'Video lyrics:song-lyrics',
      'Song lyrics:song-lyrics',
    ])
  })

  /**
   * **The two seeded modes, in resolution order, in Jorge's own words.** `Song with lyrics` is
   * first because it is the *no video* branch, so a room whose video shape went missing resolves
   * to it rather than to nothing.
   */
  it('seeds exactly two modes, each reading the video frame one way', () => {
    const frame = room.shapes[0]!.id
    expect(room.modes.map((m) => m.name)).toEqual([
      'Song with lyrics',
      'Song with video and lyrics',
    ])
    expect(room.modes[0]!.when).toEqual({ shape: frame, is: 'empty' })
    expect(room.modes[1]!.when).toEqual({ shape: frame, is: 'filled' })
  })

  /** **The video frame is in NO mode**, so it is on the wall in both of them. */
  it('puts one lyrics shape in each mode and the video frame in neither', () => {
    expect(shapeModeId(room.shapes[0]!)).toBeNull()
    expect(shapeModeId(room.shapes[1]!)).toBe(room.modes[1]!.id)
    expect(shapeModeId(room.shapes[2]!)).toBe(room.modes[0]!.id)
  })

  /** **Both, and this is the line the round trip caught.** One in the list is a song with no words. */
  it('puts BOTH lyrics shapes in the gig-level default for the type', () => {
    expect(room.songVisuals.defaults['song-lyrics']).toHaveLength(2)
  })

  /** **The whole of what this round unlocks**, read off the real file. */
  it('gives the song with an animation words at the foot, and the one without words across the frame', () => {
    expect(lyricsFor('duelo')).toEqual(['Video lyrics'])
    expect(lyricsFor('vidas')).toEqual(['Song lyrics'])
    expect(songVideoAssets(room, 'duelo').named).toEqual(['cerdo.mp4'])
    expect(songVideoAssets(room, 'vidas').named).toEqual([])
  })

  /** Same room, no geometry moved: the video shape is in no mode and resolves for both. */
  it('leaves the video shape resolving for every song, filled or not', () => {
    expect(resolveShapesForType(room, 'song-video', 'duelo')).toHaveLength(1)
    expect(resolveShapesForType(room, 'song-video', 'vidas')).toHaveLength(1)
  })
})
