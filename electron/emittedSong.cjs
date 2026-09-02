const fs = require('fs')
const path = require('path')

/**
 * **The file `Save to the catalogue` wrote, in a staging directory Pregonero named.**
 *
 * This is the whole of how Pregonero learns that the song flow finished. The page is Bombista's,
 * served by Bombista, rendered in a frame Pregonero does not reach into — so there is no event to
 * listen for and no channel to open. **What passes between the two tools is a directory in and a
 * file path out**, which is the same contract as every other join in this suite, and this is the
 * *out*.
 *
 * **What is in the directory, and why the rule is this shape.** A run started from Bombista's page
 * 1 writes `asr-words.jsonl` and `asr-words.meta.json` and nothing else; `/api/emit` then writes
 * `<stem>.json` beside them — a NEW file, never one of its own inputs (Bombista's invariant 6). A
 * directory reused from an older `align` run may also hold `<stem>-song.json`,
 * `<stem>-timeline.json` and `<stem>-report.json`, so those are named and excluded rather than
 * left to luck.
 *
 * **The modification time is the other half.** Editing a song reuses that song's staging directory,
 * so the emitted file from the *previous* edit is sitting there before this flow starts — and a
 * flow that reported itself finished the instant it opened would promote a stale timeline over the
 * one being made. The caller passes the moment the flow began; anything older than that is not
 * this flow's answer.
 *
 * Never throws: a directory that is not there yet is simply an answer of *nothing saved*.
 */
const EXCLUDED_SUFFIXES = ['-song.json', '-timeline.json', '-report.json']
const EXCLUDED_NAMES = ['asr-words.meta.json']

function emittedSongIn(folderPath, since = 0) {
  let names
  try {
    names = fs.readdirSync(folderPath)
  } catch {
    return { path: null }
  }
  const candidates = names.filter(
    (name) =>
      typeof name === 'string' &&
      name.endsWith('.json') &&
      !name.startsWith('.') &&
      !EXCLUDED_NAMES.includes(name) &&
      !EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))
  )
  // Newest first: a directory can only legitimately hold one of these, and if a rename ever put a
  // second one there the one this flow just wrote is the one meant.
  const found = candidates
    .map((name) => {
      const full = path.join(folderPath, name)
      try {
        return { path: full, mtimeMs: fs.statSync(full).mtimeMs }
      } catch {
        return null
      }
    })
    .filter((entry) => entry !== null && entry.mtimeMs >= since)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { path: found.length > 0 ? found[0].path : null }
}

module.exports = { emittedSongIn }
