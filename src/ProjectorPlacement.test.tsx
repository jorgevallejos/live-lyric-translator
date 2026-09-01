/** @vitest-environment jsdom */
/**
 * **Putting the projection window on the projector, and saying so when it cannot.**
 *
 * The placement itself is the main process's and is tested in `electron/projectorDisplay.test.ts`.
 * What matters here is the half that reaches a person: **the one-display fallback is visible**. A
 * projection window that quietly stayed on the laptop is otherwise discovered by looking at a
 * blank wall, at a venue, with people arriving.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup } from '@testing-library/react'
import type { SongItem } from './songState'
import type { LibrarySong } from './setlistStore'
import { installLibrary } from './testSupport/library'

const projectionPlacement = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: (...a: unknown[]) => projectionPlacement(...a),
  hasGigFolderAccess: () => true,
  hasFolderPicker: () => true,
  canRunBombista: () => false,
  canHostTools: () => false,
  runBombista: vi.fn(),
  bombistaVersion: vi.fn().mockResolvedValue({ present: false, version: null }),
  bombistaStagingDir: vi.fn(),
  openTool: vi.fn(),
  openBombistaReview: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  chooseFolderPath: vi.fn(),
  chooseGigFolderPath: vi.fn(),
  readGigFolder: vi.fn().mockResolvedValue({
    folderPath: null,
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  }),
  writeGigFile: vi.fn().mockResolvedValue({ ok: true }),
  writeDebriefFile: vi.fn(),
  validateSongForPerformance: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'none' }),
  fileExists: vi.fn().mockResolvedValue(true),
  readSongFileText: vi.fn(),
  describeDisplays: vi.fn().mockResolvedValue({ count: 0, displays: [], fingerprint: '' }),
}))

const App = (await import('./App')).default
const {
  setSongLines,
  setSongIndex,
  setBlank,
  setCurrentSongId,
  setProjectionLanguage,
  setSingingLanguage,
} = await import('./songState')

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

const LINES: SongItem[] = [{ languages: { es: 'Hola', en: 'Hello' } }]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  installLibrary([{ id: 'duelo', title: 'Duelo', items: LINES } as LibrarySong])
  sessionStorage.setItem('liveLyricLaunched', '1')
  setSongLines(LINES)
  setSongIndex(-1)
  setBlank(true)
  setCurrentSongId('duelo')
  setProjectionLanguage('en')
  setSingingLanguage('es')
  ;(window as unknown as { electronAPI?: unknown }).electronAPI = {
    isProjectionOpen: vi.fn().mockResolvedValue(true),
    onProjectionOpened: vi.fn(() => vi.fn()),
    onProjectionClosed: vi.fn(() => vi.fn()),
    openProjection: vi.fn().mockResolvedValue(undefined),
    closeProjection: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

describe('where the projection window went', () => {
  it('says it went to the second display', async () => {
    projectionPlacement.mockResolvedValue({ placed: true, reason: null, display: '1920x1080' })
    await act(async () => {
      render(<App initialHash="#/" />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('projection-placement').textContent).toMatch(
        /On the second display, 1920x1080\./
      )
    )
  })

  it('says out loud when there is only one display, rather than quietly staying put', async () => {
    projectionPlacement.mockResolvedValue({
      placed: false,
      reason: 'Only one display, so the projection window opens where it always did.',
      display: null,
    })
    await act(async () => {
      render(<App initialHash="#/" />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('projection-placement-fallback').textContent).toMatch(
        /Only one display.*Drag it across yourself\./s
      )
    )
  })

  it('says nothing at all when there is nothing to say — outside Electron', async () => {
    projectionPlacement.mockResolvedValue({ placed: false, reason: null, display: null })
    await act(async () => {
      render(<App initialHash="#/" />)
    })
    await waitFor(() => expect(screen.getByTestId('control-gig-value')).toBeTruthy())
    expect(screen.queryByTestId('projection-placement')).toBeNull()
    expect(screen.queryByTestId('projection-placement-fallback')).toBeNull()
  })
})
