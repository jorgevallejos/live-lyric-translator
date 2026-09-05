import { useState } from 'react'
import { canHostTools, closeTool, openTool } from './platform'
import { refreshGigReadiness, getRememberedGigFolder } from './gigSession'
import { GatedAction } from './GatedAction'

/**
 * **The visuals door: Muralista, hosted in a window of its own.**
 *
 * Served over `http://127.0.0.1`, **never `file://`** — Muralista's File System Access API needs a
 * secure context, which `file://` does not provide, and `file://` also hits the `webSecurity` block
 * on media this repo already solved once with the `media://` protocol.
 *
 * **Hosting is packaging, not architecture.** Nothing passes between the two running processes:
 * Muralista writes `visuals.json` and Pregonero reads it on the next open. **The file is the only
 * channel**, and that is the boundary the desk-tool cut rejected breaking.
 *
 * **"Pass control back" is courtesy, not architecture.** *Done* closes the window and re-checks the
 * folder — the reload would have happened anyway because the file changed. **If the bridge is
 * absent the button is absent**, and you open Muralista in a browser as you do today: it is fully
 * usable without Pregonero by requirement, and that is what makes the setup flow's strictness
 * affordable.
 *
 * **Two scopes, one door** (2026-09-01). Merging gig visuals and song visuals into one step put
 * both on the same screen, and they are the same tool: Muralista maps the room and assigns the
 * shapes. What differs is what you came to it for — *map this room* against *this one song sits
 * somewhere else* — so the scope changes the sentence above the button and the ids beside it, and
 * nothing else. Rendering the identical door twice on one screen was the alternative, and two
 * controls with the same name doing the same thing is how a screen stops being readable.
 *
 * **Hosted, the folder is never asked for** (2026-09-01). Pregonero created this gig's folder and
 * knows where its `setup/` is, so asking the person to navigate to it was the app making them
 * supply an answer it already holds — and it was worse here than elsewhere, because that folder
 * moved on 01/09, so anybody acting from memory supplied the wrong one and `visuals.json` landed
 * where Pregonero never looks, with no error anywhere.
 *
 * **It could not be handed over as a folder, so it is handed over as an endpoint.** Muralista
 * acquires a folder through `showDirectoryPicker`, and a `FileSystemDirectoryHandle` is only
 * mintable by that picker under a user gesture — Chromium admits no path-to-handle route, and
 * Electron 41 exposes no hook to answer or pre-seed it. So the door passes this gig's `setup/`
 * path to the main process, which serves that folder and takes the one `PUT` of `visuals.json`
 * back. **Rule 2 of the contract was amended for exactly this and nothing more**, and rule 1
 * survives on the verbatim guard in `localhostServer.cjs`: the bytes go to disk unread, and
 * Pregonero learns the mapping afterwards by reading the file, as it always has.
 *
 * **Standalone is untouched, which is rule 3.** With no host there is no parameter and Muralista
 * picks its own folder — so the printed path stays on the unhosted branch, where it is the answer
 * somebody has to type into a picker.
 */

/**
 * **The folder to hand over, spelled out** — on the standalone branch, where it is still asked for.
 *
 * The folder moved on 01/09: a person going where they went last time lands one level too high,
 * picks the gig folder, and Muralista writes `visuals.json` somewhere Pregonero will never look
 * for it — a failure with no error anywhere.
 */
function SetupFolderPath({ path }: { path: string | null }) {
  if (path === null) return null
  return (
    <p className="folders-source-path" data-testid="muralista-setup-folder">
      {path}
    </p>
  )
}

export const MURALISTA_KEY = 'muralista'
export const MURALISTA_PAGE = 'mapper.html'

/** Which question brought you to Muralista. It changes the words and the ids, and nothing else. */
export type MuralistaScope = 'gig' | 'song'

