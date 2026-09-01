/**
 * Listing the song files. The directory read is injected, so no catalogue is involved.
 *
 * The folder handed over is `<songs>/song-performance` — the renderer joins it (`src/fileLayout.ts`)
 * and this side stays ignorant of the suite's conventions, exactly as it is already handed the songs
 * root rather than reading it.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { listSongFiles } = require('./songsFolder.cjs') as {
  listSongFiles: (
    folderPath: string,
    options?: { readdirSync?: (p: string) => string[]; existsSync?: (p: string) => boolean }
  ) =>
    | { ok: true; present: boolean; files: string[] }
    | { ok: false; error: string }
}

function dir(...names: string[]) {
  return { readdirSync: () => names, existsSync: () => true }
}

const SONG_FILES = '/songs/song-performance'

describe('listing the song files', () => {
  it('returns the song files, sorted', () => {
    const r = listSongFiles(SONG_FILES, dir('vidas.json', 'duelo.json', 'pimiento.json'))
    expect(r).toEqual({
      ok: true,
      present: true,
      files: ['duelo.json', 'pimiento.json', 'vidas.json'],
    })
  })

  it('skips the catalogue’s own non-song files', () => {
    // `_template.json` is the live case: it is not meant to parse, so listing it would put a
    // permanent broken row on Setup home that nobody can fix.
    const r = listSongFiles(SONG_FILES, dir('_template.json', 'duelo.json'))
    expect(r).toEqual({ ok: true, present: true, files: ['duelo.json'] })
  })

  it('skips dotfiles, which belong to the filesystem and not the catalogue', () => {
    const r = listSongFiles(SONG_FILES, dir('.DS_Store', '.hidden.json', 'duelo.json'))
    expect(r).toEqual({ ok: true, present: true, files: ['duelo.json'] })
  })

  it('skips Bombista’s backups without needing to know about them', () => {
    // `back_up_and_replace` writes `<song>.json.backup-<stamp>`, which does not end in `.json`.
    const r = listSongFiles(
      SONG_FILES,
      dir('duelo.json', 'duelo.json.backup-20260831-193000', 'duelo.json.tmp-20260831-193000')
    )
    expect(r).toEqual({ ok: true, present: true, files: ['duelo.json'] })
  })

  it('skips audio and anything else that is not JSON', () => {
    const r = listSongFiles(SONG_FILES, dir('duelo.json', 'audio', 'cover.png', 'notes.md'))
    expect(r).toEqual({ ok: true, present: true, files: ['duelo.json'] })
  })

  it('reports a folder it cannot read rather than throwing on the way to a screen', () => {
    // A catalogue that has been moved or unplugged is an empty list with a reason, never a blank
    // app — and the songs list says the reason out loud.
    const r = listSongFiles(SONG_FILES, {
      existsSync: () => true,
      readdirSync: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('EACCES')
  })

  it('an empty folder is an empty list, not a failure', () => {
    expect(listSongFiles(SONG_FILES, dir())).toEqual({ ok: true, present: true, files: [] })
  })

  it('a folder that is not there yet is an empty catalogue, and not a problem', () => {
    // **Nothing creates `song-performance/`.** First run points at a catalogue that already exists
    // and creates nothing; Bombista makes this folder the first time it writes a song into it. So
    // the honest answer before that is "no songs", not a failure to report.
    const r = listSongFiles(SONG_FILES, {
      existsSync: () => false,
      readdirSync: () => {
        throw new Error('should not be read')
      },
    })
    expect(r).toEqual({ ok: true, present: false, files: [] })
  })
})
