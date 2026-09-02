/** @vitest-environment jsdom */
/**
 * The guided setup flow: **four** ordered steps, a forward button that greys, the escape hatch said
 * out loud, two doors on a song and only two, and step 0 named rather than hidden.
 *
 * Every assertion here is about **rendering** the readiness delta. The gig folder is mocked at the
 * platform seam, which is the one module that knows Electron exists.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { installRequiredFolders } from './testSupport/folders'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import type { SongItem } from './songState'
import { dropLibraryCache, type LibrarySong } from './setlistStore'
import { installCatalogue, installLibrary } from './testSupport/library'

const readGigFolder = vi.fn()
const writeGigFile = vi.fn()
const createGigFolder = vi.fn()
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
  hasFolderPicker: () => true,
  chooseFolderPath: vi.fn(),
  chooseGigFolderPath: vi.fn(),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: (...a: unknown[]) => writeGigFile(...a),
  createGigFolder: (...a: unknown[]) => createGigFolder(...a),
  writeDebriefFile: vi.fn(),
  validateSongForPerformance: (...a: unknown[]) => validateSongForPerformance(...a),
  fileExists: (...a: unknown[]) => fileExists(...a),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
}))

const App = (await import('./App')).default
const { rememberGigFolder, resetGigSession } = await import('./gigSession')

const FOLDER = '/gigs/2026-09-12-bar-eduard'
const GIG_ID = '2026-09-12-bar-eduard'
const WAIT = { timeout: 3000 }

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

function visualsJson(defaults: Record<string, string[]>) {
  return JSON.stringify({
    visualsVersion: 1,
    gigId: GIG_ID,
    shapes: [{ id: 'lyr', name: 'Back wall', layer: { type: 'song-lyrics' } }],
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
  readSongFileText.mockImplementation((path: string) => {
    const id = String(path).split('/').pop()!.replace(/\.json$/, '')
    return Promise.resolve({
      ok: true,
      text: JSON.stringify({
        title: id.charAt(0).toUpperCase() + id.slice(1),
        lyrics: [{ es: 'Hola', en: 'Hello' }, { es: 'Mundo', en: 'World' }],
      }),
    })
  })
  installLibrary([song('duelo', 'Duelo'), song('vidas', 'Vidas')])
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

async function renderSetup() {
  await act(async () => {
    render(<App initialHash="#/gig" />)
  })
}

/** A gig where everything is set up — the state every "and now it is done" assertion needs. */
function readyGig() {
  rememberGigFolder(FOLDER)
  readGigFolder.mockResolvedValue(
    folderRead({
      gigPresent: true,
      gigText: gigJson(['duelo', 'vidas']),
      visualsPresent: true,
      visualsText: visualsJson({ 'song-lyrics': ['lyr'] }),
    })
  )
}

describe('the four steps', () => {
  it('names all four, in order, and there is no songs step in front of them', async () => {
    await renderSetup()
    for (const step of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`gig-step-${step}`)).toBeTruthy()
    }
    expect(screen.queryByTestId('gig-step-5')).toBeNull()
    expect(screen.queryByTestId('gig-step-6')).toBeNull()
    expect(screen.getByTestId('gig-step-1').textContent).toMatch(/1\. The gig/)
    expect(screen.getByTestId('gig-step-2').textContent).toMatch(/2\. The setlist/)
    expect(screen.getByTestId('gig-step-3').textContent).toMatch(/3\. Visuals/)
    expect(screen.getByTestId('gig-step-4').textContent).toMatch(/4\. Setup confirmed/)
  })

  /**
   * **The 2026-08-31 dead end, and where it is not.** The flow opened on "Prepare the songs" —
   * a library step, gated, whose escape hatch pointed at a terminal — because `currentStep`
   * returns the first step that is not complete. From nothing it now opens on the gig itself,
   * which is a step with an action on it.
   */
  it('opens on the gig from nothing, and never on a step about the songs', async () => {
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/1\. The gig/),
      WAIT
    )
    expect(screen.getByTestId('setup-step-page').textContent).not.toMatch(/in a terminal/)
  })

  it('asks for a name rather than a folder when there is no gig', async () => {
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-gig-name')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('setup-gig-lands').textContent).toMatch(/never pick a path/)
  })

  it('puts you at the end when everything is done', async () => {
    readyGig()
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/4\. Setup confirmed/),
      WAIT
    )
  })

  it('lets you look at any step, because the block is on moving on and not on reading', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Visuals/ }))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/3\./)
    expect(screen.getByTestId('setup-body-3')).toBeTruthy()
  })
})

