/** @vitest-environment jsdom */
/**
 * **The gig flow's step 4: the check** (step 9.4, 2026-09-03). The last screen of the setup journey.
 *
 * What these defend:
 *
 * - **Not a form.** One line per thing that has to be true, each passing or failing, then one
 *   action that leaves. Nothing is typed here.
 * - **It reads `gigReadiness` and never re-decides.** Every line is bound to a structured field —
 *   a `StepStatus`, or `songs[].ready`. **No line is derived from a message**, which is the trap
 *   step 9 already fell into: a predicate matching `"could not be read"` against rendered prose,
 *   so `libertad`'s own wording blocked silently.
 * - **`Confirm setup` does one thing and lands on Backstage.** It used to read `Confirm setup and
 *   go to the control view`, wrong twice over: it named the stage as the destination and it
 *   performed the act that was separated from confirming. Choosing tonight's gig belongs to the
 *   gig row's play icon and the control view's first column.
 * - **A failed write keeps you here.** Navigating away would report success by arriving somewhere.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { installRequiredFolders } from './testSupport/folders'
import { installLibrary } from './testSupport/library'
import { dropLibraryCache, setLibraryEntries, type LibrarySong } from './setlistStore'

const readGigFolder = vi.fn()
const writeGigFile = vi.fn()
const readSongFileText = vi.fn()
const fileExists = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => false,
  canHostTools: () => false,
  runBombista: vi.fn(),
  bombistaVersion: vi.fn(),
  bombistaStagingDir: vi.fn(),
  openTool: vi.fn(),
  serveTool: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  chooseFolderPath: vi.fn(),
  hasGigFolderAccess: () => true,
  hasFolderPicker: () => true,
  fileExists: (...a: unknown[]) => fileExists(...a),
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: (...a: unknown[]) => writeGigFile(...a),
  createGigFolder: vi.fn(),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
}))

const App = (await import('./App')).default
const { rememberGigFolder, resetGigSession } = await import('./gigSession')

const GIGS_ROOT = '/vault/gigs'
const SONGS_ROOT = '/vault/songs'
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

function song(id: string, title: string): LibrarySong {
  return { id, title, items: [{ languages: { es: 'Hola', en: 'Hello' } }] } as LibrarySong
}

/** A room with a lyrics shape, which is what makes a lyrics-only song performable. */
function visualsJson(gigId = GIG_ID) {
  return JSON.stringify({
    visualsVersion: 1,
    gigId,
    shapes: [
      {
        id: 'lyrics',
        outline: [[0, 0], [1, 0], [1, 1], [0, 1]],
        corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
        layer: { type: 'song-lyrics' },
      },
    ],
    songVisuals: { defaults: { 'song-lyrics': ['lyrics'] }, songs: {} },
  })
}

function gigJson(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    gigVersion: 1,
    id: GIG_ID,
    date: '2026-05-16',
    venue: { name: 'BOM Festival', city: 'Brussels' },
    visuals: './visuals.json',
    songs: [{ id: 'duelo', title: 'Duelo', file: `${SONGS_ROOT}/song-performance/duelo.json` }],
    setlist: ['duelo'],
    ...over,
  })
}

