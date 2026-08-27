const { execFile } = require('child_process')

/**
 * **Running Bombista.** A subprocess invocation from the main process, and that is all it is — not
 * a protocol, not a session, not a channel between two running tools.
 *
 * **Bombista never learns Pregonero exists, and never learns a gig exists.** It is handed a song
 * file path and an exit code comes back. Hosting its review page inside a window changes packaging,
 * not knowledge: if anything here ever wants to hand it gig context, that is the boundary breaking
 * and the answer is to stop.
 *
 * **Nothing here manages candidate files, temp files or swaps.** `bombista promote` already merges
 * a candidate home, and `bombista/songfile.py`'s `back_up_and_replace` is *THE one song-write path*
 * — a timestamped backup beside the file, then an atomic replace. A second file-replacement step in
 * this repo would drift from it. Pregonero names one working directory for `align` to write into
 * and hands `promote` the timeline that came out; it never reaches into that directory itself.
 *
 * **It never fails closed.** `bombista` is a Python CLI a person installs, and a machine without it
 * must still be able to run a gig.
 */

const NOT_INSTALLED_CODES = new Set(['ENOENT', 'EACCES', 'ENOTDIR'])

/** The subcommands Pregonero is allowed to run. A name outside this list is refused, not passed on. */
const ALLOWED = new Set(['new', 'align', 'promote', 'validate', 'migrate'])

/**
 * Runs one Bombista subcommand.
 *
 * Resolves to `{ status }` — `ok`, `failed` or `skipped` — plus whatever the process printed.
 * A missing binary is `skipped`, never `failed`: that distinction is what keeps a machine with no
 * Python from losing the ability to perform.
 */
function runBombista(subcommand, args = [], options = {}) {
  const run = options.execFile || execFile
  const command = options.command || 'bombista'
  // `align` transcribes: roughly 50 s for a three-minute song, and longer for a first run that has
  // to fetch the model. Everything else answers immediately.
  const timeout = options.timeout ?? (subcommand === 'align' ? 30 * 60_000 : 60_000)

  if (!ALLOWED.has(subcommand)) {
    return Promise.resolve({
      status: 'failed',
      output: `${subcommand} is not a Bombista subcommand Pregonero runs.`,
      code: null,
    })
  }

  const argv = [subcommand, ...args.map((a) => String(a))]

  return new Promise((resolve) => {
    run(command, argv, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`
      if (error && NOT_INSTALLED_CODES.has(error.code)) {
        resolve({ status: 'skipped', output: `${command} is not on PATH`, code: null })
        return
      }
      if (error && error.killed) {
        resolve({ status: 'skipped', output: `${command} ${subcommand} did not answer in time`, code: null })
        return
      }
      if (error) {
        resolve({ status: 'failed', output: output || `${command} exited ${error.code}`, code: error.code ?? null })
        return
      }
      resolve({ status: 'ok', output, code: 0 })
    })
  })
}

/** Whether `bombista` answers at all on this machine, and what it says it is. */
function bombistaVersion(options = {}) {
  const run = options.execFile || execFile
  const command = options.command || 'bombista'
  return new Promise((resolve) => {
    run(command, ['--version'], { timeout: options.timeout || 10_000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ present: false, version: null })
        return
      }
      resolve({ present: true, version: `${stdout || stderr || ''}`.trim() || null })
    })
  })
}

module.exports = { runBombista, bombistaVersion, ALLOWED }