describe('the forward button', () => {
  it('greys on a step that is not done, and says why', async () => {
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/1\./),
      WAIT
    )
    expect((screen.getByTestId('setup-forward') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('setup-blocked')).toBeTruthy()
  })

  it('is live on a step that is done', async () => {
    readyGig()
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/4\./),
      WAIT
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The gig/ }))
    })
    expect((screen.getByTestId('setup-forward') as HTMLButtonElement).disabled).toBe(false)
  })

  it('moves you on when it is live', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The gig/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-forward'))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/2\./)
  })

  /**
   * **The trap this round exists to not rebuild, seen from the screen.** `bombista` is unavailable
   * in this suite, so every song comes back `skipped` rather than `failed`; the assertion that
   * matters is the shape — a setlist step that is complete, with the songs listed, and a live
   * forward button.
   */
  it('is live on the setlist step with songs in it, whatever the songs need', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    expect((screen.getByTestId('setup-forward') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('setup-setlist-row-duelo')).toBeTruthy()
  })

  it('never blocks reading a half-built gig: every step and every song stays on the screen', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id').textContent).toBe(GIG_ID), WAIT)
    for (const step of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`gig-step-${step}`)).toBeTruthy()
    }
    expect(screen.getByTestId('gig-song-duelo')).toBeTruthy()
  })
})

describe('the escape hatch', () => {
  it('is said out loud on a blocked step, naming the tool that owns the work', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/3\. Visuals/),
      WAIT
    )
    expect(screen.getByTestId('setup-escape-hatch').textContent).toMatch(
      /map the wall directly in Muralista and come back/
    )
  })

  /**
   * **No step points at a terminal any more.** The hatch that did belonged to the songs step, and
   * the songs step is gone: song preparation is the song door's, on Setup home.
   */
  it('never sends anybody to a terminal, on any step', async () => {
    await renderSetup()
    for (const step of [1, 2, 3, 4]) {
      await act(async () => {
        fireEvent.click(screen.getByTestId(`gig-step-${step}`).querySelector('button')!)
      })
      const hatch = screen.queryByTestId('setup-escape-hatch')
      if (hatch) expect(hatch.textContent).not.toMatch(/terminal/i)
    }
  })

  it('is silent on a step that is done', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Visuals/ }))
    })
    await waitFor(() => expect(screen.queryByTestId('setup-escape-hatch')).toBeNull(), WAIT)
  })
})

/**
 * **Where the doors are now.** Step 1 of six was *The songs*, and it listed the whole library with
 * a pair of doors on every row. That step is gone: song preparation is gig-independent and lives on
 * Setup home, reachable without a gig at all. What is left inside the flow is step 3's optional
 * half — **the songs of this gig that deviate** — and each of those still gets the same two doors.
 */
