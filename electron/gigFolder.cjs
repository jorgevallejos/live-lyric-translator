const fs = require('fs')
const path = require('path')

const GIG_FILE_NAME = 'gig.json'
const DEBRIEF_FILE_NAME = 'debrief.md'
const DEFAULT_VISUALS_FILE_NAME = 'visuals.json'

/**
 * **The machine's two files in a gig, from the main process.**
 *
 * `folderPath` is `<gig>/setup` — the renderer joins it (`src/fileLayout.ts`), the way it already
 * joins every other path this process is handed. **A gig folder belongs to the author**: the poster,
 * the contract, the stage plan and `debrief.md` are his and sit at its root, and `gig.json` and
 * `visuals.json` are guests quarantined one level in. Nothing here knows that; it is handed the
 * folder the two files are in and reads them.
 *
 * One read returns everything the renderer needs to compute readiness, because the alternative is
 * round trips that can each see a different moment. It stays one read and one directory: the only
 * files it has ever returned are the pair, and the pair moved together. Nothing here decides whether
 * a gig is ready — that is `src/gigReadiness.ts`'s job and only its job. This reports what is on
 * disk.
 *
 * `visualsPointer` is `gig.json`'s own `visuals` field when it has one. It is resolved **against the
 * folder `gig.json` itself is in**, and a pointer escaping that folder is refused rather than
 * followed — so `visuals.json` must sit beside `gig.json`, and a pointer at `../poster.png` is now a
 * refusal. That is the containment the contract wants: the two files are a pair, and a visuals
 * pointer reaching out into the author's half of the folder is not one.
 */
function readGigFolder(folderPath, options = {}) {
  const readFileSync = options.readFileSync || fs.readFileSync
  const existsSync = options.existsSync || fs.existsSync
  const visualsPointer = options.visualsPointer || `./${DEFAULT_VISUALS_FILE_NAME}`

  const result = {
    folderPath,
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  }

  const gigPath = path.join(folderPath, GIG_FILE_NAME)
  if (existsSync(gigPath)) {
    result.gigPresent = true
    try {
      result.gigText = readFileSync(gigPath, 'utf8')
    } catch (err) {
      result.gigError = (err && err.message) || String(err)
    }
  }

  const visualsPath = resolveInsideFolder(folderPath, visualsPointer)
  if (visualsPath === null) {
    result.visualsError = `The visuals pointer "${visualsPointer}" leaves the folder gig.json is in.`
    return result
  }
  if (existsSync(visualsPath)) {
    result.visualsPresent = true
    try {
      result.visualsText = readFileSync(visualsPath, 'utf8')
    } catch (err) {
      result.visualsError = (err && err.message) || String(err)
    }
  }
  return result
}

/**
 * Resolves a relative pointer against the folder the pair lives in. Null when it would escape it: a
 * gig folder is a folder somebody hands over on a stick, and a pointer out of the pair's own folder
 * is a file that is not part of the pair.
 */
function resolveInsideFolder(folderPath, pointer) {
  const resolved = path.resolve(folderPath, pointer)
  const base = path.resolve(folderPath)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}

/**
 * **Makes a gig's folder under the gigs root.** The name is the folder's name and the gig's id.
 *
 * This is what replaced the folder question. `New gig` used to open a directory picker, so the
 * first thing asked of somebody making their first gig was where on their disk it should live —
 * a filesystem decision, before the gig had a venue or a date. First run records the gigs root
 * once; this puts the gig inside it. **Picking a folder survives only for importing a gig from
 * elsewhere**, which is the portability case the two-file split exists to protect.
 *
 * **The name is one folder segment and is never interpreted.** A separator, a `.` or a `..` is
 * refused by name rather than sanitised into something else: a gig quietly created somewhere
 * other than where it was asked for is worse than a refusal that says so.
 *
 * **An existing folder is refused, not adopted.** Opening a gig that is already there is what the
 * gig list is for, and creating over one would be the first step towards writing into a stranger's
 * folder.
 */
function createGigFolder(gigsRoot, name, options = {}) {
  const mkdirSync = options.mkdirSync || fs.mkdirSync
  const existsSync = options.existsSync || fs.existsSync

  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '') return { ok: false, error: 'A gig needs a name.' }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    return {
      ok: false,
      error: `"${trimmed}" is not a folder name. A gig's name is one folder inside the gigs folder, with no slashes in it.`,
    }
  }

  const folderPath = path.join(gigsRoot, trimmed)
  if (existsSync(folderPath)) {
    return { ok: false, error: `There is already something called "${trimmed}" in the gigs folder.` }
  }
  try {
    mkdirSync(folderPath, { recursive: true })
    return { ok: true, folderPath }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

/**
 * Writes `gig.json` into the folder it is handed. Pregonero is its only writer, so there is no merge
 * and nothing to reconcile.
 *
 * **The folder is made if it is not there.** That folder is the machine's own (`<gig>/setup`), so
 * creating it is this process making room for its own file rather than reaching into the author's:
 * the gig folder itself is created by `createGigFolder`, once, when the gig is named.
 */
function writeGigFile(folderPath, text, options = {}) {
  const writeFileSync = options.writeFileSync || fs.writeFileSync
  const mkdirSync = options.mkdirSync || fs.mkdirSync
  try {
    mkdirSync(folderPath, { recursive: true })
    writeFileSync(path.join(folderPath, GIG_FILE_NAME), text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

/**
 * Writes `debrief.md` **at the gig folder's root**, where the poster and the contract are. It is
 * the one file Pregonero writes that is not the machine's: Jorge reads and finishes it, and burying
 * the human-facing document inside `setup/` gets it wrong the first time anyone goes looking months
 * later.
 *
 * Pregonero writes it and then Jorge edits it, which is why it is written whole on save rather than
 * merged: the file is his from the moment it lands, and a tool that
 * silently reconciled his edits with its own idea of the night would be the worst of both.
 */
function writeDebriefFile(folderPath, text, options = {}) {
  const writeFileSync = options.writeFileSync || fs.writeFileSync
  try {
    writeFileSync(path.join(folderPath, DEBRIEF_FILE_NAME), text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

module.exports = {
  readGigFolder,
  createGigFolder,
  writeGigFile,
  writeDebriefFile,
  resolveInsideFolder,
  GIG_FILE_NAME,
  DEBRIEF_FILE_NAME,
}
