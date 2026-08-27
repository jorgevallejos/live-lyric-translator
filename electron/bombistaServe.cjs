const { spawn } = require('child_process')

/**
 * **`bombista serve` — Bombista's own review interface, in a window.**
 *
 * The kickoff for this stage said to host Bombista's review page over the same localhost as
 * Muralista. **Bombista already serves it itself**, on `127.0.0.1`, and doing it that way is
 * strictly better for a reason that is not stylistic: the *static* `--emit html` page references
 * the audio with a path relative to the staging directory (`../../songs/audio/x.m4a`), so serving
 * that page from a mount rooted at the staging directory gives a review page **with no audio** —
 * and hearing the two doubtful lines is the entire point of it. Bombista's own server has
 * `/api/audio` precisely so the page needs no relative src.
 *
 * So this starts a subprocess and reads the URL it prints. **That is all it is.** No protocol, no
 * shared state, no channel: Bombista is handed a song file path and a staging directory, Pregonero
 * opens a window on the address it announces, and **the file is still the only thing that passes
 * between them.** Bombista does not know Pregonero exists, and does not know gigs exist.
 *
 * It also keeps promotion where it belongs: the emit page writes the song through Bombista's one
 * merge path, the same one `bombista promote` uses.
 */

/** `bombista serve — http://127.0.0.1:51234/ (ctrl-c to stop)` */
const URL_PATTERN = /(http:\/\/127\.0\.0\.1:\d+\/?)/

function findUrl(text) {
  const match = URL_PATTERN.exec(text)
  return match ? match[1] : null
}

/**
 * Starts `bombista serve` and resolves once it prints its address.
 *
 * Rejects nothing: a missing binary or a process that dies without announcing an address comes
 * back as `{ ok: false, error }`, because a machine without Python must still be able to run a gig.
 */
function startBombistaServe(args, options = {}) {
  const spawnFn = options.spawn || spawn
  const command = options.command || 'bombista'
  const timeout = options.timeout ?? 20_000

  return new Promise((resolve) => {
    let child
    try {
      child = spawnFn(command, ['serve', ...args.map((a) => String(a)), '--port', '0'])
    } catch (err) {
      resolve({ ok: false, error: (err && err.message) || String(err) })
      return
    }

    let settled = false
    let output = ''
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const onChunk = (chunk) => {
      output += String(chunk)
      const url = findUrl(output)
      if (url) finish({ ok: true, url, child })
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('error', (err) => {
      finish({ ok: false, error: (err && err.message) || `${command} is not on PATH` })
    })
    child.on('exit', (code) => {
      finish({
        ok: false,
        error: output.trim() || `${command} serve exited ${code} without an address`,
      })
    })

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      finish({ ok: false, error: `${command} serve did not announce an address in time` })
    }, timeout)
  })
}

module.exports = { startBombistaServe, findUrl }
