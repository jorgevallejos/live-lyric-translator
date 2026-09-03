/**
 * **Setup home**, and the walk it exists to make possible.
 *
 * The E2E run on 2026-08-31 was attempted from genuinely nothing — no song, no gig — and could not
 * be completed from inside Pregonero: step 1 stated a requirement, disabled both navigation
 * buttons, offered no action and pointed at a terminal. These tests are about that: what an empty
 * machine is offered, and that neither list quietly hides anything.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { SetupHomeView } from './SetupHomeView'
import { ensureStorage } from './testSupport/storage'
import { installLibrary } from './testSupport/library'
import { GIG_LIST_KEY, getGigList } from './gigListStore'
import { GIGS_FOLDER_KEY, SONGS_FOLDER_KEY } from './contentFolders'
import { setLibraryEntries, type LibrarySong } from './setlistStore'
import { forgetLaunchAnnouncements } from './launchAnnouncements'
import { clearSongFlowRequest, getSongFlowRequest } from './songFlowState'

const chooseGigFolderPath = vi.fn()
const runBombista = vi.fn()
const readSongFileText = vi.fn()
const readGigFolder = vi.fn()
const listSongsFolder = vi.fn()
const folderReadable = vi.fn()
const bombistaStagingDir = vi.fn()
const deleteSongFile = vi.fn()
const deleteGigFolder = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasGigFolderAccess: () => true,
  canRunBombista: () => true,
  canHostTools: () => false,
  chooseGigFolderPath: (...a: unknown[]) => chooseGigFolderPath(...a),
  runBombista: (...a: unknown[]) => runBombista(...a),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  listSongsFolder: (...a: unknown[]) => listSongsFolder(...a),
  folderReadable: (...a: unknown[]) => folderReadable(...a),
  deleteSongFile: (...a: unknown[]) => deleteSongFile(...a),
  deleteGigFolder: (...a: unknown[]) => deleteGigFolder(...a),
  writeGigFile: () => Promise.resolve({ ok: true }),
  fileExists: () => Promise.resolve(true),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  bombistaVersion: () => Promise.resolve({ present: true, version: 'bombista 1.1.0' }),
  bombistaStagingDir: (...a: unknown[]) => bombistaStagingDir(...a),
  openBombistaReview: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
}))

function song(id: string): LibrarySong {
  return { id, title: id, items: [{ languages: { es: 'línea' } }] } as LibrarySong
}

/** A song Bombista has given a timeline: the other half of the `manual only` question. */
function timedSong(id: string): LibrarySong {
  return { ...song(id), timeline: [{ start: 0, end: 1 }] } as LibrarySong
}

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  // The resolved library is an in-memory cache and outlives localStorage.clear(), so a song made
  // in one test would otherwise still be listed in the next.
  setLibraryEntries([])
  // Announcements about unreadable files and folders are launch-scoped and in memory, so each test
  // is a launch. Everything else about them would test the record rather than the screen.
  forgetLaunchAnnouncements()
  clearSongFlowRequest()
  window.location.hash = '#/setup'
  bombistaStagingDir.mockResolvedValue('/staging/x')
  deleteSongFile.mockResolvedValue({ ok: true })
  deleteGigFolder.mockResolvedValue({ ok: true })
  vi.clearAllMocks()
  readGigFolder.mockResolvedValue({
    folderPath: '/gigs/x',
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  })
  readSongFileText.mockResolvedValue({
    ok: true,
    text: JSON.stringify({ title: 'Nuevo', lyrics: [{ es: 'línea' }] }),
  })
  listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: true })
  folderReadable.mockResolvedValue({ readable: true, answered: true, problem: null })
})

async function renderHome() {
  await act(async () => {
    render(<SetupHomeView />)
  })
}

