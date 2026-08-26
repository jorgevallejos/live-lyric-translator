const { execFile } = require('child_process')

/**
 * `bombista validate --for-performance` — a CLI invocation from the main process, which is
 * sanctioned, and not a live protocol between two running tools.
 *
 * **Pregonero checks completeness; the owners check correctness.** Whether a timeline is sane is
 * Bombista's question, and implementing it here would create a second understanding of SP JSON
 * that goes stale the moment the first one changes. So this shells out and reports what came back.
 *
 * **It must not fail closed.** `bombista` is a Python CLI a person installs; a machine without it
 * on `PATH` — this repo's own dev machine included — must still be able to run a gig. A missing
 * binary is `skipped`, never `failed`. Bombista never learns Pregonero exists: it is handed a file
 * path and its exit code is read.
 */
const NOT_INSTALLED_CODES = new Set(['ENOENT', 'EACCES', 'ENOTDIR'])

function validateSongForPerformance(songPath, options = {}) {
  const run = options.execFile || execFile
  const command = options.command || 'bombista'
  const timeout = options.timeout || 15_000

  return new Promise((resolve) => {
    run(
      command,
      ['validate', String(songPath), '--for-performance'],
      { timeout },
      (error, stdout, stderr) => {
        if (error && NOT_INSTALLED_CODES.has(error.code)) {
          resolve({ status: 'skipped', reason: `${command} is not on PATH` })
          return
        }
        if (error && error.killed) {
          resolve({ status: 'skipped', reason: `${command} did not answer in time` })
          return
        }
        const output = `${stdout || ''}${stderr || ''}`
        if (!error) {
          resolve({ status: 'ok' })
          return
        }
        const messages = output
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
        resolve({
          status: 'failed',
          messages: messages.length > 0 ? messages : [`${command} exited ${error.code}`],
        })
      }
    )
  })
}

module.exports = { validateSongForPerformance }
