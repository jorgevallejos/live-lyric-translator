/** @vitest-environment jsdom */
/**
 * The two views of the readiness delta this stage ships: the report when a gig is opened, and the
 * hard gate at arm time. Both render `computeGigReadiness`; neither decides anything.
 *
 * The gig folder is mocked at the platform seam, which is the one module that knows Electron
 * exists — the same seam the real app goes through.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { installRequiredFolders } from './testSupport/folders'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import type { SongItem } from './songState'
import { dropLibraryCache, type LibrarySong } from './setlistStore'
import { installLibrary } from './testSupport/library'

const readGigFolder = vi.fn()
const writeGigFile = vi.fn()
const validateSongForPerformance = vi.fn()
const fileExists = vi.fn()
const readSongFileText = vi.fn()

const describeDisplays = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => false,
  canHostTools: () => false,
  runBombista: vi.fn(),
  bombistaVersion: vi.fn(),
  bombistaStagingDir: vi.fn(),
  openTool: vi.fn(),
  openBombistaReview: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  describeDisplays: (...a: unknown[]) => describeDisplays(...a),
  hasGigFolderAccess: () => true,
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: (...a: unknown[]) => writeGigFile(...a),
  validateSongForPerformance: (...a: unknown[]) => validateSongForPerformance(...a),
  fileExists: (...a: unknown[]) => fileExists(...a),
}))

const App = (await import('./App')).default
const { rememberGigFolder, resetGigSession } = await import('./gigSession')

const FOLDER = '/gigs/setup/k3f9x2abcd'
const GIG_ID = 'k3f9x2abcd'
const WAIT_TIMEOUT = 3000

const LINES: SongItem[] = [
  { languages: { es: 'Hola', en: 'Hello' } },
  { languages: { es: 'Mundo', en: 'World' } },
]

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

function song(id: string, title: string): LibrarySong {
  return { id, title, items: LINES } as LibrarySong
}

function gigJson(setlist: string[]) {
  return JSON.stringify({
    gigVersion: 1,
    id: GIG_ID,
    date: '2026-09-12',
    venue: { name: 'Bar Eduard', city: 'Ghent' },
    visuals: './visuals.json',
    songs: setlist.map((id) => ({ id, title: id, file: `${id}.json` })),
    setlist,
  })
}

function visualsJson(defaults: Record<string, string[]>, gigId = GIG_ID) {
  return JSON.stringify({
    visualsVersion: 1,
    gigId,
    shapes: [{ id: 'lyr', layer: { type: 'song-lyrics' } }],
    songVisuals: { defaults, songs: {} },
  })
}

function folderRead(overrides: Record<string, unknown> = {}) {
  return {
    folderPath: FOLDER,
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  installRequiredFolders()
  sessionStorage.clear()
  dropLibraryCache()
  vi.clearAllMocks()
  resetGigSession()
  writeGigFile.mockResolvedValue({ ok: true })
  validateSongForPerformance.mockResolvedValue({ status: 'skipped', reason: 'bombista is not on PATH' })
  fileExists.mockResolvedValue(true)
  describeDisplays.mockResolvedValue({ count: 1, displays: [], fingerprint: '1728x1117@2*' })
  // Adopting `gig.json`'s running order re-reads any song it points somewhere new.
  readSongFileText.mockImplementation((path: string) => {
    const id = String(path).split('/').pop()!.replace(/\.json$/, '')
    return Promise.resolve({
      ok: true,
      text: JSON.stringify({
        title: id.charAt(0).toUpperCase() + id.slice(1),
        lyrics: [
          { es: 'Hola', en: 'Hello' },
          { es: 'Mundo', en: 'World' },
        ],
      }),
    })
  })
  installLibrary([song('duelo', 'Duelo'), song('vidas', 'Vidas')])
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})


async function renderAt(hash: string) {
  await act(async () => {
    render(<App initialHash={hash} />)
  })
}

/**
 * **The shell's half of a test that used to cross the seam** (2026-09-06, the repo split).
 *
 * This file rendered `App` for the shell's hashes and `PlayerRoot` for the player's, through
 * `isPlayerRoute`. **The player is a different repository now**, so the gate cases moved to
 * Pregonero's `gigGate.test.tsx` and the gig report stayed here. Only `#/gig/steps` is rendered,
 * and it is the shell's own screen.
 *
 * **What no longer has a home is the journey between them** — open a gig here, arm it there. That
 * is a real cost of the split and is written down in the vault rather than left to be discovered.
 */

describe('the report when a gig is opened', () => {
  /**
   * **No folder question, and no gig made here either** (2026-09-02). Picking a folder went first;
   * `Import` went with the ruling that the tools own one `setup/` folder inside the gigs folder,
   * because it meant *point at a gig folder elsewhere* and there are none. Making a gig is the gig
   * flow's, at `#/gig`. **The three inverted assertions fail on the day any of them comes back.**
   */
  it('says there is no gig, and offers no way to make or import one', async () => {
    await renderAt('#/gig/steps')
    expect(screen.getByTestId('gig-none')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Choose gig folder' })).toBeNull()
    expect(screen.queryByTestId('setup-gig-name')).toBeNull()
    expect(screen.queryByTestId('gig-import')).toBeNull()
    expect(screen.getByTestId('gig-none').textContent).toMatch(/gig flow/)
  })

  it('names the gig and the folder once one is open', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderAt('#/gig/steps')
    await waitFor(() => expect(screen.getByTestId('gig-id').textContent).toBe(GIG_ID), {
      timeout: WAIT_TIMEOUT,
    })
    expect(screen.getByTestId('gig-folder').textContent).toBe(FOLDER)
  })

  it('reports a gig with no room mapped yet as not yet, not as broken', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderAt('#/gig/steps')
    await waitFor(
      () => expect(screen.getByTestId('gig-step-3').textContent).toMatch(/Not yet/),
      { timeout: WAIT_TIMEOUT }
    )
    expect(screen.queryByTestId('gig-refusals')).toBeNull()
    expect(screen.getByTestId('gig-step-3').textContent).toMatch(/Muralista/)
  })

  it('shows the refusal when the room belongs to a different gig', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: gigJson(['duelo', 'vidas']),
        visualsPresent: true,
        visualsText: visualsJson({ 'song-lyrics': ['lyr'] }, 'last-month'),
      })
    )
    await renderAt('#/gig/steps')
    await waitFor(
      () => expect(screen.getByTestId('gig-refusals').textContent).toMatch(/last-month/),
      { timeout: WAIT_TIMEOUT }
    )
  })

  it('says which songs cannot be armed', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: gigJson(['duelo', 'vidas']),
        visualsPresent: true,
        visualsText: visualsJson({}),
      })
    )
    await renderAt('#/gig/steps')
    await waitFor(
      () => expect(screen.getByTestId('gig-song-duelo').textContent).toMatch(/Cannot be armed/),
      { timeout: WAIT_TIMEOUT }
    )
  })

  it('says out loud that bombista did not run, as a missing check rather than a failed one', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderAt('#/gig/steps')
    await waitFor(
      () => expect(screen.getByTestId('gig-validation-skipped')).toBeTruthy(),
      { timeout: WAIT_TIMEOUT }
    )
  })

  it('re-checks on open rather than watching the folder', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson(['duelo']) }))
    await renderAt('#/gig/steps')
    await waitFor(() => expect(readGigFolder).toHaveBeenCalled(), { timeout: WAIT_TIMEOUT })
    const before = readGigFolder.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    })
    expect(readGigFolder.mock.calls.length).toBeGreaterThan(before)
  })
})
