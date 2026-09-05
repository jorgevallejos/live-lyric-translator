/** @vitest-environment jsdom */
/**
 * **The song flow, in one window.**
 *
 * What these defend is the boundary rather than the behaviour. Bombista is started with a
 * directory and serves its own pages; Pregonero draws them in a frame and reads **one file** back
 * out. Nothing is injected into the page, nothing is read out of it, and Bombista does not learn
 * that Pregonero exists.
 *
 * And the step 7 blocker: **nothing is written before the flow ends**, so `promote` takes its
 * create path and carries the words. The walk of 2026-09-02 died on a skeleton with one
 * placeholder lyric line, into which `promote` merges only the timeline envelope.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ensureStorage } from './testSupport/storage'
import { SONGS_FOLDER_KEY } from './contentFolders'
import { clearSongFlowRequest, setSongFlowRequest } from './songFlowState'
import { dropLibraryCache, setLibraryEntries } from './setlistStore'

const startBombistaFlow = vi.fn()
const stopBombistaFlow = vi.fn()
const emittedSong = vi.fn()
const runBombista = vi.fn()
const readSongFileText = vi.fn()
const fileExists = vi.fn()
const replaceSongFile = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startBombistaFlow: (...a: unknown[]) => startBombistaFlow(...a),
  stopBombistaFlow: (...a: unknown[]) => stopBombistaFlow(...a),
  emittedSong: (...a: unknown[]) => emittedSong(...a),
  runBombista: (...a: unknown[]) => runBombista(...a),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
  readGigFolder: () =>
    Promise.resolve({
      folderPath: null,
      gigText: null,
      gigError: null,
      gigPresent: false,
      visualsText: null,
      visualsError: null,
      visualsPresent: false,
    }),
  listSongsFolder: () => Promise.resolve({ files: [], problem: null, answered: true }),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  fileExists: (...a: unknown[]) => fileExists(...a),
  replaceSongFile: (...a: unknown[]) => replaceSongFile(...a),
}))

const { SongFlowView, serveArgs, hasProducedASong } = await import('./SongFlowView')

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  dropLibraryCache()
  vi.clearAllMocks()
  clearSongFlowRequest()
  window.location.hash = '#/song'
  localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
  startBombistaFlow.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:51235/' })
  stopBombistaFlow.mockResolvedValue(undefined)
  emittedSong.mockResolvedValue(null)
  runBombista.mockResolvedValue({ status: 'ok', output: 'created: /songs/libertad.json', code: 0 })
  readSongFileText.mockResolvedValue({
    ok: true,
    text: JSON.stringify({ title: 'Libertad', lyrics: [{ es: 'a' }] }),
  })
  // A new song by default: nothing at the target yet, so promote creates.
  fileExists.mockResolvedValue(false)
  replaceSongFile.mockResolvedValue({ ok: true, backup: null })
})

function request(over: Partial<Parameters<typeof setSongFlowRequest>[0]> = {}) {
  setSongFlowRequest({
    staging: '/staging/_new',
    startedAt: 1000,
    songPath: null,
    title: 'New song',
    ...over,
  })
}

async function renderFlow() {
  await act(async () => {
    render(<SongFlowView />)
  })
}

describe('the song flow', () => {
  it('is one window: Bombista’s page is drawn in the app, not opened beside it', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    const frame = screen.getByTestId('song-flow-frame') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('http://127.0.0.1:51235/')
    // The page is Bombista's and stays Bombista's: no bridge into the frame, at all.
    expect(frame.getAttribute('srcdoc')).toBeNull()
  })

  it('hands Bombista the directory it will promote from', async () => {
    // Without it Bombista works in its own cache, and Pregonero would have to know that cache's
    // layout to find the file it means to promote. The catalogue is Pregonero's word; the file
    // path is the whole contract.
    request({ staging: '/staging/duelo' })
    await renderFlow()
    await waitFor(() => expect(startBombistaFlow).toHaveBeenCalled())
    expect(startBombistaFlow.mock.calls[0]![0]).toEqual([
      '--staging',
      '/staging/duelo',
      '--no-header',
      '--deal',
      '--browse-from',
      '/songs',
    ])
  })

  // ── What Pregonero says to Bombista, and it is five options ──────────────────────────────
  //
  // Walked on v0.32.0, 2026-09-02 — the first time a person operated the seam. The defaults are
  // right for running Bombista alone and wrong inside a window that already has a title and
  // already knows where the songs are. `serveArgs` is the whole of it.

  it('opens the pickers at the catalogue, not at the home folder', async () => {
    // The one screen whose job is to find a lyrics file and a recording, both of which live in the
    // songs folder. **The songs root, not `song-performance/`** — the song files are in that
    // folder and neither of the two things being looked for is.
    expect(serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'x' }, '/vault/songs', true))
      .toContain('/vault/songs')
    expect(
      serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'x' }, '/vault/songs', true)
    ).not.toContain('/vault/songs/song-performance')
  })

  it('turns off the product header, inside a window that already has a title', async () => {
    // Name, tagline, version and who made it — the tool introducing itself to somebody who did not
    // choose it. **The version comes off with it** (Jorge, 2026-09-03) and survives in standalone
    // Bombista, which is where the rule needs it: it has to survive somewhere, not everywhere.
    expect(
      serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'New song' }, '/songs', true)
    ).toContain('--no-header')
  })

  it('starts page 1 prefilled from the song, on an edit and only on an edit', async () => {
    // What makes an edit an edit rather than a second new song. Without it the person lands on an
    // empty page 1 and is asked to find the file they just clicked — with `<id>-song.json` sitting
    // beside `<id>.json` in the same folder, the wrong answer next to the right one.
    const editing = serveArgs(
      { staging: '/s', startedAt: 0, songPath: '/songs/song-performance/duelo.json', title: 'Duelo' },
      '/songs',
      true
    )
    expect(editing.slice(editing.indexOf('--song'))).toEqual([
      '--song',
      '/songs/song-performance/duelo.json',
    ])
    expect(
      serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'New song' }, '/songs', true)
    ).not.toContain('--song')
  })

  it('says nothing about a catalogue there is none of, rather than an empty option', async () => {
    // `--browse-from` is checked by Bombista, so a missing value is a refusal at the door.
    expect(
      serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'x' }, null, true)
    ).not.toContain('--browse-from')
  })

  // ── The deal, and whose question it is ────────────────────────────────────────────────────
  //
  // **Show it when this machine has produced no song yet** (Jorge, 2026-09-03). Bombista's step 0
  // — what you get, what it costs, what it does not do — in front of a flow that asks for a
  // sitting before anything works. One rule, two sources of truth: Bombista answers it from its
  // own cache when it is running alone, and **in here the catalogue answers it**, because the
  // cache is not the directory this flow works in. Bombista does not know what a catalogue is and
  // must not learn, so what crosses is a boolean.

  /**
   * **The artist's name travels one way** (2026-09-06). The name collected on first run seeds
   * Bombista's artist field so it is not retyped for every new song. **Bombista prefills FROM it
   * and never writes to it**, and nothing here ever reads that field back: capturing the name out
   * of Bombista's page 1 was Cowork's proposal and Jorge rejected it — *a value collected for one
   * purpose is not silently promoted to another*, which is why the first-run screen exists.
   */
  it('passes the artist name it was given, and omits the option when there is none', async () => {
    const request = { staging: '/s', startedAt: 0, songPath: null, title: 'x' }
    const withName = serveArgs(request, '/songs', true, 'Chango Pepper')
    expect(withName).toContain('--artist')
    expect(withName[withName.indexOf('--artist') + 1]).toBe('Chango Pepper')

    // **Omitted rather than passed empty**: an option always present and usually carrying nothing
    // is a thing to explain, and Bombista's own default for the field is already empty.
    expect(serveArgs(request, '/songs', true, null)).not.toContain('--artist')
    expect(serveArgs(request, '/songs', true, '')).not.toContain('--artist')
  })

  it('asks for the deal while the catalogue is empty', async () => {
    expect(
      serveArgs({ staging: '/s', startedAt: 0, songPath: null, title: 'x' }, '/songs', false)
    ).toContain('--deal')
  })

  it('does not ask for it again once this machine has produced a song', async () => {
    // **The refusal, and it takes no remembered flag to make it.** The catalogue fills on the
    // first save and answers for itself from then on — one fewer thing for the walk's reset to
    // clear, in a project whose test discipline is starting from nothing.
    const args = serveArgs(
      { staging: '/s', startedAt: 0, songPath: null, title: 'x' },
      '/songs',
      true
    )
    expect(args).toContain('--no-deal')
    expect(args).not.toContain('--deal')
  })

  it('answers it either way rather than letting Bombista fall back to its cache', async () => {
    // **Unset is not an option here.** Bombista's fallback reads `~/.cache/bombista`, which this
    // flow never writes to — left to decide, it would say *show it* on every song forever.
    for (const produced of [true, false]) {
      const args = serveArgs(
        { staging: '/s', startedAt: 0, songPath: null, title: 'x' },
        '/songs',
        produced
      )
      expect(args.some((a) => a === '--deal' || a === '--no-deal')).toBe(true)
    }
  })

  it('reads the answer off the catalogue, which is what this app means by the songs you have', () => {
    expect(hasProducedASong()).toBe(false)

    setLibraryEntries([
      { ref: { id: 'duelo', path: 'duelo.json' }, song: { id: 'duelo', title: 'Duelo', lyrics: [] } },
    ] as never)

    expect(hasProducedASong()).toBe(true)
  })

  it('asks for the deal on a first song and not on the one after it', async () => {
    // End to end through the screen, because `serveArgs` being right is not the same as the
    // screen calling it with the answer.
    request({ staging: '/staging/_new' })
    await renderFlow()
    await waitFor(() => expect(startBombistaFlow).toHaveBeenCalled())
    expect(startBombistaFlow.mock.calls[0]![0]).toContain('--deal')

    cleanup()
    clearSongFlowRequest()
    startBombistaFlow.mockClear()
    setLibraryEntries([
      { ref: { id: 'duelo', path: 'duelo.json' }, song: { id: 'duelo', title: 'Duelo', lyrics: [] } },
    ] as never)

    request({ staging: '/staging/_new' })
    await renderFlow()
    await waitFor(() => expect(startBombistaFlow).toHaveBeenCalled())
    expect(startBombistaFlow.mock.calls[0]![0]).toContain('--no-deal')
  })

  it('passes all five on an edit, in the order serveArgs builds them', async () => {
    request({ staging: '/staging/duelo', songPath: '/songs/song-performance/duelo.json' })
    await renderFlow()
    await waitFor(() => expect(startBombistaFlow).toHaveBeenCalled())
    expect(startBombistaFlow.mock.calls[0]![0]).toEqual([
      '--staging',
      '/staging/duelo',
      '--no-header',
      '--deal',
      '--browse-from',
      '/songs',
      '--song',
      '/songs/song-performance/duelo.json',
    ])
  })

  it('writes no song file before the flow ends', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('promotes the file Save wrote, not align’s candidate, and lands on Backstage', async () => {
    // **The one that closes step 7.** `align`'s `<stem>-song.json` carries the timeline as the
    // machine left it; page 2's refinements live only in the file the emit wrote, and promoting
    // the wrong one reported success while losing them.
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    await renderFlow()
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 3000 })
    expect(runBombista).toHaveBeenCalledWith('promote', [
      '/staging/_new/libertad.json',
      '/songs/song-performance/libertad.json',
    ])
    await waitFor(() => expect(window.location.hash).toBe('#/setup'))
  })

  it('reads the song’s name off that file rather than asking for one', async () => {
    // A song's id is its filename, and `promote` will only create `<stem>.json` from a `<stem>`
    // candidate — so a name typed anywhere would be a second opinion about a settled decision.
    request()
    emittedSong.mockResolvedValue('/staging/_new/hasta-calmar-el-alma.json')
    await renderFlow()
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 3000 })
    expect(runBombista.mock.calls[0]![1][1]).toBe(
      '/songs/song-performance/hasta-calmar-el-alma.json'
    )
  })

  it('stops bombista serve before promoting, and promotes once', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    await renderFlow()
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 3000 })
    expect(stopBombistaFlow).toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 900))
    expect(runBombista).toHaveBeenCalledTimes(1)
  })

  it('asks only about files newer than the flow it is in', async () => {
    // Editing reuses the song's staging directory, so the previous edit's answer is already there.
    request({ staging: '/staging/duelo', startedAt: 4242 })
    await renderFlow()
    await waitFor(() => expect(emittedSong).toHaveBeenCalled(), { timeout: 3000 })
    expect(emittedSong).toHaveBeenCalledWith('/staging/duelo', 4242)
  })

  it('says what promote refused, rather than landing on a song that was not written', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    runBombista.mockResolvedValue({
      status: 'failed',
      output: 'timeline length (24) must match the song’s lyrics item count (1)',
      code: 1,
    })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-problem')).toBeTruthy(), {
      timeout: 3000,
    })
    expect(screen.getByTestId('song-flow-problem').textContent).toContain('timeline length')
    expect(window.location.hash).toBe('#/song')
  })

  it('names the reason when bombista serve will not start, rather than a blank frame', async () => {
    request()
    startBombistaFlow.mockResolvedValue({ ok: false, error: 'bombista could not be run' })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-problem')).toBeTruthy())
    expect(screen.queryByTestId('song-flow-frame')).toBeNull()
  })

  it('ends the run when the screen goes, so no serve outlives the flow', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    cleanup()
    await waitFor(() => expect(stopBombistaFlow).toHaveBeenCalled())
  })

  /**
   * **This used to be one press, and it is two now** (2026-09-02). The assertion below is the same
   * one it always made — leaving ends the run — with the consent step that the walk of that day
   * put in front of it. The dialog itself is covered under *leaving the song flow*, at the foot of
   * this file; what is defended here is that consenting still tears the run down and still leaves.
   */
  it('Back leaves once it has been consented to, and leaving ends the run', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    fireEvent.click(screen.getByTestId('song-flow-leave'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-flow-leave-confirm'))
    })
    expect(stopBombistaFlow).toHaveBeenCalled()
    expect(window.location.hash).toBe('#/setup')
  })

  it('goes back to Backstage when there is no flow to be in', async () => {
    await renderFlow()
    expect(window.location.hash).toBe('#/setup')
    expect(startBombistaFlow).not.toHaveBeenCalled()
  })

  // ── A file the suite refuses is never written, and the refusal stays in the flow ──────────
  //
  // Walked on v0.33.0, 2026-09-02. `Save to the catalogue` wrote `libertad.json` with
  // `tempo.countInBars: 0`, the flow promoted it and closed, and Backstage met the file for the
  // first time and put up a popup about it — a failure reported on a screen that cannot act on it,
  // after the screen that caused it is gone.

  it('does not promote a file its own reader refuses', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    readSongFileText.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        title: 'Libertad',
        lyrics: [{ es: 'a' }],
        tempo: { bpm: 120, numerator: 4, denominator: 4, countInBars: 0 },
      }),
    })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('says what is wrong where the page that made it still is', async () => {
    // **The same reader Backstage runs**, so the two can never disagree — which is the defect,
    // rather than the particular value that tripped it.
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    readSongFileText.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        title: 'Libertad',
        lyrics: [{ es: 'a' }],
        tempo: { bpm: 120, numerator: 4, denominator: 4, countInBars: 0 },
      }),
    })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    const said = screen.getByTestId('song-flow-refused').textContent!
    expect(said).toContain('libertad.json')
    expect(said).toContain('tempo.countInBars')
    // The page is still there, and the run with it: it is the only screen that can answer this.
    expect(screen.getByTestId('song-flow-frame')).toBeTruthy()
    expect(stopBombistaFlow).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/song')
  })

  it('stops asking about the file it just refused, and waits for the next Save', async () => {
    // A refused file stays on disk — nothing deletes it, and the flow that wrote it is still open
    // — so without moving the watermark every poll would rediscover the same refusal.
    request({ startedAt: 1000 })
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    readSongFileText.mockResolvedValue({ ok: true, text: '{ not json' })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    await waitFor(() => expect(emittedSong.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 })
    const [first, ...rest] = emittedSong.mock.calls
    expect(first![1]).toBe(1000)
    // Everything after the refusal asks about files newer than it: the next press of Save.
    for (const call of rest) expect(call[1]).toBeGreaterThan(1000)
  })

  it('takes the next Save, and lands when that one reads', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    readSongFileText.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        title: 'Libertad',
        lyrics: [{ es: 'a' }],
        tempo: { bpm: 120, numerator: 4, denominator: 4, countInBars: 0 },
      }),
    })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    // Pressed again with the count-in fixed: a newer file, which the raised watermark lets through.
    readSongFileText.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ title: 'Libertad', lyrics: [{ es: 'a' }] }),
    })
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 4000 })
    await waitFor(() => expect(window.location.hash).toBe('#/setup'))
  })

  it('refuses a file it cannot read at all, without promoting it', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    readSongFileText.mockResolvedValue({ ok: false, error: 'EACCES: permission denied' })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    expect(screen.getByTestId('song-flow-refused').textContent).toContain('EACCES')
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('says nothing about a refusal when the file reads', async () => {
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    await renderFlow()
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByTestId('song-flow-refused')).toBeNull()
  })

  // ── The translation step is NOT named on this side, and the inversion is the point ────────
  //
  // **This pair used to assert the opposite** (2026-09-02 to 2026-09-03). Pregonero drew the line
  // beside the frame and the test above it said *once, at the end of the flow*. Neither was true:
  // the frame is the whole flow, so the line was up on Bombista's page 1, page 2 and page 3
  // alike, and the walk of 2026-09-03 read it as a fixed footer on every screen.
  //
  // **The fix could not be on this side.** Pregonero draws Bombista in a frame with no preload
  // and reads nothing out of it, so it cannot tell which page is showing — and teaching it would
  // trade a load-bearing boundary for a sentence. The end of the flow is Bombista's page 3, so
  // Bombista renders it there. `tests/test_pages.py` is where it is now asserted present, absent
  // from the other pages, and below the actions.
  //
  // These two stay, inverted, for the same reason the gig flow's song door kept its inverted
  // test when the line left there: the line has drifted home three times, and the surface it
  // drifts back to is whichever one still draws it.

  it('does not draw the translations line beside the frame, on every page of the flow', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    expect(screen.queryByTestId('song-flow-translations')).toBeNull()
    // Not by test id and not by its words either: a line re-added under another name is the same
    // line back on page 1.
    expect(screen.getByTestId('song-flow').textContent).not.toMatch(
      /Translations are written outside the suite/
    )
  })

  it('does not put it on a screen where nothing is being made', async () => {
    request()
    startBombistaFlow.mockResolvedValue({ ok: false, error: 'bombista could not be run' })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-problem')).toBeTruthy())
    expect(screen.queryByTestId('song-flow-translations')).toBeNull()
  })

  // ── An edit replaces the file; a new song is created by promote ──────────────────────────
  //
  // Found 2026-09-02. Page 1 became the edit surface in Bombista v1.4.0 — it collects the title,
  // the artist, the notes and the tempo — while `promote` writes only the timeline envelope. So
  // editing a title and saving over an existing song changed nothing, silently. `promote` is not
  // widened past the timeline; the edit replaces the file with the candidate.

  const timed = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      title: 'Libertad',
      lyrics: [{ es: 'a' }],
      timelineVersion: 2,
      leadIn: { durationSec: 0, source: 'measured', confidence: 'high', apply: false },
      timeline: [{ start: 0, end: 1 }],
      ...over,
    })

  it('replaces the file when the song is already in the catalogue', async () => {
    request({ songPath: '/songs/song-performance/libertad.json' })
    emittedSong.mockResolvedValue('/staging/libertad/libertad.json')
    fileExists.mockResolvedValue(true)
    readSongFileText.mockResolvedValue({ ok: true, text: timed() })
    await renderFlow()
    await waitFor(() => expect(replaceSongFile).toHaveBeenCalled(), { timeout: 3000 })
    expect(replaceSongFile).toHaveBeenCalledWith(
      '/staging/libertad/libertad.json',
      '/songs/song-performance/libertad.json'
    )
    // **Not promote.** It writes only the timeline envelope, which is the whole defect.
    expect(runBombista).not.toHaveBeenCalled()
    await waitFor(() => expect(window.location.hash).toBe('#/setup'))
  })

  it('still creates a song that is not there yet with promote', async () => {
    // Creating is promote's create path, which drops `_bombista` — so a made song carries no key
    // a hand-made one does not.
    request()
    emittedSong.mockResolvedValue('/staging/_new/libertad.json')
    fileExists.mockResolvedValue(false)
    await renderFlow()
    await waitFor(() => expect(runBombista).toHaveBeenCalled(), { timeout: 3000 })
    expect(runBombista.mock.calls[0]![0]).toBe('promote')
    expect(replaceSongFile).not.toHaveBeenCalled()
  })

  it('never replaces a timed song with a candidate that carries no timeline', async () => {
    // Writing nothing would leave timings the person believes they removed; writing the candidate
    // would destroy a measured one. Bombista's promote states this rule and this path is not it.
    request({ songPath: '/songs/song-performance/libertad.json' })
    emittedSong.mockResolvedValue('/staging/libertad/libertad.json')
    fileExists.mockResolvedValue(true)
    readSongFileText.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/staging')
          ? { ok: true, text: JSON.stringify({ title: 'Libertad', lyrics: [{ es: 'a' }] }) }
          : { ok: true, text: timed() }
      )
    )
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-refused')).toBeTruthy(), {
      timeout: 3000,
    })
    expect(screen.getByTestId('song-flow-refused').textContent).toContain('has a timeline')
    expect(replaceSongFile).not.toHaveBeenCalled()
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('re-saves a song that never had a timeline, which is ordinary', async () => {
    // A manual song is a complete song. Absence is a state; only incompleteness is a fault.
    request({ songPath: '/songs/song-performance/libertad.json' })
    emittedSong.mockResolvedValue('/staging/libertad/libertad.json')
    fileExists.mockResolvedValue(true)
    readSongFileText.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ title: 'Libertad', lyrics: [{ es: 'a' }] }),
    })
    await renderFlow()
    await waitFor(() => expect(replaceSongFile).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByTestId('song-flow-refused')).toBeNull()
  })

  it('replaces a timed song with a timed candidate without complaint', async () => {
    request({ songPath: '/songs/song-performance/libertad.json' })
    emittedSong.mockResolvedValue('/staging/libertad/libertad.json')
    fileExists.mockResolvedValue(true)
    readSongFileText.mockResolvedValue({ ok: true, text: timed({ title: 'Libertad editado' }) })
    await renderFlow()
    await waitFor(() => expect(replaceSongFile).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByTestId('song-flow-refused')).toBeNull()
  })

  it('says why a replace did not happen, in the flow that asked for it', async () => {
    request({ songPath: '/songs/song-performance/libertad.json' })
    emittedSong.mockResolvedValue('/staging/libertad/libertad.json')
    fileExists.mockResolvedValue(true)
    readSongFileText.mockResolvedValue({ ok: true, text: timed() })
    replaceSongFile.mockResolvedValue({ ok: false, error: 'EACCES: permission denied' })
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-problem')).toBeTruthy(), {
      timeout: 3000,
    })
    expect(screen.getByTestId('song-flow-problem').textContent).toContain('EACCES')
  })
})

