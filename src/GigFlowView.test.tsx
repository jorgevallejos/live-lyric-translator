/** @vitest-environment jsdom */
/**
 * **The gig flow: four screens, a step bar, and one thing asked per screen** (journey-setup steps 8
 * and 9, 2026-09-02).
 *
 * What these defend, in the order the walk meets them:
 *
 * - **`New gig` never asks about the filesystem.** Not a picker, not a name field whose answer is a
 *   folder name. The date and the venue name the gig, and the screen shows the name it derived.
 * - **The tools own one `setup/` folder inside the gigs folder and touch nothing else.** A gig is
 *   `<gigs>/setup/<gig>/`, and nothing is created beside it.
 * - **Nothing is written until identity is complete**, so leaving during step 1 asks and discards
 *   and nothing was ever on disk — and once the file exists the gig is in a list, so leaving costs
 *   nothing and asks nothing. **No half-made thing is ever on disk without being in a list.**
 * - **The setlist screen is two lists**, the catalogue as Pregonero reads it and tonight's order,
 *   with a way across and a way up and down. Only songs Pregonero can read are offered.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { installRequiredFolders } from './testSupport/folders'
import { installCatalogue } from './testSupport/library'
import { dropLibraryCache, type LibrarySong } from './setlistStore'

const readGigFolder = vi.fn()
const writeGigFile = vi.fn()
const createGigFolder = vi.fn()
const chooseGigFolderPath = vi.fn()
const readSongFileText = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => false,
  canHostTools: () => false,
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
  writeDebriefFile: vi.fn(),
  chooseGigFolderPath: (...a: unknown[]) => chooseGigFolderPath(...a),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: (...a: unknown[]) => writeGigFile(...a),
  createGigFolder: (...a: unknown[]) => createGigFolder(...a),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
}))

const App = (await import('./App')).default
const { rememberGigFolder, resetGigSession } = await import('./gigSession')

const GIGS_ROOT = '/vault/gigs'
const GIG_ID = '2026-05-16-bom-festival'
/** **The gig's whole footprint on disk**, and the only thing the tools make in the gigs root. */
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
  return {
    id,
    title,
    items: [{ languages: { es: 'Hola', en: 'Hello' } }],
  } as LibrarySong
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

