const fs = require('fs')
const os = require('os')
const path = require('path')

/**
 * **Finding `bombista` on this machine, because `PATH` is not enough.**
 *
 * The three bridges — `bombistaRun`, `bombistaValidate`, `bombistaServe` — all called
 * `execFile('bombista', …)`, which resolves against the `PATH` the Electron process inherited.
 * **An app launched from Finder inherits `/usr/bin:/bin:/usr/sbin:/sbin`**, and a Python CLI
 * installed with `pipx` or `pip install --user` lives in `~/.local/bin`, which is on that list
 * nowhere. Launched from a terminal the same app inherits the shell's `PATH` and works.
 *
 * So the tool was reachable in development and unreachable in the only launch mode a performer
 * uses — reported as `skipped`, the branch built so that a machine with no Python can still run a
 * gig. **The hosted song flow was dark and said so in the words of a machine that does not have
 * Bombista installed.** Found on 2026-08-31 while planning the setup redesign; it is the reason
 * every other door in that round would have opened onto nothing.
 *
 * **The order is deliberate.** `PATH` first, because someone running from a shell — with a venv
 * active, or a checkout on their `PATH` — has already chosen which install they mean, and probing
 * a known location ahead of it would silently substitute another one. The known locations are the
 * fallback for the case where there is no shell to have chosen anything.
 *
 * **It never fails closed.** Nothing found returns the bare name, so the ENOENT and the `skipped`
 * status downstream are exactly what they were before this module existed.
 */

const BINARY = 'bombista'

/**
 * Where a Python CLI actually lands on a Mac, in the order they are tried.
 *
 * `~/.local/bin` is pipx and `pip install --user`; the two Homebrew prefixes are arm64 and Intel.
 * A fourth entry is a deliberate act with a test to change, not a guess to add.
 */
function KNOWN_DIRS(home) {
  return [path.join(home, '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
}

function defaultIsExecutableFile(candidate) {
  try {
    if (!fs.statSync(candidate).isFile()) return false
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Where `bombista` is, and how that was decided.
 *
 * `configuredPath` is what preferences holds, and it is **taken verbatim and never checked**. A
 * path someone typed is used as typed even when it is wrong, so the failure names the setting they
 * made; quietly falling back to a working binary would leave a dead setting looking alive, which
 * is the harder thing to debug.
 *
 * Returns `{ command, source, searched }`. `source` is one of `configured`, `path`,
 * `known-location` or `unresolved`, and `searched` is every candidate that was looked at, so a
 * preferences screen can say where it looked rather than only that it failed.
 */
function resolveBombista(configuredPath, options = {}) {
  const configured = typeof configuredPath === 'string' ? configuredPath.trim() : ''
  if (configured !== '') {
    return { command: configured, source: 'configured', searched: [] }
  }

  const isExecutableFile = options.isExecutableFile || defaultIsExecutableFile
  const home = options.home ?? os.homedir()
  const pathEnv = options.pathEnv ?? process.env.PATH ?? ''

  const pathDirs = pathEnv.split(path.delimiter).filter((dir) => dir.length > 0)
  const searched = []
  const seen = new Set()

  const look = (dirs, source) => {
    for (const dir of dirs) {
      const candidate = path.join(dir, BINARY)
      if (seen.has(candidate)) continue
      seen.add(candidate)
      searched.push(candidate)
      if (isExecutableFile(candidate)) return { command: candidate, source, searched }
    }
    return null
  }

  // Both lists are walked to the end before the next begins, so a hit on PATH always wins over a
  // known location — and the searched list is complete either way.
  const onPath = look(pathDirs, 'path')
  if (onPath) return onPath
  const known = look(KNOWN_DIRS(home), 'known-location')
  if (known) return known

  return { command: BINARY, source: 'unresolved', searched }
}

module.exports = { resolveBombista, KNOWN_DIRS, BINARY }
