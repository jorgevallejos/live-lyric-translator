const fs = require('fs')

/**
 * Reads a song file's text for the renderer.
 *
 * The library holds a path, not a copy, so this is how every song reaches the app. It returns a
 * value rather than throwing: a song file that has moved or gone bad must arrive as one broken
 * row on the manage screen, never as a rejected promise that takes the launch down with it.
 */
function readSongFile(filePath, readFileSync = fs.readFileSync) {
  try {
    return { ok: true, text: readFileSync(filePath, 'utf8') }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = { readSongFile }