describe('two doors on a song, and only two', () => {
  /** A gig whose room is mapped but carries no lyrics shape, so every song in it deviates. */
  function deviatingGig() {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: gigJson(['duelo', 'vidas']),
        visualsPresent: true,
        visualsText: visualsJson({}),
      })
    )
  }

  async function openVisuals() {
    deviatingGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Visuals/ }))
    })
    await waitFor(() => expect(screen.getByTestId('song-doors-duelo')).toBeTruthy(), WAIT)
  }

  it('offers exactly two buttons per song, and no third', async () => {
    await openVisuals()
    const doors = screen.getByTestId('song-doors-duelo').querySelectorAll('.song-doors-buttons button')
    expect(doors).toHaveLength(2)
    expect([...doors].map((b) => b.textContent)).toEqual(['Modify the song', 'Modify its visuals'])
  })

  it('has no button to attach a timeline, link a video or set a tempo', async () => {
    await openVisuals()
    const page = screen.getByTestId('setup-step-page')
    for (const forbidden of [/attach.*timeline/i, /link.*video/i, /set.*tempo/i, /import.*timeline/i]) {
      const hit = [...page.querySelectorAll('button')].find((b) => forbidden.test(b.textContent ?? ''))
      expect(hit).toBeUndefined()
    }
  })

  /**
   * **One component, two scopes** — the loose end from merging the old steps 3 and 4. The gig half
   * carries the room's door once; the song half's door only exists inside a song's row, and the
   * per-song sentence about reusing a shape must not appear at gig level, where there is no song.
   */
  it('puts the room door on the visuals step once, with no per-song prose in it', async () => {
    await openVisuals()
    expect(screen.getAllByTestId('gig-visuals-door')).toHaveLength(1)
    expect(screen.queryByTestId('door-body-visuals')).toBeNull()
    const gigDoor = screen.getByTestId('gig-visuals-door')
    expect(gigDoor.textContent).toMatch(/One setup serves every song/)
    expect(gigDoor.textContent).not.toMatch(/If no shape fits/)
    expect(gigDoor.textContent).not.toMatch(/step 3/i)
  })

  it('sends the song door to Bombista and the visuals door to Muralista', async () => {
    await openVisuals()
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-song'))
    })
    // **The song door leads to the song flow**, which is Bombista's own three pages inside
    // Pregonero's window (2026-09-02, step 6). It held a copy of the flow until then.
    expect(screen.getByTestId('door-song-open-duelo')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-visuals'))
    })
    expect(screen.getByTestId('door-body-visuals').textContent).toMatch(/Muralista/)
  })

  it('says nothing is to be done here when no song deviates, rather than listing them all', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Visuals/ }))
    })
    expect(screen.getByTestId('setup-no-deviating')).toBeTruthy()
    expect(screen.queryByTestId('song-doors-duelo')).toBeNull()
  })
})

describe('step 0 is named, not hidden', () => {
  async function openSongDoor() {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: gigJson(['duelo', 'vidas']),
        visualsPresent: true,
        visualsText: visualsJson({}),
      })
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Visuals/ }))
    })
    await waitFor(() => expect(screen.getByTestId('song-doors-duelo')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-song'))
    })
  }

  it('does not name Translations here, because the song flow does now', async () => {
    // **The note moved on 2026-09-02**, to the one line under the flow's own page. It lodged in
    // this door for three rounds only because the flow had no Pregonero surface to put it on, and
    // a second copy on a screen where no song is being made is the shape that drifts.
    await openSongDoor()
    expect(screen.queryByTestId('subflow-gap')).toBeNull()
    expect(screen.getByTestId('door-body-song').textContent).not.toMatch(/Translations/)
  })

  it('says in the door that a song needs lyrics and audio', async () => {
    await openSongDoor()
    expect(screen.getByTestId('door-body-song').textContent).toMatch(/needs lyrics and audio/)
  })

  it('is a checklist on the confirmation step, and says it is not saved anywhere', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-rig')).toBeTruthy(), WAIT)
    const rig = screen.getByTestId('setup-rig')
    expect(rig.querySelectorAll('input[type="checkbox"]')).toHaveLength(4)
    expect(rig.textContent).toMatch(/Nothing here is saved/)
    expect(rig.textContent).toMatch(/gig\.json/)
  })
})

