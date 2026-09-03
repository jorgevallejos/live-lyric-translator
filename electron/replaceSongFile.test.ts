/**
 * **Replacing a song file with the candidate an edit produced.**
 *
 * The two properties that make an overwrite safe, and they are file safety rather than song
 * knowledge: a timestamped copy beside the original before anything is written, and an atomic
 * write, so an interrupted save cannot leave half a song on disk. Bombista's
 * `back_up_and_replace` has both; this is the same shape for a file Bombista already wrote.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const { replaceSongFile } = require('./replaceSongFile.cjs') as {
  replaceSongFile: (
    candidate: string,
    target: string,
    options?: Record<string, unknown>
  ) => { ok: true; backup: string | null } | { ok: false; error: string }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-replace-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('replacing a song file', () => {
  it('writes the candidate over the target, byte for byte', () => {
    const candidate = join(dir, 'candidate.json')
    const target = join(dir, 'libertad.json')
    writeFileSync(candidate, '{"title":"Libertad editado","capo":2}')
    writeFileSync(target, '{"title":"Libertad"}')

    const result = replaceSongFile(candidate, target)

    expect(result.ok).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('{"title":"Libertad editado","capo":2}')
  })

  it('leaves a timestamped copy of what was there', () => {
    // The one thing an overwrite owes the person whose file it is.
    const candidate = join(dir, 'candidate.json')
    const target = join(dir, 'libertad.json')
    writeFileSync(candidate, '{"new":true}')
    writeFileSync(target, '{"old":true}')

    const result = replaceSongFile(candidate, target)

    expect(result.ok && result.backup).toMatch(/libertad\.json\.backup-\d{8}-\d{6}$/)
    expect(readFileSync((result as { backup: string }).backup, 'utf8')).toBe('{"old":true}')
  })

  it('says there was no backup when there was nothing to back up', () => {
    // Naming a path for a file that never existed would be a lie in the caller's output.
    const candidate = join(dir, 'candidate.json')
    writeFileSync(candidate, '{"new":true}')
    const result = replaceSongFile(candidate, join(dir, 'made', 'libertad.json'))
    expect(result).toEqual({ ok: true, backup: null })
    expect(existsSync(join(dir, 'made', 'libertad.json'))).toBe(true)
  })

  it('leaves the target untouched when the write fails, and no scratch behind', () => {
    // An interrupted write must not be able to leave half a song on disk.
    const candidate = join(dir, 'candidate.json')
    const target = join(dir, 'libertad.json')
    writeFileSync(candidate, '{"new":true}')
    writeFileSync(target, '{"old":true}')

    const result = replaceSongFile(candidate, target, {
      renameSync: () => {
        throw new Error('disk full')
      },
    })

    expect(result).toEqual({ ok: false, error: 'disk full' })
    expect(readFileSync(target, 'utf8')).toBe('{"old":true}')
    expect(readdirSync(dir).filter((n) => n.includes('.tmp-'))).toEqual([])
  })

  it('is a value and never a throw when the candidate is not there', () => {
    const result = replaceSongFile(join(dir, 'gone.json'), join(dir, 'libertad.json'))
    expect(result.ok).toBe(false)
    expect(existsSync(join(dir, 'libertad.json'))).toBe(false)
  })
})
