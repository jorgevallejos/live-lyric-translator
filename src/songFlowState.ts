/**
 * **Which song the flow at `#/song` is about, for as long as it is on screen.**
 *
 * In memory, and deliberately. A flow is a `bombista serve` subprocess, a staging directory and a
 * page mid-answer; none of that survives a reload, so a record of it that did would describe a run
 * that is not there any more. Leaving the screen ends the flow, and this goes with it.
 *
 * **There are two ways in and they differ in one field.** `New` starts a flow with no song, and
 * the song's identity arrives at the end, out of the file `Save to the catalogue` writes — which is
 * why nothing is created up front and why Pregonero never asks for a name. A row starts a flow on
 * a song that already exists, and passes its file so the same screen can say which song it is.
 */

export type SongFlowRequest = {
  /** The directory `bombista serve` is told to work in, and the one file comes back out of. */
  staging: string
  /** Milliseconds since the epoch. Anything older in `staging` belongs to an earlier flow. */
  startedAt: number
  /** The song being edited, or null when this flow is making one. */
  songPath: string | null
  /** What to call it on screen before it has a name of its own. */
  title: string
}

let pending: SongFlowRequest | null = null

export function setSongFlowRequest(request: SongFlowRequest): void {
  pending = request
}

export function getSongFlowRequest(): SongFlowRequest | null {
  return pending
}

export function clearSongFlowRequest(): void {
  pending = null
}