function gigJson(setlist: string[] = []) {
  return JSON.stringify({
    gigVersion: 1,
    id: GIG_ID,
    date: '2026-05-16',
    venue: { name: 'BOM Festival', city: 'Brussels' },
    visuals: './visuals.json',
    ...(setlist.length === 0
      ? {}
      : { songs: setlist.map((id) => ({ id, title: id, file: `${id}.json` })), setlist }),
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  installRequiredFolders('/vault/songs', GIGS_ROOT)
  dropLibraryCache()
  vi.clearAllMocks()
  resetGigSession()
  writeGigFile.mockResolvedValue({ ok: true })
  createGigFolder.mockResolvedValue({ ok: true, folderPath: FOLDER })
  readGigFolder.mockResolvedValue(folderRead())
  readSongFileText.mockResolvedValue({ ok: false, error: 'no file in a test' })
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

async function renderFlow() {
  await act(async () => {
    render(<App initialHash="#/gig" />)
  })
}

/** Fills screen 1 with a night that has a name. */
function sayWhatTheNightIs(date = '2026-05-16', venue = 'BOM Festival', city = 'Brussels') {
  fireEvent.change(screen.getByTestId('gig-flow-date'), { target: { value: date } })
  fireEvent.change(screen.getByTestId('gig-flow-venue'), { target: { value: venue } })
  fireEvent.change(screen.getByTestId('gig-flow-city'), { target: { value: city } })
}

/**
 * **The bar, and it is shaped like Bombista's on purpose**: the two flows in this app should read
 * as the same kind of thing, so the handoff to Muralista at step 3 stops feeling like a departure.
 */
describe('the step bar', () => {
  it('names four steps, in order', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-steps')).toBeTruthy(), WAIT)
    const bar = screen.getByTestId('gig-flow-steps').textContent ?? ''
    expect(bar).toMatch(/1\s*Gig/)
    expect(bar).toMatch(/2\s*Setlist/)
    expect(bar).toMatch(/3\s*Visuals/)
    expect(bar).toMatch(/4\s*Check/)
  })

  /**
   * **3 and 4 are later steps and are not controls.** A segment that opened an empty page would say
   * the step exists and does nothing, which is worse than one that says it is not here yet —
   * Bombista renders a step that did not happen the same way, and for the same reason.
   */
  it('shows visuals and check as later steps, not as pages you can open', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-steps')).toBeTruthy(), WAIT)
    for (const step of [3, 4]) {
      const seg = screen.getByTestId(`gig-flow-step-${step}`)
      expect(seg.getAttribute('data-state')).toBe('later')
      expect(seg.tagName).not.toBe('BUTTON')
    }
  })

  /**
   * **Not struck through** (Jorge, 2026-09-03). Strike-through is the mark for something CANCELLED,
   * and these two are not cancelled — they have not arrived. The walk read them as *dropped*, which
   * is the opposite of what the bar is trying to say. The treatment is the one step 2 already gets
   * before there is a gig: dimmed and not a control.
   */
  it('does not strike through the steps that are not built', () => {
    // Every rule that styles a later segment, wherever it declares it. jsdom computes no layout,
    // so the stylesheet is read as text — which is where a strike-through would be reintroduced.
    const css = readFileSync(resolve(__dirname, 'control.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector]) => /(^|,)\s*\.gig-step-later\s*$/m.test(selector!))
      .map(([, , body]) => body!)
    expect(blocks.length, 'no rule for .gig-step-later').toBeGreaterThan(0)
    for (const body of blocks) expect(body).not.toMatch(/text-decoration/)
    // The same colour the disabled segment gets, so the two shut states read as one thing.
    expect(blocks.join('\n')).toMatch(/color:\s*var\(--text-disabled\)/)
  })

  /** The word that carries the difference between *shut for now* and *not built at all*. */
  it('still says which steps are later', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-step-3')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('gig-flow-step-3').textContent).toMatch(/later/i)
  })

  it('holds the setlist step shut until there is a gig to write one into', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-step-2')).toBeTruthy(), WAIT)
    expect((screen.getByTestId('gig-flow-step-2') as HTMLButtonElement).disabled).toBe(true)
  })
})

/**
 * **Screen 1 is the only one that asks you to type, and it never asks where anything goes.**
 */
describe('screen 1: the gig', () => {
  it('asks for a date, a venue and a city, and for no path at all', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('gig-flow-date')).toBeTruthy()
    expect(screen.getByTestId('gig-flow-venue')).toBeTruthy()
    expect(screen.getByTestId('gig-flow-city')).toBeTruthy()
    // The two shapes the folder question has taken: a picker, and a name field whose answer is a
    // folder name. Neither is here, and this fails on the day either comes back.
    expect(screen.queryByTestId('setup-gig-name')).toBeNull()
    expect(screen.getByTestId('gig-flow-screen-1').textContent).not.toMatch(/Choose|folder…/)
    expect(chooseGigFolderPath).not.toHaveBeenCalled()
  })

  /**
   * **The derived name is shown, because it is what appears on Backstage and what names the
   * folder.** A name derived and hidden is a name you meet for the first time in Finder.
   */
  it('derives the identity from the date and the venue, and shows it', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy(), WAIT)
    expect(screen.getByTestId('gig-flow-identity-pending')).toBeTruthy()
    sayWhatTheNightIs()
    expect(screen.getByTestId('gig-flow-identity-name').textContent).toBe(GIG_ID)
  })

  it('holds Create until the gig has a name', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-commit')).toBeTruthy(), WAIT)
    expect((screen.getByTestId('gig-flow-commit') as HTMLButtonElement).disabled).toBe(true)
    sayWhatTheNightIs()
    expect((screen.getByTestId('gig-flow-commit') as HTMLButtonElement).disabled).toBe(false)
  })

  /**
   * **The whole of the 2026-09-02 ruling, asserted:** the gigs root goes to the platform seam,
   * which joins `setup/` on to it, and the gig is a directory inside that and nowhere else.
   */
  it('makes the gig inside the one setup folder, and nothing beside it', async () => {
    let onDisk: string | null = null
    writeGigFile.mockImplementation((_folder: string, text: string) => {
      onDisk = text
      return Promise.resolve({ ok: true })
    })
    readGigFolder.mockImplementation(() =>
      Promise.resolve(folderRead({ gigPresent: onDisk !== null, gigText: onDisk }))
    )
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-commit')).toBeTruthy(), WAIT)
    sayWhatTheNightIs()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-commit'))
    })
    await waitFor(() => expect(createGigFolder).toHaveBeenCalled(), WAIT)
    expect(createGigFolder).toHaveBeenCalledWith(GIGS_ROOT, GIG_ID)
    const written = JSON.parse((writeGigFile.mock.calls as [string, string][])[0]![1]) as {
      id: string
      date: string
      venue: { name: string; city: string }
    }
    expect(written.id).toBe(GIG_ID)
    expect(written.date).toBe('2026-05-16')
    expect(written.venue).toEqual({ name: 'BOM Festival', city: 'Brussels' })
  })

  /**
   * **The walk's own path, end to end, and it is the one nothing covered.** Every test below
   * reaches screen 2 by opening a gig with a store that already holds a setlist — a fixture, not
   * something the product makes. From nothing, `Create the gig` and then `Add →` was never walked
   * in a test, and on 2026-09-03 it was walked by a person and did nothing at all.
   *
   * **`Add →` writes into the ACTIVE setlist, and until this the flow never created one.** So the
   * store's `activeSetlistId` was `''`, `addSongToSetlist('', …)` refused, and the running order
   * stayed empty with no refusal anywhere to see. This test starts with a catalogue and **no
   * setlist**, which is what a machine that has never made one actually looks like.
   */
  it('adds a song to the order on the gig it just created, from a store with no setlist', async () => {
    let onDisk: string | null = null
    writeGigFile.mockImplementation((_folder: string, text: string) => {
      onDisk = text
      return Promise.resolve({ ok: true })
    })
    readGigFolder.mockImplementation(() =>
      Promise.resolve(folderRead({ gigPresent: onDisk !== null, gigText: onDisk }))
    )
    await installCatalogue([song('duelo', 'Duelo')], ['duelo.json'], [])
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-commit')).toBeTruthy(), WAIT)
    sayWhatTheNightIs()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-commit'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-catalogue-duelo')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-add-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-order-duelo')).toBeTruthy(), WAIT)
    await waitFor(() => {
      const written = writeGigFile.mock.calls.map((c) => String((c as unknown[])[1]))
      expect(written.some((t) => t.includes('"setlist"') && t.includes('duelo'))).toBe(true)
    }, WAIT)
  })

  it('moves on to the setlist once the gig is on disk', async () => {
    let onDisk: string | null = null
    writeGigFile.mockImplementation((_folder: string, text: string) => {
      onDisk = text
      return Promise.resolve({ ok: true })
    })
    readGigFolder.mockImplementation(() =>
      Promise.resolve(folderRead({ gigPresent: onDisk !== null, gigText: onDisk }))
    )
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-commit')).toBeTruthy(), WAIT)
    sayWhatTheNightIs()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-commit'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-2')).toBeTruthy(), WAIT)
  })

  /**
   * **A failed write keeps you in front of the problem.** Navigating away would report success by
   * arriving somewhere, which is the defect `Confirm setup` was fixed for on the same walk.
   */
  it('says a refusal instead of pretending a gig was made', async () => {
    createGigFolder.mockResolvedValue({
      ok: false,
      error: `There is already a gig called "${GIG_ID}".`,
    })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-commit')).toBeTruthy(), WAIT)
    sayWhatTheNightIs()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-commit'))
    })
    await waitFor(
      () => expect(screen.getByTestId('gig-flow-problem').textContent).toMatch(/already a gig/),
      WAIT
    )
    expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy()
  })

  it('prefills from the gig when one is already open, and fixes its name', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson() }))
    await renderFlow()
    await waitFor(
      () => expect((screen.getByTestId('gig-flow-venue') as HTMLInputElement).value).toBe('BOM Festival'),
      WAIT
    )
    expect((screen.getByTestId('gig-flow-date') as HTMLInputElement).value).toBe('2026-05-16')
    expect((screen.getByTestId('gig-flow-city') as HTMLInputElement).value).toBe('Brussels')
    // The id is born with the folder and never rewritten — `visuals.json` is checked against it.
    expect(screen.getByTestId('gig-flow-identity-name').textContent).toBe(GIG_ID)
    fireEvent.change(screen.getByTestId('gig-flow-venue'), { target: { value: 'Somewhere else' } })
    expect(screen.getByTestId('gig-flow-identity-name').textContent).toBe(GIG_ID)
  })
})

