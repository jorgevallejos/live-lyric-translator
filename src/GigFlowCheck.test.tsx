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

/** A room that also carries a video shape, so the media half of the content check actually runs. */
function visualsWithVideo(gigId = GIG_ID) {
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
      {
        id: 'frame',
        outline: [[0, 0], [1, 0], [1, 1], [0, 1]],
        corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
        layer: { type: 'song-video' },
      },
    ],
    songVisuals: {
      defaults: { 'song-lyrics': ['lyrics'], 'song-video': ['frame'] },
      songs: {},
      // **What the song puts in the video shape**, since *the song holds no media*: the name lives
      // here, assigned in Muralista, and the song carries words and timing only.
      assets: { duelo: { frame: 'duelo.mp4' } },
    },
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
    for (const id of ['gig', 'setlist', 'files', 'media', 'visuals', 'belongs', 'songs']) {
      expect(screen.getByTestId(`gig-check-${id}`)).toBeTruthy()
    }
    const list = screen.getByTestId('gig-check-list')
    expect(list.querySelectorAll('input, select, textarea').length).toBe(0)
  })

  it('says pass on every line when everything is on disk and readable', async () => {
    await goToCheck()
    await waitFor(() => expect(verdict('gig')).toBe('Pass'), WAIT)
    for (const id of ['setlist', 'files', 'media', 'visuals', 'belongs', 'songs']) {
      expect(`${id}:${verdict(id)}`).toBe(`${id}:Pass`)
    }
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(false)
  })

  /**
   * **The two visuals questions are two lines since 2026-09-03**, because the design named them
   * separately and `visualsRefusal` is what tells them apart. Sharing one line meant *this is
   * another room's mapping* and *this file will not parse* read identically.
   */
  it('fails the belongs line, not the mapped line, for another gig’s room', async () => {
    // **A mapping of a different room renders perfectly and reports nothing.** Copying last
    // month's gig folder to start the next one is how it happens.
    everythingGood({ visualsText: visualsJson('some-other-gig') })
    await goToCheck()
    await waitFor(() => expect(verdict('belongs')).toBe('Fails'), WAIT)
    expect(screen.getByTestId('gig-check-belongs-detail').textContent).toContain('different room')
    // The gate is readiness's: a refusal above stops the confirmation.
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  it('fails the mapped line, not the belongs line, for a file that will not parse', async () => {
    everythingGood({ visualsText: '{ not json' })
    await goToCheck()
    await waitFor(() => expect(verdict('visuals')).toBe('Fails'), WAIT)
    // Not another room's mapping — there is no room at all, so the second line has nothing to
    // answer about rather than a verdict to give.
    expect(verdict('belongs')).toBe('Not yet')
  })

  it('fails both visuals lines honestly when the room has never been mapped', async () => {
    everythingGood({ visualsText: null })
    await goToCheck()
    await waitFor(() => expect(verdict('visuals')).not.toBe('Pass'), WAIT)
    // **Never PASS on a mapping that is not there.** A line claiming the absent room belongs to
    // this gig is the class of false answer this project has a rule about.
    expect(verdict('belongs')).toBe('Not yet')
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true)
  })

  /**
   * **`Confirm setup` STAYS STRICT ABOUT THE VISUALS, AND THAT IS A RULING** (Jorge, 2026-09-04,
   * asked for by name on the `v0.53.0` walk). A gig with no visuals has no shape for the lyrics to
   * land in, so nothing reaches the wall — the strictness is what stops a gig being confirmed into
   * a dark room. **What makes it painless is that Muralista's default satisfies it**, and since
   * that tool's `v1.11.0` the default is simply what is there when you arrive at the shapes: the
   * cost of clearing this line is pressing `Save to gig`.
   *
   * Pinned as its own test because the temptation on a walk that hits it is to soften the gate,
   * and the answer is that the gate is right and the cost was the thing that moved.
   */
  it('refuses the confirmation over a missing room, and the refusal is on screen', async () => {
    everythingGood({ visualsText: null })
    await goToCheck()
    await waitFor(
      () => expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true),
      WAIT
    )
    // A red line beside a live button needs a sentence; a shut button needs one more.
    expect(screen.getByTestId('gig-check-blocked')).toBeTruthy()
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
   * **A note at step 2 and a failure at step 4** (Jorge, 2026-09-03), and the two are not in
   * conflict: *a problem you can still route around while composing becomes a blocker at the
   * moment you assert readiness.* At step 2 such a song cannot be repaired from inside the flow —
   * Bombista cannot take a file it will not parse — so blocking there would make a guided path
   * nobody can finish. Here you are asserting the gig is ready, and it is not.
   *
   * **Shipped unreconciled in `v0.47.0` and reported; this is the reconciliation.**
   */
  it('fails the file line and blocks the confirmation, while step 2 keeps its note', async () => {
    // The reference is in the setlist and the file behind it does not resolve — `libertad`'s live
    // shape, whose own wording is what the old substring predicate never mentioned.
    setLibraryEntries([
      { ref: { id: 'duelo', path: 'duelo.json' }, error: '20 timeline entries, 24 lyric lines' },
    ])
    await goToCheck()
    await waitFor(() => expect(verdict('files')).toBe('Not yet'), WAIT)
    expect(screen.getByTestId('gig-check-files-detail').textContent).toContain('24 lyric lines')
    // Step 2 is unchanged: still complete, still carrying it as a note.
    expect(verdict('setlist')).toBe('Pass')
    expect(screen.getByTestId('gig-check-setlist-notes').textContent).toContain('24 lyric lines')
    // And the confirmation is blocked, which is what the ruling changed.
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('gig-check-blocked')).toBeTruthy()
  })

  /**
   * **The design's second check, on its own line.** It used to be indistinguishable from the
   * first: both lived in `songs[].missing` prose, so a screen drawing them apart had to match a
   * substring — the trap step 9 already fell into.
   */
  it('fails the media line while the file line passes, when a named file is not there', async () => {
    everythingGood({ visualsText: visualsWithVideo() })
    setLibraryEntries([
      {
        ref: { id: 'duelo', path: 'duelo.json' },
        song: {
          id: 'duelo',
          title: 'Duelo',
          items: [{ languages: { es: 'Hola' } }],
          timeline: [{ start: 0, end: 1 }],
        } as unknown as LibrarySong,
      },
    ])
    // **The name resolves and the file is not there**, which is what this line is about. Since the
    // visuals folder became a first-run answer (2026-09-04) every name resolves against it, so
    // *not there* has to be said by the disk rather than by there being nowhere to look.
    fileExists.mockImplementation((path: string) => Promise.resolve(!path.endsWith('duelo.mp4')))
    await goToCheck()
    await waitFor(() => expect(verdict('media')).toBe('Not yet'), WAIT)
    expect(screen.getByTestId('gig-check-media-detail').textContent).toContain('duelo.mp4')
    // The song's own file read perfectly. That is the point of the split.
    expect(verdict('files')).toBe('Pass')
    // **Reported, not blocking**: the ruling widened the gate for the unreadable file and named
    // nothing else. **The sentence that used to say so is gone** (Jorge, 2026-09-04): the muted
    // `NOT YET` says it now, which is what it is for, and a paragraph explaining a state that reads
    // correctly is the prose rule again. The behaviour it described is what this asserts.
    expect((screen.getByTestId('gig-flow-confirm') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('gig-check-reported')).toBeNull()
  })

  it('does not call an empty setlist a passing song line', async () => {
    // `[].every()` answers true about nothing, which would print PASS over a gig with no songs.
    everythingGood({ gigText: gigJson({ songs: [], setlist: [] }) })
    await goToCheck()
    await waitFor(() => expect(verdict('songs')).toBe('Not yet'), WAIT)
    expect(verdict('files')).toBe('Not yet')
    expect(verdict('media')).toBe('Not yet')
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
    expect(buttons.map((b) => b.textContent)).toEqual(['Sign off the gig'])
    expect(screen.getByTestId('gig-flow-check').textContent).not.toMatch(/save to the gigs list/i)
    expect(screen.getByTestId('gig-flow-check').textContent).not.toMatch(/control view/i)
  })

  /**
   * **ONE WORD, IN THE TWO PLACES IT MUST APPEAR** (Jorge, 2026-09-04): the noun in the bar and the
   * verb on the button. *Check*, *confirm*, *validate* and *complete* all went — **two near-synonyms
   * on one screen is what made it unreadable**, and a test is the only thing that keeps a fifth
   * from arriving one convenient sentence at a time.
   *
   * `checked against the files` survives on the lede, and deliberately: that line is not a name for
   * the act, it is what the machine did, and Jorge quoted it approvingly on the walk.
   */
  /**
   * **THE SIGN-OFF RE-READS THE FOLDER ON ARRIVAL** (the `v0.54.0` blocker). The screen's own copy
   * said *coming back here re-checks the files* and the flow never re-read: `refreshGigReadiness`
   * ran once, on mount, and Muralista wrote `visuals.json` in a frame afterwards. **The screen was
   * lying about its own behaviour** — the worst of the two classes this repo names, because a false
   * answer is indistinguishable from a true one.
   */
  it('re-reads the gig folder on arrival, whichever way you came', async () => {
    everythingGood()
    await goToCheck()
    const after = readGigFolder.mock.calls.length
    // Leave and come back by the bar. Nothing else changes; the folder is read again anyway.
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-step-2'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-flow-step-4'))
    })
    await waitFor(() => expect(readGigFolder.mock.calls.length).toBeGreaterThan(after), WAIT)
  })

  /**
   * **A4: THE SENTENCE THAT MAKES THE WORD MEAN SOMETHING** (Jorge, 2026-09-04). Everything below
   * was checked by the machine; the wall is the part only Jorge can check. **That is why `sign-off`
   * is not a synonym for `confirm`** — without it the word floats. Pinned, because it is one line
   * of prose on a screen this project keeps cutting prose from, and it is the load-bearing one.
   */
  it('keeps the one sentence the word depends on, and drops the instruction', async () => {
    everythingGood()
    await goToCheck()
    const text = screen.getByTestId('gig-flow-check').textContent ?? ''
    expect(text).toContain('Only you can check it against the wall')
    expect(text).not.toContain('standing in the room')
    // And the two lines that explained the state are gone; the state says it itself.
    expect(text).not.toContain('Arming warns about that')
    expect(text).not.toContain('do not stop the gig being signed off')
  })

  it('carries no second word for the act it is named after', async () => {
    everythingGood()
    await goToCheck()
    const text = screen.getByTestId('gig-flow-check').textContent ?? ''
    for (const word of [/\bconfirm/i, /\bvalidat/i, /\bcomplete/i]) {
      expect(`${word}:${word.test(text)}`).toBe(`${word}:false`)
    }
    // `Check` only as the verb for what was done to the files, never as the name of this screen.
    expect(text).not.toMatch(/the check\b/i)
    expect(text).toMatch(/sign(ed)? off/i)
  })

  it('says the gig can be signed off again, because a gig can be edited afterwards', async () => {
    everythingGood({
      gigText: gigJson({
        setup: { confirmedAt: '2026-05-01T10:00:00.000Z', against: { songs: {}, visuals: null, display: '' } },
      }),
    })
    await goToCheck()
    await waitFor(() => expect(screen.getByTestId('gig-flow-confirm')).toBeTruthy(), WAIT)
    // Either state is legitimate — what matters is that the press is still offered.
    expect(screen.getByTestId('gig-flow-confirm').textContent).toBe('Sign off the gig again')
  })
})
