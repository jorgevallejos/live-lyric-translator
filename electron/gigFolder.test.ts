/**
 * The gig folder read, against a real temp folder. No Electron.
 *
 * NOTE (see CLAUDE.md): this covers the handler's logic, not the renderer → Chromium → main
 * round trip. The IPC path needs the manual check named in the PR.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { readGigFolder, writeGigFile, writeDebriefFile, resolveInsideFolder } = require('./gigFolder.cjs') as {
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
    options?: { writeFileSync?: unknown }
  ) => { ok: boolean; error?: string }
  writeDebriefFile: (
    folderPath: string,
    text: string,
    options?: { writeFileSync?: unknown }
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

  it('refuses a pointer that leaves the gig folder', () => {
    const r = readGigFolder(dir, { visualsPointer: '../elsewhere/visuals.json' })
    expect(r.visualsPresent).toBe(false)
    expect(r.visualsError).toMatch(/leaves the gig folder/)
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

  it('reports a write failure as a value', () => {
    const r = writeGigFile(dir, 'x', {
      writeFileSync: () => {
        throw new Error('EROFS: read-only file system')
      },
    })
    expect(r).toEqual({ ok: false, error: 'EROFS: read-only file system' })
  })
})

describe('writeDebriefFile', () => {
  it('writes debrief.md into the gig folder', () => {
    expect(writeDebriefFile(dir, '# Debrief\n')).toEqual({ ok: true })
    expect(readFileSync(join(dir, 'debrief.md'), 'utf8')).toBe('# Debrief\n')
  })

  it('overwrites whole rather than merging', () => {
    // Pregonero writes it and then Jorge edits it. A tool that reconciled his edits with its own
    // idea of the night would be the worst of both, so the file is written whole on save.
    writeDebriefFile(dir, 'first\n')
    writeDebriefFile(dir, 'second\n')
    expect(readFileSync(join(dir, 'debrief.md'), 'utf8')).toBe('second\n')
  })

  it('reports a write failure as a value', () => {
    const r = writeDebriefFile(dir, 'x', {
      writeFileSync: () => {
        throw new Error('EROFS: read-only file system')
      },
    })
    expect(r).toEqual({ ok: false, error: 'EROFS: read-only file system' })
  })
})
