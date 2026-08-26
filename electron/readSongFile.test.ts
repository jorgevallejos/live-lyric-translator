/**
 * Unit tests for readSongFile — the main-process side of "the library holds a path, not a copy".
 * Exercises the real filesystem through a temp file, no Electron.
 *
 * NOTE (see CLAUDE.md): this covers the handler's logic, **not** the renderer → Chromium → main
 * round trip. Any change here still needs the manual IPC check named in the PR.
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { readSongFile } = require('./readSongFile.cjs') as {
  readSongFile: (
    filePath: string,
    readFileSync?: (p: string, enc: string) => string
  ) => { ok: true; text: string } | { ok: false; error: string }
}

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-songs-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readSongFile', () => {
  it('returns the file text', () => {
    const p = join(dir, 'pimiento.json')
    writeFileSync(p, '{"title":"Pimiento"}', 'utf8')
    expect(readSongFile(p)).toEqual({ ok: true, text: '{"title":"Pimiento"}' })
  })

  it('reads UTF-8, so accented lyrics survive the trip', () => {
    const p = join(dir, 'acentos.json')
    writeFileSync(p, '{"title":"Tragedia de cerdo asado — ñ á"}', 'utf8')
    const r = readSongFile(p)
    expect(r.ok && r.text).toContain('ñ á')
  })

  it('reports a missing file as a value, not a throw', () => {
    const r = readSongFile(join(dir, 'gone.json'))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/ENOENT/)
  })

  it('reports an unreadable file as a value too', () => {
    const p = join(dir, 'locked.json')
    writeFileSync(p, '{}', 'utf8')
    chmodSync(p, 0o000)
    const r = readSongFile(p)
    chmodSync(p, 0o600)
    // Running as root would defeat the permission bit; skip the assertion in that case.
    if (typeof process.getuid === 'function' && process.getuid() === 0) return
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error.length > 0).toBe(true)
  })

  it('never lets a non-Error throw escape as undefined', () => {
    const r = readSongFile('whatever.json', () => {
      throw 'a bare string'
    })
    expect(r).toEqual({ ok: false, error: 'a bare string' })
  })
})