describe('step 4 shows the evidence', () => {
  it('puts the completeness results and the rig on the screen', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-body-4')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('setup-evidence').textContent).toMatch(/3\. Visuals/)
    expect(screen.getByTestId('setup-rig')).toBeTruthy()
  })

  /**
   * *Readiness at the venue* is not a step any more — it discovered nothing and owned no work.
   * What was real about it is here: an instruction for a person standing in the room, with a way
   * back to the step that can act on what they see.
   */
  it('carries the recalibration instruction, and a way back to the visuals', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-recalibrate')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('setup-recalibrate').textContent).toMatch(/standing in the room/)
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-back-to-visuals'))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/3\. Visuals/)
  })

  it('says setup is not confirmed until someone confirms it', async () => {
    readyGig()
    await renderSetup()
    await waitFor(
      () =>
        expect(screen.getByTestId('setup-confirmation-state').textContent).toMatch(
          /has not been confirmed/
        ),
      WAIT
    )
  })
})

/**
 * **The confirmation is a milestone, not a lock.** It blocks nothing, arming an unconfirmed gig
 * warns rather than refuses, and the whole of its keep is that it can go stale and say what moved.
 */
describe('confirming setup', () => {
  function readGigWithSetup(setup: unknown, songs = ['duelo', 'vidas']) {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: JSON.stringify({
          gigVersion: 1,
          id: GIG_ID,
          date: '2026-09-12',
          venue: { name: 'Bar Eduard', city: 'Ghent' },
          visuals: './visuals.json',
          songs: songs.map((id) => ({ id, title: id, file: `${id}.json` })),
          setlist: songs,
          ...(setup === undefined ? {} : { setup }),
        }),
        visualsPresent: true,
        visualsText: visualsJson({ 'song-lyrics': ['lyr'] }),
      })
    )
  }

  it('confirms against evidence: the checks and the rig are above the button', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-body-4')).toBeTruthy(), WAIT)
    const page = screen.getByTestId('setup-step-page')
    const order = [...page.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid'))
    expect(order.indexOf('setup-evidence')).toBeLessThan(order.indexOf('setup-confirm'))
    expect(order.indexOf('setup-rig')).toBeLessThan(order.indexOf('setup-confirm'))
  })

  it('writes the confirmation into gig.json, with what it was confirmed against', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-confirm')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-confirm'))
    })
    await waitFor(() => expect(writeGigFile).toHaveBeenCalled(), WAIT)
    const calls = writeGigFile.mock.calls as [string, string][]
    const written = JSON.parse(calls[calls.length - 1]![1]) as {
      setup: { confirmedAt: string; against: { songs: Record<string, string>; visuals: string; display: string } }
    }
    expect(written.setup.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Object.keys(written.setup.against.songs).sort()).toEqual(['duelo', 'vidas'])
    expect(written.setup.against.visuals).toMatch(/^[0-9a-f]{8}$/)
    expect(written.setup.against.display).toBe('1728x1117@2*')
  })

  it('records no matrix, no layout and no pixel size — the recipe, not the cake', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-confirm')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-confirm'))
    })
    await waitFor(() => expect(writeGigFile).toHaveBeenCalled(), WAIT)
    const calls = writeGigFile.mock.calls as [string, string][]
    const text = calls[calls.length - 1]![1]
    for (const forbidden of ['matrix3d', 'corners', 'outline', 'fontSize', 'width', 'height']) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('will not confirm while the checks above do not pass', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /4\. Setup confirmed/ }))
    })
    expect((screen.getByTestId('setup-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('says the confirmation has lapsed, and which thing moved', async () => {
    readGigWithSetup({
      confirmedAt: '2026-09-12T19:04:11.000Z',
      against: { songs: { duelo: 'deadbeef', vidas: 'deadbeef' }, visuals: 'deadbeef', display: 'a laptop' },
    })
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-confirmation-lapsed')).toBeTruthy(), WAIT)
    const text = screen.getByTestId('setup-confirmation-lapsed').textContent ?? ''
    expect(text).toMatch(/lapsed/)
    expect(text).toMatch(/displays have changed/)
    expect(text).toMatch(/re-mapped/)
  })

  /**
   * Journey step 10: *select it, confirm, and land back on the control view.* The confirmation is
   * the exit; before this it wrote the confirmation and stayed, and reaching the stage was a
   * second, unnamed click on `Back`.
   */
  it('confirming lands back on the control view', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-confirm')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('setup-confirm').textContent).toMatch(/control view/)
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-confirm'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/'), WAIT)
  })

  /** A write that failed keeps you in front of the problem: arriving somewhere would report success. */
  it('stays on the confirmation step when the confirmation could not be written', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-confirm')).toBeTruthy(), WAIT)
    writeGigFile.mockResolvedValue({ ok: false, error: 'Read-only volume' })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-confirm'))
    })
    await waitFor(() => expect(writeGigFile).toHaveBeenCalled(), WAIT)
    expect(window.location.hash).not.toBe('#/')
    // Still on Setup, where the failure is reported — the flow reopens on the step that broke.
    expect(screen.getByTestId('setup-step-page')).toBeTruthy()
  })

  it('review setup goes back to the first step and re-reads the folder', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-review')).toBeTruthy(), WAIT)
    const before = readGigFolder.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-review'))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/1\. The gig/)
    await waitFor(() => expect(readGigFolder.mock.calls.length).toBeGreaterThan(before), WAIT)
  })
})

