/** @vitest-environment jsdom */
/**
 * **Choosing tonight's gig** (Jorge, 2026-09-05).
 *
 * A `Choose` button on Standby's `GIG` column, above `Setup`, shown **only when there is at least
 * one gig**, opening a full-screen picker — the same pattern `Setlist` is for the `SONG` column.
 *
 * **This supersedes *the gig name itself is the control*** (03/09), and the play buttons come off
 * Backstage's gig rows with it: nothing opens a gig for performance from the room where gigs are
 * made. Those rows are covered in `SetupHomeView.test.tsx`.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { GigsView, sortNewestFirst, type GigChoice } from './GigsView'
import { ensureStorage } from './testSupport/storage'
import { installRequiredFolders } from './testSupport/folders'
import { installLibrary } from './testSupport/library'
import { getRememberedGigFolder, rememberGigFolder } from './gigFolderStore'
import type { LibrarySong } from './setlistStore'

const listGigsFolder = vi.fn()
const readGigFolder = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasGigFolderAccess: () => true,
  canRunBombista: () => false,
  canHostTools: () => false,
  listGigsFolder: (...a: unknown[]) => listGigsFolder(...a),
  readGigFolder: (...a: unknown[]) => readGigFolder(...a),
  listSongsFolder: () => Promise.resolve({ files: [], problem: null, answered: true }),
  folderReadable: () => Promise.resolve({ readable: true, answered: true, problem: null }),
  writeGigFile: () => Promise.resolve({ ok: true }),
  fileExists: () => Promise.resolve(true),
  validateSongForPerformance: () => Promise.resolve({ status: 'skipped', reason: 'not run' }),
  describeDisplays: () => Promise.resolve({ count: 1, displays: [], fingerprint: 'f' }),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
}))

beforeAll(() => {
  ensureStorage()
  vi.stubGlobal(
    'WebSocket',
    vi.fn().mockImplementation(function () {
      return {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
    })
  )
})

function song(id: string): LibrarySong {
  return { id, title: id, items: [{ languages: { es: 'línea' } }] } as LibrarySong
}

/**
 * Gigs on disk, each with its own date, so *newest first* has something to sort. `undefined` is a
 * `gig.json` written by hand with no date — a state the app never produces and the file allows.
 */
function installGigs(gigs: { id: string; date?: string; venue?: string }[]) {
  installRequiredFolders('/vault/songs', '/gigs')
  listGigsFolder.mockResolvedValue({
    folders: gigs.map((g) => g.id),
    problem: null,
    answered: true,
  })
  readGigFolder.mockImplementation((folderPath: string) => {
    const id = folderPath.split('/').filter(Boolean).pop() ?? ''
    const gig = gigs.find((g) => g.id === id)
    return Promise.resolve({
      folderPath,
      gigText: JSON.stringify({
        gigVersion: 1,
        id,
        ...(gig?.date === undefined ? {} : { date: gig.date }),
        ...(gig?.venue === undefined ? {} : { venue: { name: gig.venue } }),
      }),
      gigError: null,
      gigPresent: true,
      visualsText: null,
      visualsError: null,
      visualsPresent: false,
    })
  })
}

function noGigsFolderAtAll() {
  installRequiredFolders('/vault/songs', '/gigs')
  listGigsFolder.mockResolvedValue({ folders: [], problem: null, answered: true })
  readGigFolder.mockResolvedValue({
    folderPath: '/gigs/setup/x',
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  })
}

async function renderStandby() {
  window.location.hash = '#/'
  sessionStorage.setItem('liveLyricLaunched', '1')
  installLibrary([song('duelo')])
  ;(window as unknown as { electronAPI?: unknown }).electronAPI = {
    isProjectionOpen: vi.fn().mockResolvedValue(false),
    onProjectionOpened: vi.fn(() => vi.fn()),
    onProjectionClosed: vi.fn(() => vi.fn()),
  }
  await act(async () => {
    render(<App initialHash="#/" />)
  })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  window.location.hash = '#/'
})

