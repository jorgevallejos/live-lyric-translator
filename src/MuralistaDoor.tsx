import { useState } from 'react'
import { canHostTools, closeTool, openTool } from './platform'
import { refreshGigReadiness, getRememberedGigFolder } from './gigSession'
import { gigSetupFolder } from './fileLayout'
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
 * **It names the folder in full, and this is a stopgap for something that should not be asked at
 * all** (2026-09-01). Pregonero created this gig's folder and knows where its `setup/` is, so
 * asking the person to navigate to it is the app making them supply an answer it already holds —
 * and it is worse than usual here, because that folder moved on 01/09, so anybody working from
 * memory now picks the wrong one. **Handing Muralista the folder is not possible from this side.**
 * Its page acquires the folder through `showDirectoryPicker`, and a `FileSystemDirectoryHandle` can
 * only be minted by that picker under a user gesture — Chromium admits no path-to-handle route, and
 * Electron 41 exposes no hook to answer or pre-seed the picker (its File System Access surface is
 * `setPermissionRequestHandler`, which grants access to a path already chosen, and the
 * `file-system-access-restricted` event). Removing the question needs Muralista to accept the
 * folder some other way, which is a change in its own repo. **Until then the exact path is on
 * screen, so the answer is copyable rather than remembered.**
 */

/**
 * **The folder to hand over, spelled out.**
 *
 * Pregonero knows this path and cannot pass it, so the least it can do is not make anybody
 * remember it. The folder moved on 01/09: a person going where they went last time now lands one
 * level too high, picks the gig folder, and Muralista writes `visuals.json` somewhere Pregonero
 * will never look for it — a failure with no error anywhere.
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
  const setupFolder = gigFolder === null ? null : gigSetupFolder(gigFolder)

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
            Pregonero discovers the room on the next re-check.
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
                  // The folder argument is ignored for this key: the main process serves the
                  // vendored page out of the app itself. It is still passed so the one IPC keeps
                  // one shape.
                  const result = await openTool(MURALISTA_KEY, '', MURALISTA_PAGE, 'Muralista')
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
          <p className="gig-hint">
            Hand it the <code>setup</code> folder inside this gig: <code>gig.json</code> is in there,
            and <code>visuals.json</code> is written beside it. The rest of the gig folder is yours.
          </p>
          <SetupFolderPath path={setupFolder} />
          <p className="gig-hint">
            Muralista writes <code>visuals.json</code> and Pregonero reads it. Nothing passes between
            them while both are running — <strong>Done</strong> only saves you closing the window and
            re-checking, which happens on the next open anyway.
          </p>
        </div>
      )}
    </div>
  )
}