/** Everything on disk and everything readable: the passing case. */
function everythingGood(over: { gigText?: string; visualsText?: string | null } = {}) {
  readGigFolder.mockResolvedValue({
    folderPath: FOLDER,
    gigText: over.gigText ?? gigJson(),
    gigError: null,
    gigPresent: true,
    visualsText: over.visualsText === undefined ? visualsJson() : over.visualsText,
    visualsError: null,
    visualsPresent: over.visualsText !== null,
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  installRequiredFolders(SONGS_ROOT, GIGS_ROOT)
  dropLibraryCache()
  vi.clearAllMocks()
  resetGigSession()
  fileExists.mockResolvedValue(true)
  writeGigFile.mockResolvedValue({ ok: true })
  readSongFileText.mockResolvedValue({
    ok: true,
    text: JSON.stringify({ title: 'Duelo', lyrics: [{ es: 'Hola', en: 'Hello' }] }),
  })
  installLibrary([song('duelo', 'Duelo')])
  everythingGood()
  rememberGigFolder(FOLDER)
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

async function goToCheck() {
  window.location.hash = '#/gig'
  await act(async () => {
    render(<App initialHash="#/gig" />)
  })
  await waitFor(() => expect(screen.getByTestId('gig-flow-step-4')).toBeTruthy(), WAIT)
  await act(async () => {
    fireEvent.click(screen.getByTestId('gig-flow-step-4'))
  })
  await waitFor(() => expect(screen.getByTestId('gig-flow-check')).toBeTruthy(), WAIT)
}

const verdict = (id: string) => screen.getByTestId(`gig-check-${id}-status`).textContent

describe('the check screen', () => {
  it('is one line per thing that has to be true, and asks for nothing', async () => {
    // **Not a form.** No input, no select, no textarea — the whole screen is verdicts and one press.
    await goToCheck()
    for (const id of ['gig', 'setlist', 'visuals', 'songs']) {
      expect(screen.getByTestId(`gig-check-${id}`)).toBeTruthy()
    }
    const list = screen.getByTestId('gig-check-list')
    expect(list.querySelectorAll('input, select, textarea').length).toBe(0)
  })

  it('says pass on every line when everything is on disk and readable', async () => {
    await goToCheck()
    await waitFor(() => expect(verdict('gig')).toBe('Pass'), WAIT)
    expect(verdict('setlist')).toBe('Pass')
    expect(verdict('visuals')).toBe('Pass')
    expect(verdict('songs')).toBe('Pass')
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(false)
  })

  it('fails the visuals line, and says which refusal it was', async () => {
    // **The mapping of a different room renders perfectly and reports nothing.** Copying last
    // month's gig folder to start the next one is how it happens.
    everythingGood({ visualsText: visualsJson('some-other-gig') })
    await goToCheck()
    await waitFor(() => expect(verdict('visuals')).toBe('Fails'), WAIT)
    expect(screen.getByTestId('gig-check-visuals-detail').textContent).toContain('different room')
    // The gate is readiness's: a refusal above stops the confirmation.
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('fails the visuals line when the room has never been mapped', async () => {
    everythingGood({ visualsText: null })
    await goToCheck()
    await waitFor(() => expect(verdict('visuals')).not.toBe('Pass'), WAIT)
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('fails the gig line when the night has no venue', async () => {
    everythingGood({ gigText: gigJson({ venue: {} }) })
    await goToCheck()
    await waitFor(() => expect(verdict('gig')).toBe('Not yet'), WAIT)
    expect(screen.getByTestId('gig-check-gig-detail').textContent).toContain('venue')
  })

  it('fails the setlist line when the gig has none', async () => {
    everythingGood({ gigText: gigJson({ songs: [], setlist: [] }) })
    await goToCheck()
    await waitFor(() => expect(verdict('setlist')).toBe('Not yet'), WAIT)
    expect(screen.getByTestId('gig-check-setlist-detail').textContent).toContain('no setlist')
  })

  /**
   * **The design's line and readiness's step disagree about what blocks, and the screen keeps
   * readiness's rule.** A song whose file will not read is a `note` on step 2, deliberately: a
   * step that can never complete while a known-broken song sits in the library is a guided path
   * nobody can walk. So the setlist line still passes, the note is shown as a note, and the SONG
   * line is what fails.
   */
  it('reports a song that will not read without blocking the setlist line', async () => {
    // The reference is in the setlist and the file behind it does not resolve — `libertad`'s live
    // shape, whose own wording is what the old substring predicate never mentioned.
    setLibraryEntries([
      { ref: { id: 'duelo', path: 'duelo.json' }, error: '20 timeline entries, 24 lyric lines' },
    ])
    await goToCheck()
    await waitFor(() => expect(verdict('songs')).toBe('Not yet'), WAIT)
    expect(screen.getByTestId('gig-check-songs-detail').textContent).toContain('24 lyric lines')
    expect(screen.getByTestId('gig-check-setlist-notes').textContent).toContain('24 lyric lines')
    // Reported, not blocking — readiness's own distinction, and the gate is unchanged.
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not call an empty setlist a passing song line', async () => {
    // `[].every()` answers true about nothing, which would print PASS over a gig with no songs.
    everythingGood({ gigText: gigJson({ songs: [], setlist: [] }) })
    await goToCheck()
    await waitFor(() => expect(verdict('songs')).toBe('Not yet'), WAIT)
  })
})

describe('confirming setup', () => {
  it('writes the confirmation and lands on Backstage, not the control view', async () => {
    // **Jorge, 2026-09-03.** Confirming asserts the checks passed; choosing tonight's gig is a
    // different act, owned by the gig row's play icon and the control view's first column.
    let written = ''
    writeGigFile.mockImplementation((_path: string, text: string) => {
      written = text
      readGigFolder.mockResolvedValue({
        folderPath: FOLDER,
        gigText: text,
        gigError: null,
        gigPresent: true,
        visualsText: visualsJson(),
        visualsError: null,
        visualsPresent: true,
      })
      return Promise.resolve({ ok: true })
    })
    await goToCheck()
    await waitFor(() => expect(verdict('gig')).toBe('Pass'), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-confirm'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/setup'), WAIT)
    expect(JSON.parse(written).setup.confirmedAt).toBeTruthy()
  })

  it('stays put when the write fails, in front of the problem', async () => {
    // Navigating away would report success by arriving somewhere — the defect this button was
    // fixed for once already.
    writeGigFile.mockResolvedValue({ ok: false, error: 'EROFS: read-only file system' })
    await goToCheck()
    await waitFor(() => expect(verdict('gig')).toBe('Pass'), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-confirm'))
    })
    expect(window.location.hash).toBe('#/gig')
    expect(screen.getByTestId('gig-flow-check')).toBeTruthy()
  })

  it('offers one action and nothing that saves a list', async () => {
    // **`Save to the gigs list` was proposed and rejected on truth**: gig.json is written at the
    // end of step 1, and since the gigs list became the folder the gig has been in that list ever
    // since. The button would save nothing and add something already there.
    await goToCheck()
    const buttons = [...screen.getByTestId('gig-flow-check').querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Confirm setup'])
    expect(screen.getByTestId('gig-flow-check').textContent).not.toMatch(/save to the gigs list/i)
    expect(screen.getByTestId('gig-flow-check').textContent).not.toMatch(/control view/i)
  })

  it('says setup can be made again, because a gig can be edited afterwards', async () => {
    everythingGood({
      gigText: gigJson({
        setup: { confirmedAt: '2026-05-01T10:00:00.000Z', against: { songs: {}, visuals: null, display: '' } },
      }),
    })
    await goToCheck()
    await waitFor(() => expect(screen.getByTestId('gig-flow-confirm')).toBeTruthy(), WAIT)
    // Either state is legitimate — what matters is that the press is still offered.
    expect(screen.getByTestId('gig-flow-confirm').textContent).toBe('Confirm setup again')
  })
})
