const fs = require('fs')
const path = require('path')

/**
 * **What song files are in the folder it is handed.**
 *
 * That folder is `<songs>/song-performance` — the renderer joins it, the way it already joins every
 * other path this process is handed, so the main process stays ignorant of the suite's conventions
 * and there is one definition of where song files live (`src/fileLayout.ts`).
 *
 * Until this existed the app had no way to look: `ensureSongLibraryHydrated` reads the
 * **references** in the snapshot and nothing else, and references only ever arrived one at a time
 * through a file picker. So a machine whose songs folder held the whole catalogue reported **"No
 * songs yet"** — the app had been pointed at the songs and said there were none. Found on
 * 2026-08-31, walking R1.
 *
 * **`song-performance/` is the source of truth and the library is a cache of it.** That was already
 * the written rule; it was half-built, because the library predates there being a songs root to
 * read. There is one now.
 *
 * Three exclusions, and each is a decision rather than a filter:
 *
 * - **Dotfiles**, which are the filesystem's, not the catalogue's.
 * - **Names beginning with `_`**, which is this catalogue's own convention for a file that is not
 *   a song — `_template.json` is the live case. Listing it would put a permanent broken row
 *   on Setup home that no one can fix, because it is not meant to parse.
 * - **Anything that is not `.json`.** Bombista's `back_up_and_replace` writes
 *   `<song>.json.backup-<stamp>` siblings, which do not end in `.json` and so fall out for free.
 *
 * **It does not recurse.** The song files are flat by convention, and a nested tree would make the
 * id — the basename — ambiguous.
 *
 * **A folder that is not there and a folder that will not read are different answers.** Nothing
 * creates `song-performance/`; Bombista makes it the first time it writes a song into it. So an
 * absent folder is an empty catalogue — `present: false`, and no problem to report — while a
 * folder that is there and refuses to be read is a failure with a name, which the songs list says
 * out loud rather than rendering as "no songs yet".
 */

function listSongFiles(folderPath, options = {}) {
  const readdirSync = options.readdirSync || fs.readdirSync
  const existsSync = options.existsSync || fs.existsSync
  try {
    if (!existsSync(folderPath)) return { ok: true, present: false, files: [] }
    const names = readdirSync(folderPath)
    const files = names
      .filter((name) => typeof name === 'string')
      .filter((name) => !name.startsWith('.') && !name.startsWith('_'))
      .filter((name) => path.extname(name).toLowerCase() === '.json')
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, present: true, files }
  } catch (err) {
    // **Never a throw on the way to a screen.** A catalogue that has been moved or unplugged is an
    // empty list with a reason, not a blank app.
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

module.exports = { listSongFiles }
