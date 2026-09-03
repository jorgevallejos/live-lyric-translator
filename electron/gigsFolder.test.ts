/**
 * The gigs folder listing, against a real temp folder. No Electron.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { listGigFolders } = require('./gigsFolder.cjs') as {
  listGigFolders: (
    folderPath: string,
    options?: { readdirSync?: unknown; existsSync?: unknown }
  ) =>
    | { ok: true; present: boolean; folders: string[] }
    | { ok: false; error: string }
}

let dir: string
const made: string[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-gigs-'))
  made.push(dir)
})

afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

describe('listGigFolders', () => {
  it('lists the directories, sorted', () => {
    mkdirSync(join(dir, 'k3f9x2abcd'))
    mkdirSync(join(dir, 'aaaaaaaaaa'))
    const r = listGigFolders(dir)
    expect(r).toEqual({ ok: true, present: true, folders: ['aaaaaaaaaa', 'k3f9x2abcd'] })
  })

  it('leaves out files, because a gig is a directory', () => {
    mkdirSync(join(dir, 'k3f9x2abcd'))
    writeFileSync(join(dir, 'notes.txt'), 'x', 'utf8')
    const r = listGigFolders(dir)
    expect(r).toEqual({ ok: true, present: true, folders: ['k3f9x2abcd'] })
  })

  it('leaves out dotfolders, which are the filesystem’s', () => {
    mkdirSync(join(dir, '.Trashes'))
    mkdirSync(join(dir, 'k3f9x2abcd'))
    const r = listGigFolders(dir)
    expect(r).toEqual({ ok: true, present: true, folders: ['k3f9x2abcd'] })
  })

  it('lists a folder with no gig.json in it, because deciding that is not its job', () => {
    // The renderer reads `gig.json` and decides; this reports what is on disk. Splitting it the
    // other way would put a suite convention in the main process, which is the rule this follows.
    mkdirSync(join(dir, 'empty-one'))
    expect(listGigFolders(dir)).toEqual({ ok: true, present: true, folders: ['empty-one'] })
  })

  it('says a folder that is not there is absent, not a problem', () => {
    // Nothing creates `<gigs>/setup/`; Pregonero makes it with the first gig. A machine that has
    // never made one has no gigs, which is not a failure to report.
    const r = listGigFolders(join(dir, 'setup'))
    expect(r).toEqual({ ok: true, present: false, folders: [] })
  })

  it('reports a read failure as a value rather than throwing', () => {
    const r = listGigFolders(dir, {
      existsSync: () => true,
      readdirSync: () => {
        throw new Error('EACCES: permission denied')
      },
    })
    expect(r).toEqual({ ok: false, error: 'EACCES: permission denied' })
  })
})
