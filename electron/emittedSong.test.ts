/**
 * **How the song flow's end reaches Pregonero.**
 *
 * `Save to the catalogue` writes a file and stays on the page — it is Bombista's page, in a frame
 * Pregonero does not reach into, so there is no press to hear and no channel to open. **A directory
 * in and a file path out** is the whole contract, and this is the *out*.
 *
 * Real files in a real temporary directory: the thing under test is which names in a directory
 * mean what, and an injected `readdirSync` would let the test agree with a wrong answer.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const { emittedSongIn } = require('./emittedSong.cjs') as {
  emittedSongIn: (folderPath: string, since?: number) => { path: string | null }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-staging-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, secondsAgo = 0): string {
  const full = join(dir, name)
  writeFileSync(full, '{}')
  if (secondsAgo > 0) {
    const when = new Date(Date.now() - secondsAgo * 1000)
    utimesSync(full, when, when)
  }
  return full
}

describe('the file `Save to the catalogue` wrote', () => {
  it('is nothing at all before it is pressed', () => {
    write('asr-words.jsonl')
    write('asr-words.meta.json')
    expect(emittedSongIn(dir).path).toBeNull()
  })

  it('is the <stem>.json that appears beside the run’s own working files', () => {
    write('asr-words.jsonl')
    write('asr-words.meta.json')
    const emitted = write('libertad.json')
    expect(emittedSongIn(dir).path).toBe(emitted)
  })

  it('is never one of `align`’s outputs', () => {
    // A staging directory reused from an older `align` holds all three. Promoting the first would
    // merge the timeline as the machine left it, which is the silent loss this round removes:
    // page 2's refinements live only in the file the emit wrote.
    write('libertad-song.json')
    write('libertad-timeline.json')
    write('libertad-report.json')
    expect(emittedSongIn(dir).path).toBeNull()
  })

  it('ignores a file left there by an earlier flow', () => {
    // Editing a song reuses that song's directory, so the previous edit's answer is sitting there
    // before this flow starts. A flow that reported itself finished the instant it opened would
    // promote a stale timeline over the one being made.
    write('libertad.json', 600)
    expect(emittedSongIn(dir, Date.now() - 60_000).path).toBeNull()
  })

  it('takes the one this flow wrote when both are there', () => {
    write('duelo.json', 600)
    const fresh = write('libertad.json')
    expect(emittedSongIn(dir, Date.now() - 60_000).path).toBe(fresh)
  })

  it('is nothing when the directory is not there yet, rather than a throw', () => {
    expect(emittedSongIn(join(dir, 'never-made')).path).toBeNull()
  })
})
