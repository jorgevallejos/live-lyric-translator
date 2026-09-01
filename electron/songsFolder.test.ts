/**
 * Listing the songs folder. The directory read is injected, so no `songs/` is involved.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { listSongFiles } = require('./songsFolder.cjs') as {
  listSongFiles: (
    folderPath: string,
    options?: { readdirSync?: (p: string) => string[] }
  ) => { ok: true; files: string[] } | { ok: false; error: string }
}

function dir(...names: string[]) {
  return { readdirSync: () => names }
}

describe('listing the songs folder', () => {
  it('returns the song files, sorted', () => {
    const r = listSongFiles('/songs', dir('vidas.json', 'duelo.json', 'pimiento.json'))
    expect(r).toEqual({ ok: true, files: ['duelo.json', 'pimiento.json', 'vidas.json'] })
  })

  it('skips the catalogue’s own non-song files', () => {
    // `songs/_template.json` is the live case: it is not meant to parse, so listing it would put a
    // permanent broken row on Setup home that nobody can fix.
    const r = listSongFiles('/songs', dir('_template.json', 'duelo.json'))
    expect(r).toEqual({ ok: true, files: ['duelo.json'] })
  })

  it('skips dotfiles, which belong to the filesystem and not the catalogue', () => {
    const r = listSongFiles('/songs', dir('.DS_Store', '.hidden.json', 'duelo.json'))
    expect(r).toEqual({ ok: true, files: ['duelo.json'] })
  })

  it('skips Bombista’s backups without needing to know about them', () => {
    // `back_up_and_replace` writes `<song>.json.backup-<stamp>`, which does not end in `.json`.
    const r = listSongFiles(
      '/songs',
      dir('duelo.json', 'duelo.json.backup-20260831-193000', 'duelo.json.tmp-20260831-193000')
    )
    expect(r).toEqual({ ok: true, files: ['duelo.json'] })
  })

  it('skips audio and anything else that is not JSON', () => {
    const r = listSongFiles('/songs', dir('duelo.json', 'audio', 'cover.png', 'notes.md'))
    expect(r).toEqual({ ok: true, files: ['duelo.json'] })
  })

  it('reports a folder it cannot read rather than throwing on the way to a screen', () => {
    // A songs folder that has been moved or unplugged is an empty list with a reason, never a
    // blank app.
    const r = listSongFiles('/gone', {
      readdirSync: () => {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ENOENT')
  })

  it('an empty folder is an empty list, not a failure', () => {
    expect(listSongFiles('/songs', dir())).toEqual({ ok: true, files: [] })
  })
})
