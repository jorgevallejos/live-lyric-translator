/** @vitest-environment jsdom */
/**
 * **The gig flow's step 3: Muralista, in a frame, on this gig** (step 9.3, 2026-09-03).
 *
 * What these defend:
 *
 * - **The step is the tool, not a door to it.** Muralista is served on arrival and framed, the way
 *   Bombista is in the song flow — so pressing a button over there is not a launch into another
 *   program, and the two flows read as one kind of thing.
 * - **It never asks for a folder.** Pregonero made this gig's folder and knows it, so it serves
 *   that folder and Muralista reads and writes over a relative URL. A question with one knowable
 *   answer is not a question, and this one's failure was silent.
 * - **Nothing passes through the frame.** No preload, nothing read out, nothing put in. The file is
 *   still the only channel between the two tools.
 * - **Unhosted, the control is disabled with the reason — never absent**, because Muralista is
 *   fully usable on its own and a screen with nothing on it reads as a wall rather than a fork.
 *
 * Its own file because `GigFlowView.test.tsx` mocks `canHostTools` to false for the whole module,
 * and hosted is the half this screen is about.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { installRequiredFolders } from './testSupport/folders'
import { dropLibraryCache } from './setlistStore'

const readGigFolder = vi.fn()
const writeGigFile = vi.fn()
const serveTool = vi.fn()
const canHostTools = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => false,
  canHostTools: (...a: unknown[]) => canHostTools(...a),
  serveTool: (...a: unknown[]) => serveTool(...a),
  runBombista: vi.fn(),
  bombistaVersion: vi.fn(),
  bombistaStagingDir: vi.fn(),
  openTool: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  chooseFolderPath: vi.fn(),
  hasGigFolderAccess: () => true,
  hasFolderPicker: () => true,
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: (...a: unknown[]) => writeGigFile(...a),
  createGigFolder: vi.fn(),
  readSongFileText: () => Promise.resolve({ ok: false, error: 'no file in a test' }),
}))

const App = (await import('./App')).default
const { rememberGigFolder, resetGigSession } = await import('./gigSession')

const GIGS_ROOT = '/vault/gigs'
const GIG_ID = 'w7q4hbz1nm'
const FOLDER = `${GIGS_ROOT}/setup/${GIG_ID}`
const WAIT = { timeout: 3000 }

function createStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.setItem !== 'function') {
    vi.stubGlobal('localStorage', createStorage())
  }
  if (typeof globalThis.sessionStorage === 'undefined' || typeof globalThis.sessionStorage.setItem !== 'function') {
    vi.stubGlobal('sessionStorage', createStorage())
  }
  vi.stubGlobal('WebSocket', vi.fn().mockImplementation(function () {
    return { readyState: 1, send: vi.fn(), close: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }
  }))
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  installRequiredFolders('/vault/songs', GIGS_ROOT)
  dropLibraryCache()
  vi.clearAllMocks()
  resetGigSession()
  canHostTools.mockReturnValue(true)
  serveTool.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:5555/muralista/mapper.html?gig=/gig-setup/' })
  writeGigFile.mockResolvedValue({ ok: true })
  readGigFolder.mockResolvedValue({
    folderPath: FOLDER,
    gigText: JSON.stringify({
      gigVersion: 1,
      id: GIG_ID,
      date: '2026-05-16',
      venue: { name: 'BOM Festival', city: 'Brussels' },
      visuals: './visuals.json',
      // **The gig has a setlist**, because since 2026-09-04 the visuals step is unreachable
      // without one — *a gig with no setlist is not a gig*, enforced at last. The file need not
      // resolve: readiness counts the running order, and an unreadable song is still a song in it.
      songs: [{ id: 'duelo', title: 'Duelo', file: 'duelo.json' }],
      setlist: ['duelo'],
    }),
    gigError: null,
    gigPresent: true,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  })
  rememberGigFolder(FOLDER)
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

/**
 * **Muralista saying which of its own screens is showing**, exactly as `announceFlowStep` does:
 * one string, posted from the frame's own window. The `source` is what Pregonero checks, so the
 * test has to send it from there too — a message from anywhere else is ignored by design.
 */
function announceMuralistaStep(step: string) {
  const frame = screen.getByTestId('gig-flow-visuals-frame') as HTMLIFrameElement
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { muralista: 'flow-step', step },
      source: frame.contentWindow,
    })
  )
}

/** Opens the flow on an existing gig and steps to 3. */
async function goToVisuals() {
  await act(async () => {
    render(<App initialHash="#/gig" />)
  })
  await waitFor(() => expect(screen.getByTestId('gig-flow-step-3')).toBeTruthy(), WAIT)
  await act(async () => {
    fireEvent.click(screen.getByTestId('gig-flow-step-3'))
  })
  await waitFor(() => expect(screen.getByTestId('gig-flow-visuals')).toBeTruthy(), WAIT)
}