/**
 * **`Back` asks before it discards** (2026-09-02).
 *
 * The walk found `Back` returning to Backstage with everything typed gone: it kills the `serve`
 * process, and the session's memory is that process's memory. So it is a destructive action, and
 * it now takes consent — the second of the three popups the suite allows, the same category as
 * deleting a song.
 *
 * **The boundary is what shapes the condition.** Pregonero cannot ask the page whether it is
 * dirty, so *the pages are up* is the closest true statement, and it is deliberately the cautious
 * side of the line.
 */
describe('leaving the song flow', () => {
  it('asks before tearing the flow down, names what goes, and offers to stay', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())

    fireEvent.click(screen.getByTestId('song-flow-leave'))

    const popup = screen.getByTestId('song-flow-leave-popup')
    expect(screen.getByTestId('song-flow-leave-title').textContent).toBe('Leave without saving?')
    expect(popup.textContent).toContain('This song has not been saved to your catalogue.')
    expect(popup.textContent).toContain('What you have typed here will be lost.')
    expect(screen.getByTestId('song-flow-leave-stay')).toBeTruthy()
    expect(screen.getByTestId('song-flow-leave-confirm')).toBeTruthy()

    // The press alone changes nothing: the run is still alive and the screen has not moved.
    expect(stopBombistaFlow).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/song')
  })

  it('Stay leaves the flow exactly where it was', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())

    fireEvent.click(screen.getByTestId('song-flow-leave'))
    fireEvent.click(screen.getByTestId('song-flow-leave-stay'))

    expect(screen.queryByTestId('song-flow-leave-popup')).toBeNull()
    expect(screen.getByTestId('song-flow-frame')).toBeTruthy()
    expect(stopBombistaFlow).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/song')
  })

  it('Leave is what it always was: the run ends and the screen goes back', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())

    fireEvent.click(screen.getByTestId('song-flow-leave'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('song-flow-leave-confirm'))
    })

    expect(stopBombistaFlow).toHaveBeenCalled()
    expect(window.location.hash).toBe('#/setup')
  })

  /**
   * **It fires only when there is something to lose.** A subprocess that refused to start has
   * taken no answers, so consent would be a dialog about nothing — and popups devalue faster than
   * any other surface.
   */
  it('does not ask when the flow never started', async () => {
    startBombistaFlow.mockResolvedValue({ ok: false, error: 'bombista is not installed.' })
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-problem')).toBeTruthy())

    await act(async () => {
      fireEvent.click(screen.getByTestId('song-flow-leave'))
    })

    expect(screen.queryByTestId('song-flow-leave-popup')).toBeNull()
    expect(window.location.hash).toBe('#/setup')
  })

  /**
   * **The page is never asked whether it is dirty**, and this is the test that fails on the day
   * somebody makes it easy by injecting a listener. The frame carries no bridge, so the condition
   * has to be drawn from what Pregonero itself knows.
   */
  it('learns nothing from inside the frame to decide it', async () => {
    request()
    await renderFlow()
    await waitFor(() => expect(screen.getByTestId('song-flow-frame')).toBeTruthy())
    const frame = screen.getByTestId('song-flow-frame') as HTMLIFrameElement
    expect(frame.getAttribute('srcdoc')).toBeNull()
    expect(frame.getAttribute('sandbox')).toBeNull()
    expect(frame.getAttribute('onload')).toBeNull()
  })
})
