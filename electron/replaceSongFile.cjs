const fs = require('fs')
const path = require('path')

/**
 * **Replacing a song file with the candidate an edit produced.**
 *
 * **Why this is a replace and not a merge** (Jorge, 2026-09-02). Page 1 became the edit surface in
 * Bombista `v1.4.0` — it collects the title, the artist, the notes and the tempo — while `promote`
 * writes only the timeline envelope. So editing a title and saving over an existing song changed
 * nothing, silently. `promote` is not widened past the timeline; the edit replaces the file.
 *
 * **That is safe because the candidate is the original file plus the person's changes.** Page 1
 * prefills from the song, and Bombista passes a file's own keys through untouched and in order —
 * verified before this was built, against a song carrying keys Bombista has never heard of.
 *
 * **The two properties `back_up_and_replace` has, and they are file safety rather than song
 * knowledge:** a timestamped copy beside the original before anything is written, and an atomic
 * write through a scratch file, so an interrupted save cannot leave half a song on disk. The
 * backup's name follows Bombista's, `<name>.backup-<stamp>`, because a catalogue with two
 * conventions for the same thing is worse than a shared one.
 *
 * **What it does not do is decide.** Whether this candidate may replace this target — a timed song
 * must not be replaced by one carrying no timeline — is asked before the call, where the person is
 * still on the page that produced the file.
 */
function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  )
}

function replaceSongFile(candidatePath, targetPath, options = {}) {
  const io = {
    copyFileSync: fs.copyFileSync,
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
    now: () => new Date(),
    ...options,
  }
  const at = stamp(io.now())
  let scratch = null
  try {
    const payload = io.readFileSync(String(candidatePath), 'utf8')
    const target = String(targetPath)
    let backup = null
    if (io.existsSync(target)) {
      backup = `${target}.backup-${at}`
      io.copyFileSync(target, backup)
    } else {
      io.mkdirSync(path.dirname(target), { recursive: true })
    }
    scratch = `${target}.tmp-${at}`
    io.writeFileSync(scratch, payload, 'utf8')
    io.renameSync(scratch, target)
    scratch = null
    return { ok: true, backup }
  } catch (err) {
    if (scratch !== null) {
      try {
        io.unlinkSync(scratch)
      } catch {
        /* nothing to clean up */
      }
    }
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

module.exports = { replaceSongFile }