describe('Setup home', () => {
  it('shows both lists, and offers a way into each, from an empty machine', async () => {
    // The 2026-08-31 dead end, inverted: from nothing there is an action on this screen.
    await renderHome()
    expect(screen.getByTestId('setup-home-gigs')).toBeTruthy()
    expect(screen.getByTestId('setup-home-songs')).toBeTruthy()
    expect(screen.getByTestId('setup-new-gig')).toBeTruthy()
    expect(screen.getByTestId('setup-new-song')).toBeTruthy()
    expect(screen.getByTestId('setup-home-no-gigs')).toBeTruthy()
    expect(screen.getByTestId('setup-home-no-songs')).toBeTruthy()
  })

  // ── The screen holds two lists and the means to make or import one. Nothing else ──────────
  //
  // Jorge, 2026-09-02, walking the screen: it was correct and read like a document. Two columns of
  // prose with lists in them, ownership sentences included.

  it('has a frame for each list, there whether or not the list is', async () => {
    // The frame is the operational surface and its contents are what change. A list that appears
    // only once it has something in it reshapes the screen the first time it is used.
    await renderHome()
    expect(screen.getByTestId('setup-home-gigs-frame')).toBeTruthy()
    expect(screen.getByTestId('setup-home-songs-frame')).toBeTruthy()
    expect(screen.getByTestId('setup-home-no-gigs').textContent).toBe('No gigs yet.')
    expect(screen.getByTestId('setup-home-no-songs').textContent).toBe('No songs yet.')
    // The empty line is inside its frame, not floating beside it.
    expect(
      screen.getByTestId('setup-home-gigs-frame').contains(screen.getByTestId('setup-home-no-gigs'))
    ).toBe(true)
  })

  it('names the button New, and the heading carries the noun', async () => {
    await renderHome()
    expect(screen.getByTestId('setup-new-gig').textContent).toBe('New')
    expect(screen.getByTestId('setup-new-song').textContent).toBe('New')
    expect(screen.getByTestId('setup-home-gigs').textContent).toContain('Gigs')
    expect(screen.getByTestId('setup-home-songs').textContent).toContain('Songs')
  })

  it('has no Import in the songs column, and its absence is a decision', async () => {
    // Raised as a new capability and DEFERRED by Jorge on 2026-09-02: what importing a song means
    // when the list is the folder is an open design question. Not a layout move waiting to happen.
    await renderHome()
    const songsColumn = screen.getByTestId('setup-home-songs')
    const labels = [...songsColumn.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).not.toContain('Import')
  })

  it('carries no explanatory prose in either column', async () => {
    // Including the ownership sentences. Both are true and both are internal detail from where the
    // user stands; they live in the docs.
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a']))
    installLibrary([song('duelo')])
    await renderHome()
    const gigs = screen.getByTestId('setup-home-gigs').textContent!
    const songs = screen.getByTestId('setup-home-songs').textContent!
    expect(gigs).not.toContain('Forget is Pregonero forgetting')
    expect(gigs).not.toContain('drive that is not plugged in')
    expect(songs).not.toContain('Bombista’s')
    expect(songs).not.toContain('gig-independent')
    // `Import a gig from elsewhere…` was a footnote under the empty state; it is a sibling now.
    expect(gigs).not.toContain('from elsewhere')
  })

  it('shows every song, and never truncates the list', async () => {
    // The whole catalogue plus one. **No fold, no "show more", no max height** — setup is desk
    // work on a real screen, and a list that hides rows hides the fact that decides tonight.
    const many = Array.from({ length: 14 }, (_, i) => song(`song-${i}`))
    installLibrary(many)
    await renderHome()
    for (const s of many) expect(screen.getByTestId(`setup-song-row-${s.id}`)).toBeTruthy()
  })

  it('shows every gig, and never truncates that list either', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a', '/gigs/b', '/gigs/c', '/gigs/d']))
    await renderHome()
    for (const name of ['a', 'b', 'c', 'd']) {
      expect(screen.getByTestId(`setup-gig-row-${name}`)).toBeTruthy()
    }
  })

  it('shows no readiness on a gig row, rather than a stale one', async () => {
    // Readiness per row is the next round. Until then a row says nothing about whether the gig is
    // ready — a wrong "Ready" is worse than no word, and `libertad` is the standing argument.
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a']))
    await renderHome()
    const row = screen.getByTestId('setup-gig-row-a')
    expect(row.textContent).not.toMatch(/ready/i)
  })

  // ── A file that will not read: one popup, then dropped ───────────────────────────────────
  //
  // Jorge's call, 2026-09-02, walking the screen. It was a red row that stayed red for as long as
  // the file did — a standing accusation on a screen whose job is the two lists that decide
  // tonight. A file somebody changed outside Pregonero is an outside problem: said once, then
  // ignored.

  it('drops a song file that will not read, and marks nothing', async () => {
    installLibrary([song('ok'), song('libertad')])
    setLibraryEntries([
      { ref: { id: 'ok', path: 'ok.json' }, song: song('ok') },
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    expect(screen.getByTestId('setup-song-row-ok')).toBeTruthy()
    expect(screen.queryByTestId('setup-song-row-libertad')).toBeNull()
    expect(screen.queryByTestId('setup-song-broken-libertad')).toBeNull()
    expect(screen.queryByTestId('setup-songs-report')).toBeNull()
  })

  it('names the file and its own reason, and offers no repair', async () => {
    // **The file, not the song** — the title inside may be the unreadable part. **The validator's
    // reason**, which is the difference between knowing something is wrong and knowing what is.
    // **No route to Bombista**: Pregonero cannot know whether the file is repairable at all.
    installLibrary([song('ok'), song('libertad')])
    setLibraryEntries([
      { ref: { id: 'ok', path: 'ok.json' }, song: song('ok') },
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-unreadable-popup')).toBeTruthy())
    expect(screen.getByTestId('setup-songs-unreadable-title').textContent).toBe(
      'One song file will not read'
    )
    const named = screen.getByTestId('setup-songs-unreadable-list').textContent!
    expect(named).toContain('libertad.json')
    expect(named).toContain('24 lines against 20')
    expect(named).not.toContain('ok.json')
    expect(screen.getByTestId('setup-songs-unreadable-note').textContent).toBe(
      'The file is untouched and stays where it is. It is not in Pregonero’s song list, so it cannot be added to a gig.'
    )
    expect(screen.getByTestId('setup-songs-unreadable-popup').textContent).not.toContain('Bombista')
  })

  it('counts them in the title, one line each', async () => {
    installLibrary([song('libertad'), song('paso')])
    setLibraryEntries([
      { ref: { id: 'libertad', path: 'libertad.json' }, error: 'no lyric line' },
      { ref: { id: 'paso', path: 'paso.json' }, error: 'unexpected token' },
    ])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-unreadable-popup')).toBeTruthy())
    expect(screen.getByTestId('setup-songs-unreadable-title').textContent).toBe(
      '2 song files will not read'
    )
    const rows = screen.getByTestId('setup-songs-unreadable-list').querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('no lyric line')
    expect(rows[1]!.textContent).toContain('unexpected token')
    // **The plural has its own sentence.** The singular one shipped under a plural title on the
    // 2026-09-02 walk, saying *the file* over a list of two.
    expect(screen.getByTestId('setup-songs-unreadable-note').textContent).toBe(
      'The files are untouched and stay where they are. They are not in Pregonero’s song list, so they cannot be added to a gig.'
    )
  })

  it('says it once per launch, not once per visit', async () => {
    // Nothing tells the app the file was repaired, so the record is in memory and a relaunch says
    // it again. What it must not do is say it on every arrival at this screen.
    installLibrary([song('libertad')])
    setLibraryEntries([
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-unreadable-popup')).toBeTruthy())
    cleanup()
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-home-no-songs')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-unreadable-popup')).toBeNull()
  })

  it('closes, and does not come back on this arrival', async () => {
    installLibrary([song('libertad')])
    setLibraryEntries([
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-unreadable-popup')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('setup-songs-unreadable-popup')).toBeNull()
  })

  it('says nothing when the catalogue read cleanly', async () => {
    installLibrary([song('ok')])
    setLibraryEntries([{ ref: { id: 'ok', path: 'ok.json' }, song: song('ok') }])
    await renderHome()
    expect(screen.queryByTestId('setup-songs-unreadable-popup')).toBeNull()
  })

  // ── A folder that cannot be read: a popup, then a half that says why it is dead ──────────
  //
  // Jorge, 2026-09-02, on the same rule as the unreadable file: a condition made outside the tools
  // is an event to be told about once, not a state to live with in the page. What outlives the
  // dialog is the half's disabled buttons and the one line in its frame.

  it('names the songs folder in a popup, with the path and where to set it', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({
      files: [],
      problem: 'ENOENT: /songs',
      answered: false,
    })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-folder-popup')).toBeTruthy())
    expect(screen.getByTestId('setup-songs-folder-popup-title').textContent).toBe(
      'The songs folder cannot be read'
    )
    expect(screen.getByTestId('setup-songs-folder-popup-path').textContent).toBe('/songs')
    const popup = screen.getByTestId('setup-songs-folder-popup').textContent!
    expect(popup).toContain('moved or renamed')
    expect(popup).toContain('drive that is not connected')
    expect(popup).toContain('Preferences')
    // **Not the errno.** Moved, renamed and unplugged take the same next step, so naming which one
    // it was buys the reader nothing they can act on.
    expect(popup).not.toContain('ENOENT')
  })

  it('disables every button in the blocked half, and says why once, in the frame', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: [], problem: 'ENOENT: /songs', answered: false })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-home-songs-folder-line')).toBeTruthy())
    const line = screen.getByTestId('setup-home-songs-folder-line')
    expect(line.textContent).toBe('Songs folder cannot be read. Set it in Preferences.')
    // **`No songs yet.` is never shown when the app failed to look**: it would claim the folder is
    // empty on the strength of a read that did not happen.
    expect(screen.queryByTestId('setup-home-no-songs')).toBeNull()
    const newSong = screen.getByTestId('setup-new-song') as HTMLButtonElement
    expect(newSong.disabled).toBe(true)
    // The reason is the frame line, and the button points at it rather than restating it.
    expect(newSong.getAttribute('aria-describedby')).toBe(line.id)
    // The other half is untouched: one folder failing is not both.
    expect((screen.getByTestId('setup-new-gig') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('setup-home-no-gigs')).toBeTruthy()
  })

  it('does the same for the gigs folder, with its own words', async () => {
    localStorage.setItem(GIGS_FOLDER_KEY, '/gigs')
    folderReadable.mockResolvedValue({ readable: false, answered: true, problem: 'ENOENT: /gigs' })
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a']))
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-gigs-folder-popup')).toBeTruthy())
    expect(screen.getByTestId('setup-gigs-folder-popup-title').textContent).toBe(
      'The gigs folder cannot be read'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByTestId('setup-home-gigs-folder-line').textContent).toBe(
      'Gigs folder cannot be read. Set it in Preferences.'
    )
    // The list is not drawn over the line, even though the app remembers a gig at that path.
    expect(screen.queryByTestId('setup-gig-row-a')).toBeNull()
    for (const id of ['setup-new-gig']) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true)
      // One sentence per half, not the same sentence under each control it blocks.
      expect(screen.queryByTestId(`${id}-reason`)).toBeNull()
    }
  })

  it('says it once per launch, and keeps the half dead while the condition holds', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: [], problem: 'ENOENT: /songs', answered: false })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-folder-popup')).toBeTruthy())
    cleanup()
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-home-songs-folder-line')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-folder-popup')).toBeNull()
    expect((screen.getByTestId('setup-new-song') as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not also announce every song in it as vanished', async () => {
    // A read that failed is not an answer about what is in the folder. Before the listing said so,
    // an unplugged catalogue reported the folder AND all thirteen songs, on one arrival.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: [], problem: 'ENOENT: /songs', answered: false })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-folder-popup')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
  })

  // ── The list is the folder, and absent is not broken ──────────────────────────────────────
  //
  // Found by walking v0.24.0 on 2026-09-01. Twelve song files were removed from the catalogue and
  // Setup home drew twelve rows, each with an ENOENT beside it, under a red report saying twelve
  // song files would not read. The list was the stored library, which hydration only ever adds to.

  it('lists what the folder holds now, not what it was holding before', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('setup-song-row-vidas')).toBeNull()
  })

  // ── The vanished notice is a popup, and it fires on discovery ────────────────────────────
  //
  // Jorge's call, 2026-09-01. *The files were removed* is an event; *these files are absent* is a
  // state, and only the first is worth interrupting for. The standing line above the list was
  // reporting the state, every arrival, forever.

  it('names in a popup what is no longer in the catalogue, and nothing else', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    const named = screen.getByTestId('setup-songs-gone-list').textContent!
    expect(named).toContain('vidas.json')
    expect(named).not.toContain('duelo.json')
    // **Absent is not broken.** The wrong report is the one that fired on the walk.
    expect(screen.queryByTestId('setup-songs-unreadable-popup')).toBeNull()
  })

  it('says it once: the next arrival, with the same songs still gone, is silent', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    cleanup()
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    // Still gone, and still not in the list — the state is unchanged, only the interruption stops.
    expect(screen.queryByTestId('setup-song-row-vidas')).toBeNull()
  })

  it('says it again when another song goes', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    cleanup()
    listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: true })
  folderReadable.mockResolvedValue({ readable: true, answered: true, problem: null })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    const named = screen.getByTestId('setup-songs-gone-list').textContent!
    expect(named).toContain('duelo.json')
    // The one already announced is not announced twice, even in the company of a new one.
    expect(named).not.toContain('vidas.json')
  })

  it('announces a song that came back and went again', async () => {
    // The drive was unplugged, plugged back in, and unplugged again. Two events, two popups.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    cleanup()
    listSongsFolder.mockResolvedValue({
      files: ['duelo.json', 'vidas.json'],
      problem: null,
      answered: true,
    })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-vidas')).toBeTruthy())
    cleanup()
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    expect(screen.getByTestId('setup-songs-gone-list').textContent).toContain('vidas.json')
  })

  it('says nothing about a folder it could not look at', async () => {
    // No Electron, no answer. Nothing is missing from a folder nobody read, and recording that as
    // "nothing is gone" would re-announce every song the next time the catalogue *was* read.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    cleanup()
    listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: false })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    cleanup()
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
  })

  it('draws the whole emptied catalogue as one popup, never as a wall of broken rows', async () => {
    // The screen that produced this round, in miniature.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: true })
  folderReadable.mockResolvedValue({ readable: true, answered: true, problem: null })
    const twelve = Array.from({ length: 12 }, (_, i) => song(`song-${i}`))
    installLibrary(twelve)
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    for (const s of twelve) expect(screen.queryByTestId(`setup-song-row-${s.id}`)).toBeNull()
    expect(screen.queryByTestId('setup-songs-unreadable-popup')).toBeNull()
    // **The empty line says the frame is empty and nothing more** (2026-09-02). It used to hedge
    // — `Nothing in the catalogue now` when songs had just left — and the popup in front of it is
    // already saying what happened, at the moment it happened.
    expect(screen.getByTestId('setup-home-no-songs').textContent).toBe('No songs yet.')
  })

  it('the popup is dismissed and does not come back on this arrival', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy()
  })

  it('a file that is there and will not parse is not a file that went', async () => {
    // Two silences, two popups. This one is in the folder, so nothing vanished — and it is not in
    // the list either, so the frame reads empty.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({
      files: ['libertad.json'],
      problem: null,
      answered: true,
    })
    installLibrary([song('libertad')])
    setLibraryEntries([
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-unreadable-popup')).toBeTruthy())
    expect(screen.queryByTestId('setup-song-row-libertad')).toBeNull()
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    expect(screen.getByTestId('setup-home-no-songs')).toBeTruthy()
  })

  it('has no folder to complain about before a catalogue is chosen', async () => {
    await renderHome()
    expect(listSongsFolder).not.toHaveBeenCalled()
    expect(screen.queryByTestId('setup-songs-folder-problem')).toBeNull()
  })

  /**
   * **A gig row is its name and one way in** (Jorge, 2026-09-03, walking `v0.40.0`). It carried the
   * name, an `OPEN` badge, the full path over three lines and three labelled buttons; four gigs
   * made a wall. The shape is the song row's — name, state, and the marks a row's own actions wear.
   *
   * **`Locate…` and `Forget` both go** — the first has no destination under the single-`setup/`
   * ruling, and the second dropped a reference while leaving the folder. The bin deletes.
   */
  it('shows a gig as its name, a pencil and a bin, and no path', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a', '/gigs/b']))
    await renderHome()
    const row = screen.getByTestId('setup-gig-row-a')
    expect(row.textContent).toContain('a')
    expect(row.textContent).not.toContain('/gigs/a')
    const buttons = [...row.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Edit a', 'Delete a'])
    expect(row.textContent).not.toMatch(/locate|forget|setup/i)
  })

  /**
   * **The bin deletes the gig** (Jorge, 2026-09-03), and `Forget` is what it replaced. Dropping the
   * reference and leaving the folder is an action that looks like removal and is not — the same
   * shape as the trash can that came off the song library.
   */
  it('deletes the gig folder to the Trash, and then forgets where it was', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/setup/a', '/gigs/setup/b']))
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-a'))
    })
    expect(screen.getByTestId('setup-gig-delete-popup')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-confirm'))
    })
    expect(deleteGigFolder).toHaveBeenCalledWith('/gigs/setup/a')
    await waitFor(() => expect(getGigList()).toEqual(['/gigs/setup/b']))
  })

  /** Never silent: the folder is not touched until the dialog is answered. */
  it('deletes nothing until the dialog is confirmed', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/setup/a']))
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-a'))
    })
    expect(deleteGigFolder).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(deleteGigFolder).not.toHaveBeenCalled()
    expect(getGigList()).toEqual(['/gigs/setup/a'])
  })

  /**
   * **The dialog names what goes and what stays**, the way the song one does. What is lost is the
   * running order and the visuals; what cannot be reached is anything of the artist's, because the
   * single-`setup/` ruling puts it beside `setup/` rather than inside it.
   */
  it('names the folder that goes, and what the delete cannot reach', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/setup/a']))
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-a'))
    })
    const what = screen.getByTestId('setup-gig-delete-what').textContent!
    expect(what).toContain('/gigs/setup/a')
    expect(what).toMatch(/trash/i)
    expect(what).toMatch(/running order/i)
    expect(what).toMatch(/poster/i)
    expect(what).toMatch(/no song is touched/i)
  })

  /**
   * **The row outlives a failed delete.** Forgetting before the folder has gone would leave a
   * folder on disk that nothing lists — the shape the songs list already refuses.
   */
  it('keeps the row, and says why, when the delete fails', async () => {
    deleteGigFolder.mockResolvedValue({ ok: false, error: 'EPERM: operation not permitted' })
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/setup/a']))
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-a'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-delete-confirm'))
    })
    await waitFor(() =>
      expect(screen.getByTestId('setup-gig-delete-problem').textContent).toContain('EPERM')
    )
    expect(getGigList()).toEqual(['/gigs/setup/a'])
  })

  /** The pencil is what `Setup` did: open the folder, then into the gig flow. */
  it('opens the gig and enters the gig flow from the pencil', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a']))
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-gig-open-a'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/gig'))
  })

  // ── `New` goes straight into the flow, and nothing is written first ──────────────────────
  //
  // journey-setup step 6, 2026-09-02. `New song` used to open a form here, ask for a name and run
  // `bombista new` to write a skeleton into the catalogue. The step asks to *arrive in a flow*;
  // this kept you on the screen. And the skeleton it wrote carried one placeholder lyric line,
  // which is what made the walk fail at step 7.

  it('takes New straight into the song flow, and asks for nothing on the way', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    bombistaStagingDir.mockResolvedValue('/staging/_new')
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/song'))
    expect(getSongFlowRequest()!.staging).toBe('/staging/_new')
    // Making one, not editing one: the flow has no song until it ends.
    expect(getSongFlowRequest()!.songPath).toBeNull()
  })

  it('writes no song file before the flow, and never runs `bombista new`', async () => {
    // **The step 7 blocker, closed by removing its cause.** `promote` merges only the timeline
    // envelope into a song that already exists, so the words in the candidate never reached a
    // skeleton and the count guard refused. Nothing exists up front now, so promote creates.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    bombistaStagingDir.mockResolvedValue('/staging/_new')
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/song'))
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('asks for no name, because the flow reads it off the words that are handed over', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    bombistaStagingDir.mockResolvedValue('/staging/_new')
    await renderHome()
    expect(screen.queryByTestId('setup-new-song-id')).toBeNull()
    expect(screen.queryByTestId('setup-new-song-create')).toBeNull()
    expect(screen.getByTestId('setup-new-song').textContent).toBe('New')
  })

  it('shows New disabled with its reason when no songs folder is set — never absent', async () => {
    // **The defect the walk found, and the rule that replaced it.** With no control on screen
    // there is no evidence the app makes songs at all. See `GatedAction.tsx`.
    await renderHome()
    const button = screen.getByTestId('setup-new-song') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('setup-new-song-reason').textContent).toContain('no songs folder')
  })

  it('enters the same flow from a row, on the song that row is', async () => {
    // **Editing is the same flow.** Bombista's page 1 prefills every field from an SP JSON, which
    // is what lets one flow serve both — so a row does what `New` does, with a song.
    bombistaStagingDir.mockResolvedValue('/staging/duelo')
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-open-duelo'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/song'))
    const request = getSongFlowRequest()!
    // Its own staging directory, so a second pass over the same recording skips transcription.
    expect(bombistaStagingDir).toHaveBeenCalledWith('duelo')
    expect(request.staging).toBe('/staging/duelo')
    expect(request.songPath).toContain('duelo')
  })

  it('has no song panel inside a row any more', async () => {
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('subflow-flow')).toBeNull()
    expect(screen.queryByTestId('subflow-choose-words')).toBeNull()
  })

  /**
   * **`New gig` no longer opens a directory picker.** The first thing asked of somebody making
   * their first gig was where on their disk it should live — a filesystem decision, before the gig
   * had a venue or a date. It goes to the flow's step 1 now, where the gig is named.
   */
  it('takes New gig to the gig flow rather than to a folder picker', async () => {
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-gig'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/gig'))
    expect(chooseGigFolderPath).not.toHaveBeenCalled()
  })

  /**
   * **`Import` is dropped, and the inverted assertion is the point** (Jorge, 2026-09-02). It meant
   * *point at a gig folder elsewhere*, and under the ruling that the tools own one `setup/` folder
   * inside the gigs folder there are no gig folders to point at. This fails on the day it comes
   * back without the ruling changing.
   */
  it('offers no Import: there is no gig folder elsewhere to point at', async () => {
    await renderHome()
    expect(screen.queryByTestId('setup-import-gig')).toBeNull()
    expect(screen.getByTestId('setup-home-gigs').textContent).not.toMatch(/Import/)
  })

  it('shows New gig disabled with its reason outside Electron, never as a bare sentence', async () => {
    // The same defect, written a second time in the same round: a button replaced by a span.
    vi.resetModules()
    vi.doMock('./platform', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      hasGigFolderAccess: () => false,
    }))
    const { SetupHomeView: Fresh } = await import('./SetupHomeView')
    await act(async () => {
      render(<Fresh />)
    })
    const button = screen.getByTestId('setup-new-gig') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('setup-new-gig-reason').textContent).toContain('desktop app')
    vi.doUnmock('./platform')
    vi.resetModules()
  })


  // ── The row carries its own actions, in the marks the app already uses ───────────────────
  //
  // Walked on v0.34.0, 2026-09-02. `Edit` was a labelled button stacked under the title, which
  // made a two-line row out of a one-line fact and left nowhere for a second action to go.

  it('puts a pencil and a bin on the title’s own line', async () => {
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    const row = screen.getByTestId('setup-song-row-duelo')
    const edit = screen.getByTestId('setup-song-open-duelo')
    const bin = screen.getByTestId('setup-song-delete-duelo')
    // The mark is decoration to a screen reader; the button beside it carries the name.
    expect(edit.getAttribute('aria-label')).toBe('Edit duelo')
    expect(bin.getAttribute('aria-label')).toBe('Delete duelo')
    expect(edit.querySelector('svg')).toBeTruthy()
    expect(bin.querySelector('svg')).toBeTruthy()
    // Not a labelled button any more: the row is one line.
    expect(row.textContent).not.toContain('Edit')
  })

  // ── `manual only` is a property, not a warning ───────────────────────────────────────────
  //
  // A song with no timeline is a legitimate song: it goes in setlists and is advanced by hand,
  // which this app did before it did anything else.

  it('shows manual only on a song with no timeline', async () => {
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.getByTestId('setup-song-mode-duelo').textContent).toBe('manual only')
  })

  it('says nothing about the mode of a song that has a timeline', async () => {
    installLibrary([timedSong('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    expect(screen.queryByTestId('setup-song-mode-duelo')).toBeNull()
  })

  it('does not dress the mode as something being wrong', async () => {
    // `--state-warn` would say a complete song is missing something. It is a mode, like a key.
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    const mode = screen.getByTestId('setup-song-mode-duelo')
    expect(mode.className).toBe('setup-song-mode')
    expect(mode.textContent).not.toMatch(/not ready|missing|warning/i)
  })

  // ── Deleting a song, never silently ──────────────────────────────────────────────────────

  it('asks first, and names what goes and what stays', async () => {
    // The second fact is the one worth interrupting for: the thing somebody spent an afternoon on
    // is not what is at stake.
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    expect(screen.getByTestId('setup-song-delete-title').textContent).toBe('Delete duelo?')
    const what = screen.getByTestId('setup-song-delete-what').textContent!
    expect(what).toContain('duelo.json')
    expect(what).toMatch(/lyrics and your recordings stay/)
    expect(deleteSongFile).not.toHaveBeenCalled()
  })

  it('deletes only on the second press, and the list is the folder afterwards', async () => {
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-confirm'))
    })
    expect(deleteSongFile).toHaveBeenCalledTimes(1)
    expect(deleteSongFile.mock.calls[0]![0]).toContain('duelo.json')
    // Nothing removes a row by hand: the file is gone, so the next read does not list it.
    expect(screen.queryByTestId('setup-song-delete-popup')).toBeNull()
  })

  it('cancels without touching anything', async () => {
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(deleteSongFile).not.toHaveBeenCalled()
    expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy()
  })

  it('names the gigs a song is in, and still lets it go', async () => {
    // A gig's setlist keeps its ids and reports what it cannot resolve, so the record of the night
    // stays truthful either way. Blocking would make the catalogue hostage to its own history.
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/2026-09-12-bar-eduard']))
    readGigFolder.mockResolvedValue({
      folderPath: '/gigs/2026-09-12-bar-eduard',
      gigText: JSON.stringify({
        gigVersion: 1,
        id: 'g1',
        venue: { name: 'Bar Eduard' },
        setlist: ['duelo'],
      }),
      gigError: null,
      gigPresent: true,
      visualsText: null,
      visualsError: null,
      visualsPresent: false,
    })
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('setup-song-delete-uses')).toBeTruthy())
    expect(screen.getByTestId('setup-song-delete-uses').textContent).toContain('Bar Eduard')
    // Named, not blocked.
    expect((screen.getByTestId('setup-song-delete-confirm') as HTMLButtonElement).disabled).toBe(
      false
    )
  })

  it('says nothing about gigs when the song is in none', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a']))
    readGigFolder.mockResolvedValue({
      folderPath: '/gigs/a',
      gigText: JSON.stringify({ gigVersion: 1, id: 'g1', setlist: ['otro'] }),
      gigError: null,
      gigPresent: true,
      visualsText: null,
      visualsError: null,
      visualsPresent: false,
    })
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await waitFor(() => expect(screen.getByTestId('setup-song-delete-what')).toBeTruthy())
    expect(screen.queryByTestId('setup-song-delete-uses')).toBeNull()
  })

  // ── A deletion the app performed is not a disappearance ─────────────────────────────────
  //
  // Walked on v0.35.0, 2026-09-02. Jorge deleted `libertad` through the confirmation dialog, went
  // back to Backstage, and was told *One song is no longer in your catalogue: libertad.json* — a
  // fact he already had, five seconds old. The vanished popup is for files that go missing outside
  // the app, which is a thing the person needs to be told.

  it('never announces a song removed through the bin as vanished', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({
      files: ['duelo.json', 'vidas.json'],
      problem: null,
      answered: true,
    })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())

    // The bin, and the file leaves the folder with it.
    listSongsFolder.mockResolvedValue({ files: ['vidas.json'], problem: null, answered: true })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-confirm'))
    })
    expect(deleteSongFile).toHaveBeenCalled()

    // Back to Backstage. **This is the arrival that produced the defect.**
    cleanup()
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-vidas')).toBeTruthy())
    expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    expect(screen.queryByTestId('setup-song-row-duelo')).toBeNull()
  })

  it('does not announce it on any later arrival either', async () => {
    // The reference is gone from storage, so there is nothing left to rediscover as absent.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({ files: ['duelo.json'], problem: null, answered: true })
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: true })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-confirm'))
    })
    for (let visit = 0; visit < 3; visit++) {
      cleanup()
      await renderHome()
      await waitFor(() => expect(screen.getByTestId('setup-home-no-songs')).toBeTruthy())
      expect(screen.queryByTestId('setup-songs-gone-popup')).toBeNull()
    }
  })

  it('still announces a song that went missing outside the app', async () => {
    // The rule is about the app's own deletions and nothing else. Losing this is losing the one
    // thing that makes an unmounted catalogue visible.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    listSongsFolder.mockResolvedValue({
      files: ['duelo.json', 'vidas.json'],
      problem: null,
      answered: true,
    })
    installLibrary([song('duelo'), song('vidas')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())

    // Deleted through the bin; the other one taken out from under the app by something else.
    listSongsFolder.mockResolvedValue({ files: [], problem: null, answered: true })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-confirm'))
    })
    cleanup()
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-songs-gone-popup')).toBeTruthy())
    const named = screen.getByTestId('setup-songs-gone-list').textContent!
    expect(named).toContain('vidas.json')
    expect(named).not.toContain('duelo.json')
  })

  it('says why a delete did not happen, in the dialog that asked for it', async () => {
    deleteSongFile.mockResolvedValue({ ok: false, error: 'EPERM: operation not permitted' })
    installLibrary([song('duelo')])
    await renderHome()
    await waitFor(() => expect(screen.getByTestId('setup-song-row-duelo')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-duelo'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-song-delete-confirm'))
    })
    expect(screen.getByTestId('setup-song-delete-problem').textContent).toContain('EPERM')
    expect(screen.getByTestId('setup-song-delete-popup')).toBeTruthy()
  })

  it('leads to preferences, which is where the folders went', async () => {
    await renderHome()
    expect(screen.getByTestId('setup-home-preferences')).toBeTruthy()
  })

  it('is called Backstage, and keeps the rule under the title', async () => {
    // It names the moment rather than the machine: the room you are in before the show. The rule
    // separates navigation from content, and this screen has navigation — the kickoff screen,
    // which lost its rule, is the exception.
    await renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Backstage')
    expect(document.querySelector('.first-run-screen')).toBeNull()
    expect(document.querySelector('.setup-home-screen .songs-top-bar')).toBeTruthy()
  })
})
