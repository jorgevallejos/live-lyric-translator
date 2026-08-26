const fs = require('fs')
const path = require('path')

const GIG_FILE_NAME = 'gig.json'
const DEFAULT_VISUALS_FILE_NAME = 'visuals.json'

/**
 * The gig folder, from the main process.
 *
 * One read returns everything the renderer needs to compute readiness, because the alternative is
 * three round trips that can each see a different moment. Nothing here decides whether a gig is
 * ready — that is `src/gigReadiness.ts`'s job and only its job. This reports what is on disk.
 *
 * `visualsPointer` is `gig.json`'s own `visuals` field when it has one; it is resolved against the
 * gig folder, and a pointer escaping that folder is refused rather than followed.
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
    result.visualsError = `The visuals pointer "${visualsPointer}" leaves the gig folder.`
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
 * Resolves a relative pointer against the gig folder. Null when it would escape it: a gig folder
 * is a folder somebody hands over on a stick, and a pointer out of it is a file that will not
 * travel with the gig.
 */
function resolveInsideFolder(folderPath, pointer) {
  const resolved = path.resolve(folderPath, pointer)
  const base = path.resolve(folderPath)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}

/** Writes `gig.json`. Pregonero is its only writer, so there is no merge and nothing to reconcile. */
function writeGigFile(folderPath, text, options = {}) {
  const writeFileSync = options.writeFileSync || fs.writeFileSync
  try {
    writeFileSync(path.join(folderPath, GIG_FILE_NAME), text, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
}

module.exports = { readGigFolder, writeGigFile, resolveInsideFolder, GIG_FILE_NAME }