/**
 * **Journey step 8 and 9: `New gig`, and never a filesystem path.**
 *
 * The from-nothing walk arrives here with a gigs folder recorded by first run and nothing else.
 * What it must not meet is a directory picker.
 */
describe('making a gig, from the flow', () => {
  const GIGS_ROOT = '/vault/gigs'

  beforeEach(() => {
    localStorage.setItem('pregoneroGigsFolder', GIGS_ROOT)
    createGigFolder.mockResolvedValue({ ok: true, folderPath: `${GIGS_ROOT}/${GIG_ID}` })
  })

  it('says where the gig will land, and never asks for a path', async () => {
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-gig-name')).toBeTruthy(), WAIT)
    fireEvent.change(screen.getByTestId('setup-gig-name'), { target: { value: GIG_ID } })
    expect(screen.getByTestId('setup-gig-lands').textContent).toContain(`${GIGS_ROOT}/${GIG_ID}`)
  })

  it('makes the folder under the gigs root, from the name and nothing else', async () => {
    let onDisk: string | null = null
    writeGigFile.mockImplementation((_folder: string, text: string) => {
      onDisk = text
      return Promise.resolve({ ok: true })
    })
    readGigFolder.mockImplementation(() =>
      Promise.resolve(
        folderRead({
          folderPath: `${GIGS_ROOT}/${GIG_ID}`,
          gigPresent: onDisk !== null,
          gigText: onDisk,
        })
      )
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-gig-name')).toBeTruthy(), WAIT)
    fireEvent.change(screen.getByTestId('setup-gig-name'), { target: { value: GIG_ID } })
    fireEvent.change(screen.getByTestId('setup-gig-venue-input'), { target: { value: 'Bar Eduard' } })
    fireEvent.change(screen.getByTestId('setup-gig-date-input'), { target: { value: '2026-09-12' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-create-gig'))
    })
    await waitFor(() => expect(createGigFolder).toHaveBeenCalledWith(GIGS_ROOT, GIG_ID), WAIT)
    const calls = writeGigFile.mock.calls as [string, string][]
    const written = JSON.parse(calls[0]![1]) as { id: string; date: string; venue: { name: string } }
    expect(written.id).toBe(GIG_ID)
    expect(written.date).toBe('2026-09-12')
    expect(written.venue.name).toBe('Bar Eduard')
  })

  it('holds Create until it has a name, disabled with the reason — never absent', async () => {
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-create-gig')).toBeTruthy(), WAIT)
    expect((screen.getByTestId('setup-create-gig') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('setup-create-gig-reason').textContent).toMatch(/name/)
  })

  it('reports a refusal instead of pretending a gig was made', async () => {
    createGigFolder.mockResolvedValue({
      ok: false,
      error: 'There is already something called "2026-09-12-bar-eduard" in the gigs folder.',
    })
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-gig-name')).toBeTruthy(), WAIT)
    fireEvent.change(screen.getByTestId('setup-gig-name'), { target: { value: GIG_ID } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-create-gig'))
    })
    await waitFor(
      () => expect(screen.getByTestId('setup-create-gig-problem').textContent).toMatch(/already/),
      WAIT
    )
  })

  it('shows the gig’s name as fixed once it exists, and edits only venue and date', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The gig/ }))
    })
    expect(screen.getByTestId('setup-gig-name-fixed').textContent).toBe(GIG_ID)
    expect(screen.queryByTestId('setup-gig-name')).toBeNull()
    expect((screen.getByTestId('setup-gig-venue-input') as HTMLInputElement).value).toBe('Bar Eduard')
    expect((screen.getByTestId('setup-gig-date-input') as HTMLInputElement).value).toBe('2026-09-12')
  })
})

