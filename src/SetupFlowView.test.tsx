/** @vitest-environment jsdom */
/**
 * The guided setup flow: six ordered steps, a forward button that greys, the escape hatch said out
 * loud, two doors on a song and only two, and step 0 named rather than hidden.
 *
 * Every assertion here is about **rendering** the readiness delta. The gig folder is mocked at the
 * platform seam, which is the one module that knows Electron exists.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
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

vi.mock('./platform', () => ({
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

describe('the six steps', () => {
  it('names all six, in order', async () => {
    await renderSetup()
    for (const step of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(`gig-step-${step}`)).toBeTruthy()
    }
    expect(screen.getByTestId('gig-step-1').textContent).toMatch(/1\. The songs/)
    expect(screen.getByTestId('gig-step-6').textContent).toMatch(/6\. Setup confirmed/)
  })

  it('puts you on the first step that is not done', async () => {
    await renderSetup()
    // The library reads, so step 1 is done; with no gig folder, step 2 is where the work is.
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/2\. The gig/),
      WAIT
    )
  })

  it('puts you at the end when everything is done', async () => {
    readyGig()
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/6\. Setup confirmed/),
      WAIT
    )
  })

  it('lets you look at any step, because the block is on moving on and not on reading', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /5\. Readiness at the venue/ }))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/5\./)
    expect(screen.getByTestId('setup-body-5')).toBeTruthy()
  })
})

describe('the forward button', () => {
  it('greys on a step that is not done, and says why', async () => {
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/2\./),
      WAIT
    )
    expect((screen.getByTestId('setup-forward') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('setup-blocked')).toBeTruthy()
  })

  it('is live on a step that is done', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    expect((screen.getByTestId('setup-forward') as HTMLButtonElement).disabled).toBe(false)
  })

  it('moves you on when it is live', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-forward'))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/2\./)
  })

  it('never blocks reading a half-built gig: every step and every song stays on the screen', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(
      folderRead({ gigPresent: true, gigText: gigJson(['duelo', 'vidas']) })
    )
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('gig-id').textContent).toBe(GIG_ID), WAIT)
    for (const step of [1, 2, 3, 4, 5, 6]) {
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
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/3\. Gig visuals/),
      WAIT
    )
    expect(screen.getByTestId('setup-escape-hatch').textContent).toMatch(
      /map the wall directly in Muralista and come back/
    )
  })

  it('names bombista on step 1 rather than Muralista', async () => {
    installLibrary([])
    await renderSetup()
    await waitFor(
      () => expect(screen.getByTestId('setup-step-title').textContent).toMatch(/1\./),
      WAIT
    )
    expect(screen.getByTestId('setup-escape-hatch').textContent).toMatch(/bombista/)
  })

  it('is silent on a step that is done', async () => {
    readyGig()
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /3\. Gig visuals/ }))
    })
    await waitFor(() => expect(screen.queryByTestId('setup-escape-hatch')).toBeNull(), WAIT)
  })
})

describe('two doors on a song, and only two', () => {
  it('offers exactly two buttons per song, and no third', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    const doors = screen.getByTestId('song-doors-duelo').querySelectorAll('.song-doors-buttons button')
    expect(doors).toHaveLength(2)
    expect([...doors].map((b) => b.textContent)).toEqual(['Modify the song', 'Modify its visuals'])
  })

  it('has no button to attach a timeline, link a video or set a tempo', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    const page = screen.getByTestId('setup-step-page')
    for (const forbidden of [/attach.*timeline/i, /link.*video/i, /set.*tempo/i, /import.*timeline/i]) {
      const hit = [...page.querySelectorAll('button')].find((b) => forbidden.test(b.textContent ?? ''))
      expect(hit).toBeUndefined()
    }
  })

  it('sends the song door to Bombista and the visuals door to Muralista', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-song'))
    })
    expect(screen.getByTestId('door-body-song').textContent).toMatch(/Bombista/)
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-visuals'))
    })
    expect(screen.getByTestId('door-body-visuals').textContent).toMatch(/Muralista/)
  })
})

describe('step 0 is named, not hidden', () => {
  it('names the LLM session as a step of the flow, outside the suite', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-song'))
    })
    const subflow = screen.getByTestId('song-subflow').textContent ?? ''
    expect(subflow).toMatch(/outside the suite/)
    expect(subflow).toMatch(/LLM session/)
    expect(subflow).toMatch(/no tool in the suite gets a language model/)
  })

  it('says at the entry that a song needs lyrics and audio', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    expect(screen.getByTestId('setup-body-1').textContent).toMatch(/needs lyrics and audio/)
  })

  it('walks new, the gap, align, review and tempo, validate', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1\. The songs/ }))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-doors-duelo-song'))
    })
    const phases = [...screen.getByTestId('song-subflow').querySelectorAll('li')]
    expect(phases).toHaveLength(5)
    expect(phases.map((p) => p.querySelector('.song-subflow-name')?.textContent)).toEqual([
      '1. New',
      '2. The words — outside the suite',
      '3. Align',
      '4. Review and tempo',
      '5. Validate',
    ])
  })
})

describe('the rig at the venue', () => {
  it('is a checklist and says it is not saved anywhere', async () => {
    await renderSetup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /5\. Readiness at the venue/ }))
    })
    const rig = screen.getByTestId('setup-rig')
    expect(rig.querySelectorAll('input[type="checkbox"]')).toHaveLength(4)
    expect(rig.textContent).toMatch(/Nothing here is saved/)
    expect(rig.textContent).toMatch(/gig\.json/)
  })
})

describe('step 6 shows the evidence', () => {
  it('puts the completeness results and the rig on the screen', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-body-6')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('setup-evidence').textContent).toMatch(/5\. Readiness at the venue/)
    expect(screen.getByTestId('setup-rig-6')).toBeTruthy()
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
    await waitFor(() => expect(screen.getByTestId('setup-body-6')).toBeTruthy(), WAIT)
    const page = screen.getByTestId('setup-step-page')
    const order = [...page.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid'))
    expect(order.indexOf('setup-evidence')).toBeLessThan(order.indexOf('setup-confirm'))
    expect(order.indexOf('setup-rig-6')).toBeLessThan(order.indexOf('setup-confirm'))
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
      fireEvent.click(screen.getByRole('button', { name: /6\. Setup confirmed/ }))
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

  it('review setup goes back to step 2 and re-reads the folder', async () => {
    readyGig()
    await renderSetup()
    await waitFor(() => expect(screen.getByTestId('setup-review')).toBeTruthy(), WAIT)
    const before = readGigFolder.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-review'))
    })
    expect(screen.getByTestId('setup-step-title').textContent).toMatch(/2\. The gig/)
    await waitFor(() => expect(readGigFolder.mock.calls.length).toBeGreaterThan(before), WAIT)
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
