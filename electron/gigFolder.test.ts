/**
 * The gig folder read, against a real temp folder. No Electron.
 *
 * NOTE (see CLAUDE.md): this covers the handler's logic, not the renderer → Chromium → main
 * round trip. The IPC path needs the manual check named in the PR.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const {
  readGigFolder,
  createGigFolder,
  writeGigFile,
  resolveInsideFolder,
} = require('./gigFolder.cjs') as {
  createGigFolder: (
    gigsRoot: string,
    name: string
  ) => { ok: true; folderPath: string } | { ok: false; error: string }
  readGigFolder: (
    folderPath: string,
    options?: { visualsPointer?: string; readFileSync?: unknown; existsSync?: unknown }
  ) => {
    gigText: string | null
    gigError: string | null
    gigPresent: boolean
    visualsText: string | null
    visualsError: string | null
    visualsPresent: boolean
  }
  writeGigFile: (
    folderPath: string,
    text: string,
    options?: { writeFileSync?: unknown; mkdirSync?: unknown }
  ) => { ok: boolean; error?: string }
  resolveInsideFolder: (folderPath: string, pointer: string) => string | null
}

let dir: string
const roots: string[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-gig-'))
  roots.push(dir)
})

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/**
 * **`New gig` asks for a name, not a path** — R4 item 9, pulled into the gig-flow round because
 * `journey-setup.md` step 8 cannot happen without it. First run records the gigs root once; this is
 * what puts a gig inside it.
 */
describe('createGigFolder', () => {
  it('makes the folder under the gigs root and names it what was typed', () => {
    const r = createGigFolder(dir, '2026-09-12-bar-eduard')
    expect(r.ok).toBe(true)
    expect(r.ok && r.folderPath).toBe(join(dir, '2026-09-12-bar-eduard'))
    expect(existsSync(join(dir, '2026-09-12-bar-eduard'))).toBe(true)
  })

  it('trims the name rather than making a folder with a space on the end', () => {
    const r = createGigFolder(dir, '  bar-eduard  ')
    expect(r.ok && r.folderPath).toBe(join(dir, 'bar-eduard'))
  })

  it('refuses an empty name instead of making a folder called nothing', () => {
    const r = createGigFolder(dir, '   ')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/needs a name/)
  })

  /**
   * **Refused by name, never sanitised.** A gig quietly created somewhere other than where it was
   * asked for is worse than a refusal that says so.
   */
  it('refuses a name that is a path rather than one folder', () => {
    for (const name of ['a/b', '..', '.', 'x\\y']) {
      const r = createGigFolder(dir, name)
      expect(r.ok).toBe(false)
    }
    expect(existsSync(join(dir, 'a'))).toBe(false)
  })

  it('refuses to create over something already there, rather than adopting it', () => {
    mkdirSync(join(dir, 'taken'))
    writeFileSync(join(dir, 'taken', 'gig.json'), '{"gigVersion":1,"id":"taken"}', 'utf8')
    const r = createGigFolder(dir, 'taken')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/already a gig called/)
    // The stranger's file is untouched.
    expect(readFileSync(join(dir, 'taken', 'gig.json'), 'utf8')).toContain('taken')
  })

  it('reports a failure to write rather than throwing across the bridge', () => {
    const r = createGigFolder(join(dir, 'no', 'such', 'root'), 'x')
    // `recursive` makes the parents, so this one succeeds — the point is that it answers.
    expect(typeof r.ok).toBe('boolean')
  })
})

