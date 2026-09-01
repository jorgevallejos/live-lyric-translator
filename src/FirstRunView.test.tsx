/**
 * **First run replaces the main screen on launch.**
 *
 * The requirement is positional as much as behavioural: reset, launch, and the first thing on
 * screen is the folder request. If the hydration screen or the control view appears first, it is
 * not done — so these tests render `App`, not the view, and assert what is and is not there.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { ensureStorage } from './testSupport/storage'
import { GIGS_FOLDER_KEY, SONGS_FOLDER_KEY } from './contentFolders'

const chooseFolderPath = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasFolderPicker: () => true,
  chooseFolderPath: (...a: unknown[]) => chooseFolderPath(...a),
}))

const { default: App } = await import('./App')

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  window.location.hash = '#/'
})

async function launch() {
  await act(async () => {
    render(<App initialHash="#/" />)
  })
}

describe('first run', () => {
  it('is the first thing on screen when neither folder is set', async () => {
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
    // Not behind the hydration screen, and not behind the control view.
    expect(screen.queryByTestId('song-library-loading')).toBeNull()
    expect(screen.queryByTestId('performance-state-label')).toBeNull()
  })

  it('still asks when only the songs folder is set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/vault/songs')
  })

  it('still asks when only the gigs folder is set', async () => {
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  it('never asks again once both are set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.queryByTestId('first-run')).toBeNull()
  })

  it('leaves the screen the moment the second folder is chosen', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    await waitFor(() => expect(screen.queryByTestId('first-run')).toBeNull())
    expect(localStorage.getItem(GIGS_FOLDER_KEY)).toBe('/vault/gigs')
  })

  it('stays while only one has been chosen', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/vault/songs')
  })

  it('remembers a cancelled picker as no choice at all', async () => {
    chooseFolderPath.mockResolvedValue(null)
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(localStorage.getItem(SONGS_FOLDER_KEY)).toBeNull()
  })

  // ── Two questions, not one asked twice ────────────────────────────────────────────────────

  it('asks two different questions, named by what they find', async () => {
    // Both were phrased "choose a folder", which is exactly why the second read as redundant. One
    // finds a catalogue; the other finds a body of work.
    await launch()
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Where your songs live')
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Your catalogue')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Where your gigs live')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Your body of work')
  })

  it('says nothing is created, because nothing is', async () => {
    await launch()
    expect(screen.getByTestId('first-run-lede').textContent).toMatch(/[Nn]othing is created/)
  })

  it('never says tramoya — that word is the repo’s, not a user’s', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run').textContent!.toLowerCase()).not.toContain('tramoya')
  })

  // ── It shows the shape rather than explaining it ──────────────────────────────────────────

  it('shows nothing until there is something to show', async () => {
    await launch()
    expect(screen.queryByTestId('first-run-shape')).toBeNull()
  })

  it('draws the catalogue’s half as soon as the catalogue is answered', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    const shape = screen.getByTestId('first-run-shape').textContent!
    expect(shape).toContain('songs/')
    expect(shape).toContain('song-performance/')
    // The gig half is not drawn yet: the shape is the answers so far, not a diagram of the design.
    expect(shape).not.toContain('setup/')
  })

  it('draws the gig half, ownership and all, when the gigs folder is the one already set', async () => {
    // Arriving with the catalogue still unanswered: the half that is known is the half drawn.
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    const shape = screen.getByTestId('first-run-shape').textContent!
    expect(shape).toContain('gigs/')
    expect(shape).toContain('setup/')
    expect(shape).toContain('gig.json and visuals.json')
    expect(shape).toContain('the poster, the contract, the debrief')
    expect(shape).not.toContain('song-performance/')
  })

  it('never blocks the projection window, which has nothing to ask for', async () => {
    await act(async () => {
      render(<App initialHash="#/projection" />)
    })
    expect(screen.queryByTestId('first-run')).toBeNull()
  })
})