/**
 * **When the file is written, and what `Back` does about it** (Jorge, 2026-09-02).
 *
 * Nothing is written until identity is complete at the end of step 1, so leaving during step 1 asks
 * and discards and nothing was ever on disk. Once `gig.json` exists the gig is on Backstage,
 * incomplete and honest, so leaving after that costs nothing and asks nothing. **No half-made thing
 * is ever on disk without being in a list** — that shape produced a phantom popup on the same day.
 */
describe('leaving the gig flow', () => {
  it('creates nothing at all while the gig has no name', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy(), WAIT)
    fireEvent.change(screen.getByTestId('gig-flow-venue'), { target: { value: 'BOM Festival' } })
    fireEvent.click(screen.getByTestId('gig-flow-leave'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-leave-confirm'))
    })
    expect(createGigFolder).not.toHaveBeenCalled()
    expect(writeGigFile).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/setup')
  })

  it('asks, names what goes, and offers to stay', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy(), WAIT)
    sayWhatTheNightIs()
    fireEvent.click(screen.getByTestId('gig-flow-leave'))
    expect(screen.getByTestId('gig-flow-leave-title').textContent).toBe('Leave without saving?')
    expect(screen.getByTestId('gig-flow-leave-what').textContent).toContain(
      'This gig has not been created.'
    )
    expect(screen.getByTestId('gig-flow-leave-what').textContent).toContain(
      'What you have typed here will be lost.'
    )
    fireEvent.click(screen.getByTestId('gig-flow-leave-stay'))
    expect(screen.queryByTestId('gig-flow-leave-popup')).toBeNull()
    // Still here, and the fields with it: `Stay` is not a re-entry.
    expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy()
    expect((screen.getByTestId('gig-flow-venue') as HTMLInputElement).value).toBe('BOM Festival')
    expect(window.location.hash).not.toBe('#/setup')
  })

  it('does not ask when nothing has been typed', async () => {
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-1')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-leave'))
    })
    expect(screen.queryByTestId('gig-flow-leave-popup')).toBeNull()
    expect(window.location.hash).toBe('#/setup')
  })

  /**
   * **Once the file exists, leaving costs nothing.** The gig is on Backstage, incomplete and
   * honest, so there is nothing to consent to and nothing to warn about.
   */
  it('asks nothing once the gig is on disk and unchanged', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson() }))
    await renderFlow()
    await waitFor(
      () => expect((screen.getByTestId('gig-flow-venue') as HTMLInputElement).value).toBe('BOM Festival'),
      WAIT
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-leave'))
    })
    expect(screen.queryByTestId('gig-flow-leave-popup')).toBeNull()
    expect(window.location.hash).toBe('#/setup')
  })

  it('asks about an edit that has not been saved, and says so in its own words', async () => {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson() }))
    await renderFlow()
    await waitFor(
      () => expect((screen.getByTestId('gig-flow-venue') as HTMLInputElement).value).toBe('BOM Festival'),
      WAIT
    )
    fireEvent.change(screen.getByTestId('gig-flow-city'), { target: { value: 'Antwerp' } })
    fireEvent.click(screen.getByTestId('gig-flow-leave'))
    expect(screen.getByTestId('gig-flow-leave-what').textContent).toContain(
      'The changes to this gig have not been saved.'
    )
  })
})