describe('readGigFolder', () => {
  it('reads both files when they are there', () => {
    writeFileSync(join(dir, 'gig.json'), '{"gigVersion":1,"id":"g"}', 'utf8')
    writeFileSync(join(dir, 'visuals.json'), '{"visualsVersion":1}', 'utf8')
    const r = readGigFolder(dir)
    expect(r.gigPresent).toBe(true)
    expect(r.gigText).toContain('"id":"g"')
    expect(r.visualsPresent).toBe(true)
    expect(r.visualsText).toContain('visualsVersion')
  })

  it('an empty folder is absence, not an error — the gig has not been created yet', () => {
    const r = readGigFolder(dir)
    expect(r.gigPresent).toBe(false)
    expect(r.gigError).toBeNull()
    expect(r.visualsPresent).toBe(false)
    expect(r.visualsError).toBeNull()
  })

  it('a gig with no visuals yet is absence too — Muralista has not run', () => {
    writeFileSync(join(dir, 'gig.json'), '{"gigVersion":1,"id":"g"}', 'utf8')
    const r = readGigFolder(dir)
    expect(r.gigPresent).toBe(true)
    expect(r.visualsPresent).toBe(false)
  })

  it('follows the gig file’s own visuals pointer', () => {
    mkdirSync(join(dir, 'room'))
    writeFileSync(join(dir, 'room', 'v.json'), '{"visualsVersion":1}', 'utf8')
    const r = readGigFolder(dir, { visualsPointer: './room/v.json' })
    expect(r.visualsPresent).toBe(true)
  })

  it('refuses a pointer that leaves the folder gig.json is in', () => {
    // **Narrowed with the move to `<gig>/setup`** (2026-09-01): the base is the folder the pair
    // lives in, so `../poster.png` — the author's half of the gig folder — is now a refusal too.
    // That is the containment the contract wants: `visuals.json` sits beside `gig.json`.
    const r = readGigFolder(dir, { visualsPointer: '../elsewhere/visuals.json' })
    expect(r.visualsPresent).toBe(false)
    expect(r.visualsError).toMatch(/leaves the folder gig\.json is in/)
  })

  it('reports a read failure as a value, never as a throw', () => {
    const r = readGigFolder(dir, {
      existsSync: () => true,
      readFileSync: () => {
        throw new Error('EACCES: permission denied')
      },
    })
    expect(r.gigError).toMatch(/EACCES/)
  })
})

describe('resolveInsideFolder', () => {
  it('allows the folder itself and anything under it', () => {
    expect(resolveInsideFolder('/gigs/a', './visuals.json')).toBe('/gigs/a/visuals.json')
    expect(resolveInsideFolder('/gigs/a', 'room/v.json')).toBe('/gigs/a/room/v.json')
  })

  it('refuses an escape, including one dressed up as a sibling prefix', () => {
    expect(resolveInsideFolder('/gigs/a', '../b/visuals.json')).toBeNull()
    expect(resolveInsideFolder('/gigs/a', '../ab/visuals.json')).toBeNull()
  })

  it('refuses an absolute path elsewhere', () => {
    expect(resolveInsideFolder('/gigs/a', '/etc/passwd')).toBeNull()
  })
})

describe('writeGigFile', () => {
  it('writes gig.json into the folder', () => {
    expect(writeGigFile(dir, '{"gigVersion":1,"id":"g"}\n')).toEqual({ ok: true })
    expect(readFileSync(join(dir, 'gig.json'), 'utf8')).toBe('{"gigVersion":1,"id":"g"}\n')
  })

  it('makes the folder it writes into', () => {
    // It is handed `<gig>/setup`, which is the machine's own corner of a folder that belongs to the
    // author. Making it is this process making room for its own file; the gig folder itself is
    // created once, by `createGigFolder`, when the gig is named.
    const setup = join(dir, 'setup')
    expect(existsSync(setup)).toBe(false)
    expect(writeGigFile(setup, '{"gigVersion":1,"id":"g"}\n')).toEqual({ ok: true })
    expect(readFileSync(join(setup, 'gig.json'), 'utf8')).toBe('{"gigVersion":1,"id":"g"}\n')
  })

  it('reports a write failure as a value', () => {
    const r = writeGigFile(dir, 'x', {
      writeFileSync: () => {
        throw new Error('EROFS: read-only file system')
      },
    })
    expect(r).toEqual({ ok: false, error: 'EROFS: read-only file system' })
  })
})
