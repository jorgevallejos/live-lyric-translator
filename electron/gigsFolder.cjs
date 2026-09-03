const fs = require('fs')

/**
 * **What gig folders are in the folder it is handed.**
 *
 * That folder is `<gigs>/setup` — the renderer joins it, the way it already joins every other path
 * this process is handed, so the main process stays ignorant of the suite's conventions and there
 * is one definition of where gigs live (`src/fileLayout.ts`).
 *
 * **The gigs list is the folder, like the songs list** (Jorge, 2026-09-03). Until this existed the
 * gigs were a bookmark list in browser storage while the data sat on disk, and the two could come
 * apart: cleared storage left every folder in place and an empty GIGS column, so the gigs looked
 * deleted and were not. This is the sibling of `songsFolder.cjs` and answers the same question the
 * same way — the folder is the source of truth, and nothing the app holds stands in for it.
 *
 * **Directories only, and dotfiles excluded.** A gig is a directory (`<gigs>/setup/<id>/`), so a
 * loose file beside them is not a gig at any stage; dotfiles are the filesystem's, not the suite's.
 * **Whether a directory is a gig is not decided here** — that needs `gig.json` read, which is the
 * renderer's business (`src/gigFolderList.ts`). This lists what is there.
 *
 * **It does not recurse**, for the same reason the songs listing does not: a gig's id is its
 * folder's name, and a nested tree would make that ambiguous.
 *
 * **A folder that is not there and a folder that will not read are different answers.** Nothing
 * creates `<gigs>/setup/`; Pregonero makes it the first time it writes a gig into it. So an absent
 * folder is no gigs yet — `present: false`, and no problem to report — while a folder that is
 * there and refuses to be read is a failure with a name, which the gigs list says out loud rather
 * than rendering as an empty column.
 */
function listGigFolders(folderPath, options = {}) {
  const readdirSync = options.readdirSync || fs.readdirSync
  const existsSync = options.existsSync || fs.existsSync
  try {
    if (!existsSync(folderPath)) return { ok: true, present: false, folders: [] }
    const entries = readdirSync(folderPath, { withFileTypes: true })
    const folders = entries
      .filter((entry) => entry && typeof entry.name === 'string')
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.'))
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, present: true, folders }
  } catch (err) {
    // **Never a throw on the way to a screen.** A gigs folder that has been moved or unplugged is
    // an empty list with a reason, not a blank app.
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

module.exports = { listGigFolders }