describe('the visuals step', () => {
  it('serves Muralista on arrival and frames it, with no button to press first', async () => {
    // **The step IS the tool.** A door with an `Open Muralista` button is what this replaced: the
    // flow's step bar and Muralista's own are on one screen, so `keep the default` over there is
    // not a launch into another program.
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const frame = screen.getByTestId('gig-flow-visuals-frame') as HTMLIFrameElement
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('src')).toBe(
      'http://127.0.0.1:5555/muralista/mapper.html?gig=/gig-setup/'
    )
    expect(screen.queryByRole('button', { name: 'Open Muralista' })).toBeNull()
  })

  it('hands over this gig’s folder, and asks nobody where it is', async () => {
    // The folder moved on 2026-09-01 and again on 09-02, so anybody acting from memory supplies
    // the wrong one and `visuals.json` lands where Pregonero never looks, with no error anywhere.
    // The only defence is not asking.
    await goToVisuals()
    await waitFor(() => expect(serveTool).toHaveBeenCalled(), WAIT)
    expect(serveTool).toHaveBeenCalledWith('muralista', FOLDER, 'mapper.html')
    // No picker on this screen, in any shape.
    expect(screen.queryByRole('button', { name: /choose|locate|browse/i })).toBeNull()
  })

  it('puts nothing through the frame: no preload, no bridge, no sandbox holes', async () => {
    // What Pregonero knows about this page is the address it was told to draw. The file is the
    // only channel between the two tools, which is the boundary the desk-tool cut drew.
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const frame = screen.getByTestId('gig-flow-visuals-frame')
    for (const attr of ['preload', 'nodeintegration', 'webpreferences']) {
      expect(frame.getAttribute(attr)).toBeNull()
    }
    // **`allow` USED TO BE ON THAT LIST, AND IT IS A CLOSED LIST NOW INSTEAD** (2026-09-04).
    // A permissions-policy allowlist is not a bridge: it hands the page a DEVICE it asks the
    // browser for itself, and nothing about Pregonero crosses with it. Asserted whole rather than
    // merely non-empty, for the same reason `localhostServer` names its writable files one by one:
    // the next feature that wants `microphone` or `display-capture` has to argue for it here.
    expect(frame.getAttribute('allow')).toBe('camera')
  })

  it('says what it is doing while the server is coming up', async () => {
    let release: (v: unknown) => void = () => {}
    serveTool.mockReturnValue(new Promise((r) => { release = r }))
    await goToVisuals()
    expect(screen.getByTestId('gig-flow-visuals-starting')).toBeTruthy()
    await act(async () => {
      release({ ok: true, url: 'http://127.0.0.1:5555/x/mapper.html' })
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
  })

  it('names a server that would not start, rather than framing nothing', async () => {
    serveTool.mockResolvedValue({ ok: false, error: 'EADDRINUSE: 127.0.0.1' })
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-error')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('gig-flow-visuals-error').textContent).toContain('EADDRINUSE')
    expect(screen.queryByTestId('gig-flow-visuals-frame')).toBeNull()
  })

  /**
   * **BOTH PROSE BLOCKS CAME OFF** (Jorge, 2026-09-04). *Where things land on the wall is
   * Muralista's…* and *It opens on this gig: `gig.json` is read from its folder…* described the
   * plumbing, which is what this project has deleted from every screen it has appeared on. What
   * they said is true and now lives in the comment on `ScreenVisuals`.
   */
  it('says nothing about the plumbing on the screen', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const text = screen.getByTestId('gig-flow-visuals').textContent ?? ''
    expect(text).not.toMatch(/land on the wall|lands on the wall/i)
    expect(text).not.toMatch(/gig\.json/i)
    expect(text).not.toMatch(/visuals\.json/i)
    expect(screen.queryByTestId('gig-flow-visuals-endpoint')).toBeNull()
    // The screen is the frame and nothing else — the way onward is not even there yet.
    expect(text.replace(/\s+/g, ' ').trim()).toBe('')
  })

  /**
   * **`To the check →` BELONGS ON `2 OUTPUT` AND NOWHERE ELSE** (Jorge, 2026-09-04). On THE DEAL
   * and 1 SHAPES it is a second forward control on a screen that already has one — the nesting
   * problem this step spent a round removing, one layer down.
   */
  it('keeps the outer flow’s forward control off Muralista’s own screens', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    // Nothing said yet: the control is off rather than on a guess.
    expect(screen.queryByTestId('gig-flow-forward')).toBeNull()

    await act(async () => announceMuralistaStep('deal'))
    expect(screen.queryByTestId('gig-flow-forward')).toBeNull()

    await act(async () => announceMuralistaStep('shapes'))
    expect(screen.queryByTestId('gig-flow-forward')).toBeNull()

    await act(async () => announceMuralistaStep('output'))
    expect(screen.getByTestId('gig-flow-forward').textContent).toBe('To the sign-off →')

    // And it goes away again if Muralista goes back — the control follows the screen, it does not
    // latch on the first time the output is seen.
    await act(async () => announceMuralistaStep('shapes'))
    expect(screen.queryByTestId('gig-flow-forward')).toBeNull()
  })

  /**
   * **THE CONTROL THAT LEAVES IS THE CONTROL THAT WRITES** (Jorge, 2026-09-04, walking `v0.54.0`).
   * Two controls where one leaves and the other writes is a trap even when both work — the second
   * time that shape appeared, after `Save the gig →`. `Save to gig` is gone from Muralista in a gig
   * context and this press asks for it.
   */
  it('asks Muralista to save the room, and waits for the answer', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const frame = screen.getByTestId('gig-flow-visuals-frame') as HTMLIFrameElement
    const posted: unknown[] = []
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage: (data: unknown) => posted.push(data),
      },
    })
    await act(async () => announceMuralistaStep('output'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-forward'))
    })
    expect(posted).toEqual([{ muralista: 'save' }])
    // **It has not left**, and it says what it is doing while it waits.
    expect(screen.getByTestId('gig-flow-visuals')).toBeTruthy()
    expect(screen.getByTestId('gig-flow-forward').textContent).toBe('Saving the room…')
    expect((screen.getByTestId('gig-flow-forward') as HTMLButtonElement).disabled).toBe(true)
  })

  /**
   * **It leaves only if the save happened.** Navigating away from a failed write would report
   * success by arriving somewhere, which is the defect `Confirm setup` was fixed for once already.
   */
  it('stays put and names the refusal when the room was not saved', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const frame = screen.getByTestId('gig-flow-visuals-frame') as HTMLIFrameElement
    const source = { postMessage: () => undefined }
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: source })
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { muralista: 'flow-step', step: 'output' },
          source: source as unknown as Window,
        })
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-forward'))
    })
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { muralista: 'save-result', ok: false, reason: 'HTTP 500' },
          source: source as unknown as Window,
        })
      )
    })
    expect(screen.getByTestId('gig-flow-save-problem').textContent).toBe('HTTP 500')
    expect(screen.getByTestId('gig-flow-visuals')).toBeTruthy()
    expect(screen.getByTestId('gig-flow-forward').textContent).toBe('To the sign-off →')
  })

  /**
   * **THE `v0.54.0` BLOCKER, AND IT WAS NEITHER OF THE FIRST TWO POSSIBILITIES.** The room was
   * saved and the sign-off said `No ./visuals.json yet`. The write lands in the gig folder — a
   * `PUT` through the mount returning 204, `visuals.json` beside `gig.json` and nowhere else — so
   * it was **written, and readiness was answering from a snapshot taken when the screen mounted.**
   * The folder is re-read before anything advances.
   */
  it('re-reads the gig folder before it leaves, which is the blocker', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    const frame = screen.getByTestId('gig-flow-visuals-frame') as HTMLIFrameElement
    const source = { postMessage: () => undefined }
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: source })
    const before = readGigFolder.mock.calls.length
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { muralista: 'flow-step', step: 'output' },
          source: source as unknown as Window,
        })
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-forward'))
    })
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { muralista: 'save-result', ok: true, reason: null },
          source: source as unknown as Window,
        })
      )
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-check')).toBeTruthy(), WAIT)
    // The folder was looked at again. Before the fix this count never moved after mount.
    expect(readGigFolder.mock.calls.length).toBeGreaterThan(before)
  })

  /**
   * **Only the frame is believed.** Any page on this machine can post to this window, and a
   * control that advances a flow is not a thing to hand to whoever shouts.
   */
  it('ignores a step announcement that did not come from the frame', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { muralista: 'flow-step', step: 'output' },
          source: window,
        })
      )
    })
    expect(screen.queryByTestId('gig-flow-forward')).toBeNull()
  })

  /**
   * **THE CAMERA, AND THE ONE ATTRIBUTE THAT WAS MISSING** (walked 2026-09-04). Muralista's
   * `Enable camera` listed no camera on a machine with two. A cross-origin iframe gets `camera`
   * DISABLED by Permissions Policy unless the embedder allows it, and Pregonero's renderer is
   * `file://` while the tool is served from `http://127.0.0.1`. Measured in Electron 41: without
   * this attribute `enumerateDevices()` returns one videoinput with an empty id and a blank label
   * and `getUserMedia` rejects `NotAllowedError`; with it both cameras come back by name.
   */
  it('lets the camera through to the frame, which is what makes it list one', async () => {
    await goToVisuals()
    await waitFor(() => expect(screen.getByTestId('gig-flow-visuals-frame')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('gig-flow-visuals-frame').getAttribute('allow')).toBe('camera')
  })

  it('is disabled with the reason, never absent, outside the desktop app', async () => {
    // Muralista is fully usable on its own by requirement, and the escape hatch is the real answer
    // here — but a screen with no control on it reads as a wall rather than as a fork in the road.
    canHostTools.mockReturnValue(false)
    await goToVisuals()
    expect(screen.getByTestId('gig-flow-visuals-unhosted')).toBeTruthy()
    const button = screen.getByTestId('gig-flow-muralista') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('gig-flow-muralista-reason').textContent).toContain('desktop app')
    // And the folder is printed, because unhosted it IS the answer somebody has to type in.
    expect(screen.getByTestId('gig-flow-visuals-folder').textContent).toBe(FOLDER)
    expect(serveTool).not.toHaveBeenCalled()
  })
})
