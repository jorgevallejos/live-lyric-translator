const fs = require('fs')
const path = require('path')

const GIG_FILE_NAME = 'gig.json'
const DEFAULT_VISUALS_FILE_NAME = 'visuals.json'

/**
 * **The machine's two files in a gig, from the main process.**
 *
 * `folderPath` is `<gig>/setup` — the renderer joins it (`src/fileLayout.ts`), the way it already
 * joins every other path this process is handed. **A gig folder belongs to the author**: the poster,
 * the contract and the stage plan are his and sit at its root, and `gig.json` and
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
 * **Makes a gig's folder inside the one folder the tools own.** The name is the folder's name and
 * the gig's id, and `setupRoot` is `<gigs>/setup`, already joined by the renderer — this process
 * stays as ignorant of the suite's conventions as it is about every other folder it is handed.
 *
 * **Nothing is ever created in the artist's territory** (Jorge, 2026-09-02). Until then this made
 * `<gigs>/<gig>/` and the write below put a `setup/` inside it, so the tools' hands were in the
 * folder the poster and the contract live in. One folder, named, is checkable; a rule that depends
 * on judgement fails the way judgement fails, and this project has already paid for that once.
 *
 * **`setup/` itself is made here if it is not there**, which is the one directory this process
 * creates in the gigs root and the whole of what it may create.
 *
 * **The name is one folder segment and is never interpreted.** A separator, a `.` or a `..` is
 * refused by name rather than sanitised into something else: a gig quietly created somewhere
 * other than where it was asked for is worse than a refusal that says so.
 *
 * **An existing folder is refused, not adopted.** Opening a gig that is already there is what the
 * gig list is for, and creating over one would be the first step towards writing into a stranger's
 * folder.
 */
function createGigFolder(setupRoot, name, options = {}) {
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

  const folderPath = path.join(setupRoot, trimmed)
  if (existsSync(folderPath)) {
    return {
      ok: false,
      error: `There is already a gig called "${trimmed}". Open it from the gigs list rather than making a second one.`,
    }
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

module.exports = {
  readGigFolder,
  createGigFolder,
  writeGigFile,
  resolveInsideFolder,
  GIG_FILE_NAME,
}
