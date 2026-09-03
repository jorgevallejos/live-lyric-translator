/** @vitest-environment jsdom */
/**
 * **Hosting Bombista and Muralista is packaging, not architecture.**
 *
 * The three things these tests defend, all of them boundaries rather than behaviours:
 *
 * - **Muralista is hosted over `http://127.0.0.1`, never `file://`** — its File System Access API
 *   needs a secure context.
 *
 * Bombista's half of this moved to `SongFlowView.test.tsx` on 2026-09-02, with the flow itself.
 * - **Nothing passes data between running processes.** The file is the only channel, and *pass
 *   control back* is courtesy: if the bridge is absent the button is absent.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import { GIG_FOLDER_KEY } from './gigFolderStore'

const runBombista = vi.fn()
const bombistaStagingDir = vi.fn()
const chooseFilePath = vi.fn()
const chooseFolderPath = vi.fn()
const openTool = vi.fn()
const closeTool = vi.fn()
let hosted = true

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => hosted,
  canHostTools: () => hosted,
  runBombista: (...a: unknown[]) => runBombista(...a),
  bombistaVersion: () => Promise.resolve({ present: true, version: 'bombista 1.1.0' }),
  bombistaStagingDir: (...a: unknown[]) => bombistaStagingDir(...a),
  chooseFilePath: (...a: unknown[]) => chooseFilePath(...a),
  chooseFolderPath: (...a: unknown[]) => chooseFolderPath(...a),
  openTool: (...a: unknown[]) => openTool(...a),
  closeTool: (...a: unknown[]) => closeTool(...a),
  hasFolderPicker: () => true,
  hasGigFolderAccess: () => true,
  readGigFolder: vi.fn().mockResolvedValue({
    folderPath: '/g',
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  }),
  writeGigFile: vi.fn().mockResolvedValue({ ok: true }),
  validateSongForPerformance: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'no bombista' }),
  fileExists: vi.fn().mockResolvedValue(true),
  readSongFileText: vi.fn(),
  describeDisplays: vi.fn().mockResolvedValue({ count: 0, displays: [], fingerprint: '' }),
}))

const { MuralistaDoor, MURALISTA_KEY, MURALISTA_PAGE } = await import('./MuralistaDoor')

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
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  hosted = true
  runBombista.mockResolvedValue({ status: 'ok', output: 'done', code: 0 })
  bombistaStagingDir.mockResolvedValue('/staging/pimiento')
  openTool.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:51234/muralista/mapper.html' })
})

afterEach(cleanup)

describe('the visuals door: Muralista, hosted', () => {
  /**
   * **Rewritten 2026-08-31: there is no folder to choose any more.** The page is vendored — four
   * files at one tag with a hash test, the same device that already carries `warp.js` — so the two
   * tests that asserted Pregonero *asks* for a folder and *remembers* it are gone rather than
   * adjusted. A copy is not a fork when a test proves it current, and what the setting really did
   * was make the visuals door do nothing until somebody discovered it.
   */
  it('opens mapper.html without asking where Muralista is', async () => {
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    // The page comes out of the app itself; the folder argument carries the gig, and with no gig
    // open there is none.
    expect(openTool).toHaveBeenCalledWith(MURALISTA_KEY, '', MURALISTA_PAGE, 'Muralista')
  })

  /**
   * **The gig's own folder goes with the open**, and this is the whole of the visuals step's "never
   * asks for a folder" (journey step 9.3).
   *
   * Pregonero made this folder and knows it; a `FileSystemDirectoryHandle` cannot be handed to a
   * page, so the path goes to the main process, which serves that folder and takes the one write
   * back. **Since 2026-09-02 a gig *is* `<gigs>/setup/<gig>`**, so `visuals.json` lands beside
   * `gig.json` with nothing joined on to it here.
   */
  it('hands the open gig’s own folder to the tool, so nobody is asked for it', async () => {
    localStorage.setItem(GIG_FOLDER_KEY, '/gigs/setup/2026-09-04-de-poel')
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    expect(openTool).toHaveBeenCalledWith(
      MURALISTA_KEY,
      '/gigs/setup/2026-09-04-de-poel',
      MURALISTA_PAGE,
      'Muralista'
    )
  })

  it('does not print a path to be typed in when it is hosted', () => {
    // The path was a stopgap for a question that is now not asked. It stays on the standalone
    // branch, where somebody does have to type it into a picker.
    localStorage.setItem(GIG_FOLDER_KEY, '/gigs/setup/2026-09-04-de-poel')
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-setup-folder')).toBeNull()
    expect(screen.getByTestId('muralista-endpoint').textContent).toMatch(/not asked where/i)
  })

  it('says so when there is no gig to open on, rather than opening on nothing quietly', () => {
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-endpoint').textContent).toMatch(/No gig is open/)
  })

  it('never asks where Muralista is, and never says it does not carry a copy', () => {
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-choose-folder')).toBeNull()
    expect(screen.queryByTestId('muralista-forget-folder')).toBeNull()
  })

  /**
   * **The standalone branch still names the folder in full, and that is where it belongs.**
   *
   * With no bridge, Muralista is opened in Chrome and handed a folder through its own picker — so
   * the path is an answer somebody has to type, and it moved on 01/09, which is exactly when
   * memory is wrong. Rule 3 of the contract: standalone is untouched by the write path.
   */
  it('names the gig’s folder in full when there is no bridge to open the tool with', () => {
    hosted = false
    localStorage.setItem(GIG_FOLDER_KEY, '/gigs/setup/2026-09-04-de-poel')
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-setup-folder').textContent).toBe(
      '/gigs/setup/2026-09-04-de-poel'
    )
  })

  it('says nothing about a folder when no gig is open', () => {
    hosted = false
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-setup-folder')).toBeNull()
  })

  it('is served over http on localhost, never file://', async () => {
    // Muralista's File System Access API needs a secure context, which `file://` is not — and
    // vendoring the page changes where the bytes come from, never how they are served.
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    const url = (await openTool.mock.results[0]!.value).url as string
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(url).not.toMatch(/^file:/)
  })

  it('pass control back is courtesy: Done closes the window and re-checks', async () => {
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-done'))
    })
    expect(closeTool).toHaveBeenCalledWith(MURALISTA_KEY)
  })

  it('offers no Done button before anything is open — the courtesy has nothing to be courteous about', () => {
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-done')).toBeNull()
  })

  it('with no bridge, the button is disabled with its reason — and Chrome is still named', () => {
    // **Changed 2026-08-31, and the change is the point.** This asserted the button was ABSENT,
    // which is the defect the R1 walk found on `New song`: a screen with no control on it reads as
    // a wall rather than as a fork in the road, however good the sentence beside it. The escape
    // hatch is still the real answer here — Muralista is fully usable on its own by requirement —
    // but it now sits under a visible, disabled action. See `GatedAction.tsx`.
    hosted = false
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-unhosted').textContent).toMatch(/Chrome/)
    const button = screen.getByTestId('muralista-open') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('muralista-open-reason').textContent).toMatch(/desktop app/)
  })

  it('says the file is still the truth, and that Pregonero does not read what it writes', () => {
    // **The verbatim guard is what keeps rule 1 alive** now that Pregonero performs the write, so
    // the door says it rather than leaving it as a claim in a comment.
    render(<MuralistaDoor />)
    const said = screen.getByTestId('muralista-hosted').textContent ?? ''
    expect(said).toMatch(/without reading them/)
    expect(said).toMatch(/Muralista decides every byte/)
  })
})