export function MuralistaDoor({ scope = 'song' }: { scope?: MuralistaScope } = {}) {
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const hosted = canHostTools()
  const gig = scope === 'gig'
  const testId = gig ? 'gig-visuals-door' : 'door-body-visuals'
  const site = gig ? 'muralista-open-gig' : 'muralista-open'
  const gigFolder = getRememberedGigFolder()
  // **The gig's folder is where `visuals.json` goes**, directly: since 2026-09-02 a gig *is*
  // `<gigs>/setup/<gig>`, so there is no second folder to join on to it.
  const setupFolder = gigFolder

  return (
    <div data-testid={testId}>
      {gig ? (
        <p className="gig-hint">
          The room is <strong>Muralista’s</strong>: the shapes on the wall and the type of each,
          mapped standing in front of it, which is the only place those decisions can honestly be
          made. One setup serves every song in the gig.
        </p>
      ) : (
        <>
          <p className="gig-hint">
            Where a song’s content lands on the wall is <strong>Muralista’s</strong>. A song
            reassigns — it picks which existing shape of a kind it uses — and never holds its own
            geometry, because re-mapping the room would leave it silently on the old position.
          </p>
          <p className="gig-hint">
            If no shape fits, add one at gig level in the half above. Shapes stay at gig level; this
            extends the set, it never gives a song a room of its own.
          </p>
        </>
      )}

      {!hosted ? (
        // **Disabled, not absent.** The escape hatch below is the real answer here — Muralista is
        // fully usable on its own by requirement — but a screen with no control on it reads as a
        // wall rather than as a fork in the road. See `GatedAction`.
        <div data-testid={gig ? 'muralista-unhosted-gig' : 'muralista-unhosted'}>
          <GatedAction
            site={site}
            label="Open Muralista"
            blockedBy="Muralista can only be hosted from the desktop app, not from a browser tab."
            onClick={() => undefined}
          />
          <p className="gig-hint">
            Open <code>mapper.html</code> in Chrome and hand it the <code>setup</code> folder inside
            this gig — that is where <code>gig.json</code> is, and where{' '}
            <code>visuals.json</code> goes beside it. Muralista is fully usable on its own, and
            Tramoya discovers the room on the next re-check.
          </p>
          <SetupFolderPath path={setupFolder} />
        </div>
      ) : (
        <div data-testid={gig ? 'muralista-hosted-gig' : 'muralista-hosted'}>
          <div className="gig-actions">
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid={site}
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setError(null)
                void (async () => {
                  // **The folder argument is this gig's `setup/`, not the page's.** The main
                  // process serves the vendored page out of the app itself, so the argument
                  // carries the thing that varies: where `gig.json` is and where `visuals.json`
                  // goes. Joined here because `fileLayout.ts` is the only place the word `setup`
                  // is written. With no gig open it is empty, and Muralista opens exactly as a
                  // standalone one — no parameter, its own picker, its own write.
                  const result = await openTool(
                    MURALISTA_KEY,
                    setupFolder ?? '',
                    MURALISTA_PAGE,
                    'Muralista'
                  )
                  if (result.ok) setOpen(true)
                  else setError(result.error)
                  setBusy(false)
                })()
              }}
            >
              Open Muralista
            </button>
            {open && (
              <button
                type="button"
                className="ctrl-btn ctrl-setup-link"
                data-testid={gig ? 'muralista-done-gig' : 'muralista-done'}
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void (async () => {
                    await closeTool(MURALISTA_KEY)
                    setOpen(false)
                    await refreshGigReadiness()
                    setBusy(false)
                  })()
                }}
              >
                Done
              </button>
            )}
          </div>
          {error !== null && (
            <p className="setup-song-problem" data-testid={gig ? 'muralista-error-gig' : 'muralista-error'}>
              {error}
            </p>
          )}
          <p className="gig-hint" data-testid={gig ? 'muralista-endpoint-gig' : 'muralista-endpoint'}>
            {setupFolder === null ? (
              <>
                No gig is open, so Muralista opens as it does on its own and asks where to write.
                Open a gig first and it will not ask.
              </>
            ) : (
              <>
                It opens on this gig: <code>gig.json</code> is read from its <code>setup</code>{' '}
                folder and <code>visuals.json</code> is written back beside it.{' '}
                <strong>You are not asked where</strong> — Tramoya made that folder and knows it.
              </>
            )}
          </p>
          <p className="gig-hint">
            Muralista decides every byte of <code>visuals.json</code>; Tramoya puts them on disk
            without reading them and learns the room afterwards by reading the file.{' '}
            <strong>Done</strong> only saves you closing the window and re-checking, which happens
            on the next open anyway.
          </p>
        </div>
      )}
    </div>
  )
}