describe('step 2: the setlist, as two tables', () => {
  it('shows this gig on one side and the rest of the library on the other', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo']) })
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    expect(screen.getByTestId('setup-setlist-row-duelo')).toBeTruthy()
    expect(screen.getByTestId('setup-library-row-vidas')).toBeTruthy()
    // The one in the gig is not offered again on the library side.
    expect(screen.queryByTestId('setup-library-row-duelo')).toBeNull()
  })

  it('adds a song from the library and writes the running order', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo']) })
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    const before = writeGigFile.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-setlist-add-vidas'))
    })
    await waitFor(() => expect(screen.getByTestId('setup-setlist-row-vidas')).toBeTruthy(), WAIT)
    await waitFor(() => expect(writeGigFile.mock.calls.length).toBeGreaterThan(before), WAIT)
  })

  /**
   * **A song that disappears disappears from everywhere it is offered** (Jorge, 2026-09-01).
   *
   * This table is journey step 9.2 and the whole of *offered* on the walk: it says *you can use
   * this*. The table beside it is the opposite kind of list — what was **recorded** about a night —
   * and it keeps its ids and reports what it cannot resolve, because deleting a song must not
   * rewrite history.
   */
  it('does not offer a song whose file has left the catalogue', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo']) })
    )
    await installCatalogue([song('duelo', 'Duelo'), song('vidas', 'Vidas')], ['duelo.json'])
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    expect(screen.queryByTestId('setup-library-row-vidas')).toBeNull()
    // The one still in the folder is still on offer, so this is the filter and not an empty table.
    expect(screen.getByTestId('setup-setlist-row-duelo')).toBeTruthy()
  })

  it('keeps a vanished song in the running order it was already in', async () => {
    // **Recorded, not offered.** The gig's setlist is the record of a decision about a night: it
    // keeps its ids and reports what it cannot resolve, and deleting a song does not rewrite it.
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await installCatalogue([song('duelo', 'Duelo'), song('vidas', 'Vidas')], ['duelo.json'])
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    expect(screen.getByTestId('setup-setlist-row-vidas')).toBeTruthy()
  })

  it('says the setlist is empty rather than looking broken', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson([]) }))
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /2\. The setlist/ }))
    })
    expect(screen.getByTestId('setup-setlist-empty')).toBeTruthy()
  })
})

describe('arming an unconfirmed gig warns rather than refuses', () => {
  it('says setup is not confirmed on the control screen, and leaves Arm alone', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({
        gigPresent: true,
        gigText: gigJson(['duelo', 'vidas']),
        visualsPresent: true,
        visualsText: visualsJson({ 'song-lyrics': ['lyr'] }),
      })
    )
    await act(async () => {
      render(<App initialHash="#/" />)
    })
    await waitFor(
      () => expect(screen.getByTestId('arm-setup-warning').textContent).toMatch(/not been confirmed/),
      WAIT
    )
    expect(screen.getByTestId('arm-setup-warning').textContent).toMatch(/warning, not a gate/)
  })
})