/**
 * **Screen 2: the setlist, as two lists.** The catalogue on the left, tonight's running order on
 * the right — the direction the songs travel, which is what `Add →` and `←` read against.
 */
describe('screen 2: the setlist', () => {
  async function openAtSetlist(songs: readonly LibrarySong[], inFolder: readonly string[]) {
    rememberGigFolder(FOLDER)
    readGigFolder.mockResolvedValue(folderRead({ gigPresent: true, gigText: gigJson() }))
    await installCatalogue(songs, [...inFolder], [{ id: 'default-setlist', name: 'Default', songIds: [] }])
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('gig-flow-step-2')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-step-2'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-screen-2')).toBeTruthy(), WAIT)
  }

  it('is the catalogue and the running order, side by side', async () => {
    await openAtSetlist([song('duelo', 'Duelo'), song('vidas', 'Vidas')], ['duelo.json', 'vidas.json'])
    expect(screen.getByTestId('gig-flow-catalogue').textContent).toContain('Duelo')
    expect(screen.getByTestId('gig-flow-catalogue').textContent).toContain('Vidas')
    expect(screen.getByTestId('gig-flow-order-empty')).toBeTruthy()
  })

  /**
   * **The right-hand list is the gig's, not tonight's** (Jorge, 2026-09-03). A gig is set up weeks
   * ahead: on 03/09 this screen said *TONIGHT, IN ORDER* about a gig on 23/10. **`Tonight` is the
   * performance view's word**, it is needed there, and a setup screen borrowing it makes the one
   * screen that means it mean less.
   */
  it('names the gig’s setlist, and never says tonight', async () => {
    await openAtSetlist([song('duelo', 'Duelo')], ['duelo.json'])
    const order = screen.getByTestId('gig-flow-order')
    expect(order.textContent).toMatch(/setlist/i)
    expect(screen.getByTestId('gig-flow-screen-2').textContent).not.toMatch(/tonight/i)
  })

  /**
   * **The footer about visuals and the check is gone, and so is the door it held open.**
   *
   * It named `#/gig/steps` — the screen this flow exists to replace — on the screen that replaces
   * it. **The consequence was stated before it was accepted:** that link was the only route left to
   * Muralista and to `Confirm setup`, so steps 10 to 12 are unreachable from the flow until 9.3 and
   * 9.4 are built. `GigView` is still in the code and still works; nothing leads to it from here.
   */
  it('does not offer the old setup screen, or announce what is not built', async () => {
    await openAtSetlist([song('duelo', 'Duelo')], ['duelo.json'])
    expect(screen.queryByTestId('gig-flow-later')).toBeNull()
    expect(screen.queryByTestId('gig-flow-old-setup')).toBeNull()
    expect(screen.getByTestId('gig-flow-screen-2').textContent).not.toMatch(/not built yet/i)
  })

  it('says a gig with no setlist is not a gig, rather than looking broken', async () => {
    await openAtSetlist([song('duelo', 'Duelo')], ['duelo.json'])
    expect(screen.getByTestId('gig-flow-order-empty').textContent).toMatch(/not a gig/)
  })

  it('moves a song across, and writes the running order', async () => {
    await openAtSetlist([song('duelo', 'Duelo'), song('vidas', 'Vidas')], ['duelo.json', 'vidas.json'])
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-add-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-order-duelo')).toBeTruthy(), WAIT)
    // A song in the order is not offered again on the left: the two lists are one decision.
    expect(screen.queryByTestId('gig-flow-catalogue-duelo')).toBeNull()
    await waitFor(() => {
      const written = writeGigFile.mock.calls.map((c) => String((c as unknown[])[1]))
      expect(written.some((t) => t.includes('"setlist"') && t.includes('duelo'))).toBe(true)
    }, WAIT)
  })

  it('moves a song up and down within the order', async () => {
    await openAtSetlist([song('duelo', 'Duelo'), song('vidas', 'Vidas')], ['duelo.json', 'vidas.json'])
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-add-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-add-vidas'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-order-vidas')).toBeTruthy(), WAIT)
    const before = screen.getByTestId('gig-flow-order').textContent ?? ''
    expect(before.indexOf('Duelo')).toBeLessThan(before.indexOf('Vidas'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-up-vidas'))
    })
    await waitFor(() => {
      const after = screen.getByTestId('gig-flow-order').textContent ?? ''
      expect(after.indexOf('Vidas')).toBeLessThan(after.indexOf('Duelo'))
    }, WAIT)
  })

  it('takes a song back out of the order', async () => {
    await openAtSetlist([song('duelo', 'Duelo')], ['duelo.json'])
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-add-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-order-duelo')).toBeTruthy(), WAIT)
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-remove-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('gig-flow-catalogue-duelo')).toBeTruthy(), WAIT)
  })

  /**
   * **Only songs Pregonero can read appear.** This list says *you can use this*, and a song whose
   * file has left the folder cannot be used. It is not hidden from what is **recorded**: a gig's
   * setlist keeps its ids and reports what it cannot resolve, because that is the record of a
   * decision about a night.
   */
  it('does not offer a song whose file has left the catalogue', async () => {
    await openAtSetlist([song('duelo', 'Duelo'), song('gone', 'Gone')], ['duelo.json'])
    expect(screen.getByTestId('gig-flow-catalogue-duelo')).toBeTruthy()
    expect(screen.queryByTestId('gig-flow-catalogue-gone')).toBeNull()
  })
})
