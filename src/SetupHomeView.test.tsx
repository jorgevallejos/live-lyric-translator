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
import { SONGS_FOLDER_KEY } from './contentFolders'
import { setLibraryEntries, type LibrarySong } from './setlistStore'

const chooseGigFolderPath = vi.fn()
const runBombista = vi.fn()
const readSongFileText = vi.fn()
const readGigFolder = vi.fn()

vi.mock('./platform', () => ({
  hasGigFolderAccess: () => true,
  canRunBombista: () => true,
  canHostTools: () => false,
  chooseGigFolderPath: (...a: unknown[]) => chooseGigFolderPath(...a),
  runBombista: (...a: unknown[]) => runBombista(...a),
  readSongFileText: (...a: unknown[]) => readSongFileText(...a),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  writeGigFile: () => Promise.resolve({ ok: true }),
  fileExists: () => Promise.resolve(true),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  bombistaVersion: () => Promise.resolve({ present: true, version: 'bombista 1.1.0' }),
  bombistaStagingDir: vi.fn(),
  openBombistaReview: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
}))

function song(id: string): LibrarySong {
  return { id, title: id, items: [{ languages: { es: 'línea' } }] } as LibrarySong
}

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  // The resolved library is an in-memory cache and outlives localStorage.clear(), so a song made
  // in one test would otherwise still be listed in the next.
  setLibraryEntries([])
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

  it('keeps a broken song listed, visibly broken', async () => {
    // Hiding it would hide the problem, and the fix is in the songs folder rather than here.
    installLibrary([song('ok')])
    setLibraryEntries([
      { ref: { id: 'ok', path: 'ok.json' }, song: song('ok') },
      { ref: { id: 'libertad', path: 'libertad.json' }, error: '24 lines against 20' },
    ])
    await renderHome()
    expect(screen.getByTestId('setup-song-broken-libertad').textContent).toContain('24 lines')
  })

  it('forgets a gig row without touching any other', async () => {
    localStorage.setItem(GIG_LIST_KEY, JSON.stringify(['/gigs/a', '/gigs/b']))
    await renderHome()
    const row = screen.getByTestId('setup-gig-row-a')
    const forget = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Forget')!
    await act(async () => {
      fireEvent.click(forget)
    })
    expect(getGigList()).toEqual(['/gigs/b'])
  })

  it('says where a new song will land, and never asks for a path', async () => {
    // Bombista's output lands in the songs folder under the canonical name. The decision is
    // removed rather than explained: a song is played at many gigs and there is one copy of it.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    fireEvent.change(screen.getByTestId('setup-new-song-id'), { target: { value: 'nuevo' } })
    expect(screen.getByTestId('setup-new-song-form').textContent).toContain('nuevo.json')
  })

  it('makes a song by running bombista new, and it appears in the list', async () => {
    // **The flow ends with the song appearing in the list, and with nothing else.** No status, no
    // badge, no completion label — see the readiness rule.
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    runBombista.mockResolvedValue({ status: 'ok', output: 'wrote: /songs/nuevo.json', code: 0 })
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    fireEvent.change(screen.getByTestId('setup-new-song-id'), { target: { value: 'nuevo' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song-create'))
    })
    expect(runBombista).toHaveBeenCalledWith('new', ['nuevo', '-o', '/songs/nuevo.json'])
    await waitFor(() => expect(screen.getByTestId('setup-song-row-nuevo')).toBeTruthy())
    expect(screen.getByTestId('setup-song-row-nuevo').textContent).not.toMatch(/ready|complete|done/i)
  })

  it('will not make a song with no songs folder set, and says where to set one', async () => {
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    expect(screen.getByTestId('setup-new-song-no-folder').textContent).toContain('preferences')
    expect(runBombista).not.toHaveBeenCalled()
  })

  it('reports a refusal from bombista instead of pretending a song was made', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/songs')
    runBombista.mockResolvedValue({
      status: 'failed',
      output: '/songs/nuevo.json: already exists — refusing to overwrite',
      code: 1,
    })
    await renderHome()
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song'))
    })
    fireEvent.change(screen.getByTestId('setup-new-song-id'), { target: { value: 'nuevo' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-new-song-create'))
    })
    expect(screen.getByTestId('setup-new-song-problem').textContent).toContain('already exists')
    expect(screen.queryByTestId('setup-song-row-nuevo')).toBeNull()
  })

  it('leads to preferences, which is where the folders went', async () => {
    await renderHome()
    expect(screen.getByTestId('setup-home-preferences')).toBeTruthy()
  })
})
