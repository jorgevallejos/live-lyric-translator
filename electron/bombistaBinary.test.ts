/**
 * Finding `bombista` on this machine.
 *
 * The filesystem and the environment are both injected, so nothing here depends on what is
 * actually installed — which matters, because the defect this module exists for is precisely a
 * machine where the binary IS installed and the app cannot see it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { resolveBombista, KNOWN_DIRS } = require('./bombistaBinary.cjs') as {
  resolveBombista: (
    configuredPath?: string | null,
    options?: {
      isExecutableFile?: (p: string) => boolean
      pathEnv?: string
      home?: string
    }
  ) => { command: string; source: string; searched: string[] }
  KNOWN_DIRS: (home: string) => string[]
}

/** The PATH an Electron app inherits when it is launched from Finder rather than a shell. */
const FINDER_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const SHELL_PATH = '/Users/j/.local/bin:/opt/homebrew/bin:/usr/bin:/bin'
const HOME = '/Users/j'

function only(...present: string[]) {
  const set = new Set(present)
  return (p: string) => set.has(p)
}

describe('resolveBombista', () => {
  it('finds it in a known install location when the inherited PATH cannot see it', () => {
    // The whole defect, in one assertion. `~/.local/bin` is where pipx and `pip install --user`
    // put it, and it is not on the PATH a Finder-launched app gets.
    const resolved = resolveBombista(null, {
      pathEnv: FINDER_PATH,
      home: HOME,
      isExecutableFile: only('/Users/j/.local/bin/bombista'),
    })
    expect(resolved.command).toBe('/Users/j/.local/bin/bombista')
    expect(resolved.source).toBe('known-location')
  })

  it('prefers what is on PATH, so a terminal launch keeps using the shell’s own choice', () => {
    // Both exist. PATH wins: someone running from a shell with a venv active has chosen that one,
    // and probing a known location first would silently substitute a different install.
    const resolved = resolveBombista(null, {
      pathEnv: SHELL_PATH,
      home: HOME,
      isExecutableFile: only('/opt/homebrew/bin/bombista', '/Users/j/.local/bin/bombista'),
    })
    expect(resolved.command).toBe('/Users/j/.local/bin/bombista')
    expect(resolved.source).toBe('path')
  })

  it('walks PATH in order', () => {
    const resolved = resolveBombista(null, {
      pathEnv: '/first:/second',
      home: HOME,
      isExecutableFile: only('/first/bombista', '/second/bombista'),
    })
    expect(resolved.command).toBe('/first/bombista')
  })

  it('takes a configured path verbatim, and does not check it', () => {
    // **Deliberate.** A path someone typed into preferences is used as typed, even when it is
    // wrong, so the failure names the setting they made. Falling back to a working binary would
    // leave a dead setting looking alive, which is the harder thing to debug.
    const resolved = resolveBombista('/somewhere/else/bombista', {
      pathEnv: SHELL_PATH,
      home: HOME,
      isExecutableFile: only('/Users/j/.local/bin/bombista'),
    })
    expect(resolved.command).toBe('/somewhere/else/bombista')
    expect(resolved.source).toBe('configured')
  })

  it('ignores an empty or whitespace configured path rather than running ""', () => {
    for (const configured of ['', '   ', null, undefined]) {
      const resolved = resolveBombista(configured, {
        pathEnv: SHELL_PATH,
        home: HOME,
        isExecutableFile: only('/Users/j/.local/bin/bombista'),
      })
      expect(resolved.command).toBe('/Users/j/.local/bin/bombista')
    }
  })

  it('falls back to the bare name when nothing is found, so a missing binary stays skipped', () => {
    // Never fails closed. `bombistaRun` turns an ENOENT on a bare name into `skipped`, which is
    // what keeps a machine with no Python able to run a gig. Resolving must not change that.
    const resolved = resolveBombista(null, {
      pathEnv: FINDER_PATH,
      home: HOME,
      isExecutableFile: () => false,
    })
    expect(resolved.command).toBe('bombista')
    expect(resolved.source).toBe('unresolved')
  })

  it('reports everywhere it looked, so preferences can say what was searched', () => {
    const resolved = resolveBombista(null, {
      pathEnv: FINDER_PATH,
      home: HOME,
      isExecutableFile: () => false,
    })
    expect(resolved.searched).toContain('/usr/bin/bombista')
    expect(resolved.searched).toContain('/Users/j/.local/bin/bombista')
    // No duplicates: a directory on both PATH and the known list is searched once.
    expect(new Set(resolved.searched).size).toBe(resolved.searched.length)
  })

  it('searches a known directory that is already on PATH only once', () => {
    const resolved = resolveBombista(null, {
      pathEnv: '/opt/homebrew/bin',
      home: HOME,
      isExecutableFile: () => false,
    })
    expect(resolved.searched.filter((p) => p === '/opt/homebrew/bin/bombista')).toHaveLength(1)
  })

  it('survives an unset PATH', () => {
    const resolved = resolveBombista(null, {
      pathEnv: '',
      home: HOME,
      isExecutableFile: only('/Users/j/.local/bin/bombista'),
    })
    expect(resolved.command).toBe('/Users/j/.local/bin/bombista')
  })

  it('names the three places a Python CLI is actually installed on a Mac', () => {
    // Asserted so that adding a fourth is a deliberate act with a test to change.
    expect(KNOWN_DIRS(HOME)).toEqual([
      '/Users/j/.local/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ])
  })
})