afterEach(() => {
  cleanup()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

// ── Newest first, and what an undated gig does ─────────────────────────────────────────────

describe('the order the picker lists gigs in', () => {
  const choice = (label: string, date: string | null): GigChoice => ({
    path: `/gigs/setup/${label}`,
    label,
    date,
  })

  it('puts the newest date first', () => {
    const sorted = sortNewestFirst([
      choice('may', '2026-05-16'),
      choice('september', '2026-09-12'),
      choice('june', '2026-06-01'),
    ])
    expect(sorted.map((c) => c.label)).toEqual(['september', 'june', 'may'])
  })

  it('puts an undated gig last, because an undated gig cannot be tonight', () => {
    // Nothing is written until the date and the venue are both answered, so this is a `gig.json`
    // someone wrote by hand. It is a real gig and it is not a candidate for *newest*.
    const sorted = sortNewestFirst([
      choice('handmade', null),
      choice('may', '2026-05-16'),
    ])
    expect(sorted.map((c) => c.label)).toEqual(['may', 'handmade'])
  })

  it('breaks a tie by label, so two gigs on one night have a stable order', () => {
    const sorted = sortNewestFirst([
      choice('zaal', '2026-05-16'),
      choice('atelier', '2026-05-16'),
    ])
    expect(sorted.map((c) => c.label)).toEqual(['atelier', 'zaal'])
  })
})

// ── `Choose` on Standby ────────────────────────────────────────────────────────────────────

describe('the GIG column', () => {
  it('draws no Choose from nothing, and the only control is Setup', async () => {
    // **From nothing there is no button and no empty picker.** The column says `No gig`, and
    // `Setup` is what says *go make one* without a screen to say it in.
    noGigsFolderAtAll()
    await renderStandby()
    await waitFor(() => expect(screen.getByTestId('control-gig-value').textContent).toBe('No gig'))
    expect(screen.queryByTestId('control-gig-choose')).toBeNull()
    expect(screen.getByRole('button', { name: 'Setup' })).toBeTruthy()
  })

  it('draws Choose once there is a gig to choose', async () => {
    installGigs([{ id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' }])
    await renderStandby()
    await waitFor(() => expect(screen.getByTestId('control-gig-choose')).toBeTruthy())
  })

  it('puts Choose above Setup, in the slot every other column already uses', async () => {
    // The 03/09 reasoning reverses on its own terms: **a button in a known position is the easier
    // target in a dark room**, not the harder one.
    installGigs([{ id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' }])
    await renderStandby()
    await waitFor(() => expect(screen.getByTestId('control-gig-choose')).toBeTruthy())
    const buttons = [...document.querySelectorAll('.control-setup-section')]
      .find((s) => s.textContent?.includes('Gig'))!
      .querySelectorAll('button')
    expect([...buttons].map((b) => b.textContent)).toEqual(['Choose', 'Setup'])
  })

  it('is named for opening a list, and not for an action it does not take', async () => {
    // `Play` already means a transport action in this suite and sits two columns from `Arm`;
    // `Select` names the mechanism. `Choose` is the app's own word for opening a picker.
    installGigs([{ id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' }])
    await renderStandby()
    await waitFor(() => expect(screen.getByTestId('control-gig-choose')).toBeTruthy())
    const column = [...document.querySelectorAll('.control-setup-section')].find((s) =>
      s.textContent?.includes('Gig')
    )!
    expect(column.textContent).not.toMatch(/\bPlay\b|\bSelect\b/)
  })

  it('opens the picker', async () => {
    installGigs([{ id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' }])
    await renderStandby()
    await waitFor(() => expect(screen.getByTestId('control-gig-choose')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('control-gig-choose'))
    })
    await waitFor(() => expect(window.location.hash).toBe('#/gigs'))
  })
})

// ── The picker itself ──────────────────────────────────────────────────────────────────────

describe('the gig picker', () => {
  async function renderPicker() {
    await act(async () => {
      render(<GigsView />)
    })
  }

  it('is one big row per gig, newest first, labelled from the file', async () => {
    installGigs([
      { id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' },
      { id: 'bbbbbbbbbb', date: '2026-09-12', venue: 'Bar Eduard' },
    ])
    await renderPicker()
    await waitFor(() => expect(screen.getByTestId('gigs-picker-row-bbbbbbbbbb')).toBeTruthy())
    const rows = [...screen.getByTestId('gigs-picker').querySelectorAll('button.songs-song-btn')]
    expect(rows.map((r) => r.textContent)).toEqual([
      '2026-09-12 · Bar Eduard',
      '2026-05-16 · Bom Festival',
    ])
  })

  it('chooses through openGigFolder and lands back on Standby', async () => {
    // **Two doors performing one act is fine; two mechanisms is how they drift.** The pencil on
    // Backstage goes through the same function, which is the whole memory of which gig is open.
    installGigs([
      { id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' },
      { id: 'bbbbbbbbbb', date: '2026-09-12', venue: 'Bar Eduard' },
    ])
    rememberGigFolder('/gigs/setup/aaaaaaaaaa')
    await renderPicker()
    await waitFor(() => expect(screen.getByTestId('gigs-picker-row-bbbbbbbbbb')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('gigs-picker-row-bbbbbbbbbb'))
    })
    await waitFor(() => expect(getRememberedGigFolder()).toBe('/gigs/setup/bbbbbbbbbb'))
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })

  it('asks nothing on the way, and takes a gig whose setup is not finished', async () => {
    // Readiness is reported at arming, which is where the gate is. Blocking selection here would
    // stop Jorge looking at his own gig.
    installGigs([{ id: 'aaaaaaaaaa' }])
    await renderPicker()
    await waitFor(() => expect(screen.getByTestId('gigs-picker-row-aaaaaaaaaa')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTestId('gigs-picker-row-aaaaaaaaaa'))
    })
    await waitFor(() => expect(getRememberedGigFolder()).toBe('/gigs/setup/aaaaaaaaaa'))
  })

  it('goes back to Standby without choosing anything', async () => {
    installGigs([{ id: 'aaaaaaaaaa', date: '2026-05-16', venue: 'Bom Festival' }])
    rememberGigFolder('/gigs/setup/zzzzzzzzzz')
    await renderPicker()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    })
    expect(window.location.hash).toBe('#/')
    expect(getRememberedGigFolder()).toBe('/gigs/setup/zzzzzzzzzz')
  })
})
