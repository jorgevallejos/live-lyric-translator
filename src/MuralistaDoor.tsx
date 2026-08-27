import { useState } from 'react'
import { canHostTools, chooseFolderPath, closeTool, openTool } from './platform'
import { getMuralistaFolder, setMuralistaFolder } from './contentFolders'
import { refreshGigReadiness } from './gigSession'

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
 */

export const MURALISTA_KEY = 'muralista'
export const MURALISTA_PAGE = 'mapper.html'

export function MuralistaDoor() {
  const [folder, setFolder] = useState<string | null>(getMuralistaFolder)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const hosted = canHostTools()

  return (
    <div data-testid="door-body-visuals">
      <p className="gig-hint">
        Where a song’s content lands on the wall is <strong>Muralista’s</strong>. A song reassigns —
        it picks which existing shape of a kind it uses — and never holds its own geometry, because
        re-mapping the room would leave it silently on the old position.
      </p>
      <p className="gig-hint">
        If no shape fits, go back to step 3 and add one at gig level. Shapes stay at gig level; this
        extends the set, it never gives a song a room of its own.
      </p>

      {!hosted ? (
        <p className="gig-hint" data-testid="muralista-unhosted">
          Muralista can only be hosted from the desktop app. Open <code>mapper.html</code> in Chrome
          and hand it this gig folder — it is fully usable on its own, and Pregonero discovers the
          room on the next re-check.
        </p>
      ) : folder === null ? (
        <div data-testid="muralista-no-folder">
          <p className="gig-hint">
            Pregonero does not know where Muralista is on this machine, and does not carry a copy —
            a copy would be a fork, and the room is Muralista’s. Point at the folder holding{' '}
            <code>mapper.html</code>.
          </p>
          <div className="gig-actions">
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="muralista-choose-folder"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void (async () => {
                  const chosen = await chooseFolderPath('Choose Muralista’s mapper folder')
                  if (chosen) {
                    setMuralistaFolder(chosen)
                    setFolder(chosen)
                  }
                  setBusy(false)
                })()
              }}
            >
              Choose Muralista’s folder
            </button>
          </div>
        </div>
      ) : (
        <div data-testid="muralista-hosted">
          <p className="gig-hint">{folder}</p>
          <div className="gig-actions">
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="muralista-open"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setError(null)
                void (async () => {
                  const result = await openTool(
                    MURALISTA_KEY,
                    folder,
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
                data-testid="muralista-done"
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
            <button
              type="button"
              className="ctrl-btn ctrl-setup-link"
              data-testid="muralista-forget-folder"
              disabled={busy}
              onClick={() => {
                setMuralistaFolder(null)
                setFolder(null)
              }}
            >
              Forget this folder
            </button>
          </div>
          {error !== null && (
            <p className="setup-song-problem" data-testid="muralista-error">
              {error}
            </p>
          )}
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
