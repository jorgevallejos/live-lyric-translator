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
    for (const attr of ['preload', 'nodeintegration', 'webpreferences', 'allow']) {
      expect(frame.getAttribute(attr)).toBeNull()
    }
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
