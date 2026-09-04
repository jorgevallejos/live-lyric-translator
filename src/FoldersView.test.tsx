/** @vitest-environment jsdom */
/**
 * The screen that closes round E4's hole: a static shape's image, a static video and a contact QR
 * resolve through the same link table song media does, and the only way into that table was the
 * song library's *Locate video…* button, which only ever offers a song's own declared media. So a
 * `visuals.json` naming the logo resolved to nothing and the wall lost it, with nothing saying why.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import type { LibrarySong } from './setlistStore'
import { installLibrary } from './testSupport/library'

const chooseFolderPath = vi.fn()
const fileExists = vi.fn()

const describeDisplays = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
  canRunBombista: () => false,
  canHostTools: () => false,
  runBombista: vi.fn(),
  bombistaVersion: () => Promise.resolve({ present: false, version: null }),
  locateBombista: () =>
    Promise.resolve({ command: 'bombista', source: 'unresolved' as const, searched: [] }),
  bombistaStagingDir: vi.fn(),
  openTool: vi.fn(),
  openBombistaReview: vi.fn(),
  closeTool: vi.fn(),
  chooseFilePath: vi.fn(),
  describeDisplays: (...a: unknown[]) => describeDisplays(...a),
  hasFolderPicker: () => true,
  hasGigFolderAccess: () => true,
  chooseFolderPath: (...a: unknown[]) => chooseFolderPath(...a),
  fileExists: (...a: unknown[]) => fileExists(...a),
  readGigFolder: vi.fn(),
  writeGigFile: vi.fn(),
  validateSongForPerformance: vi.fn(),
  readSongFileText: vi.fn(),
}))

const { FoldersView } = await import('./FoldersView')
const { getGigsFolder, getVisualsFolder, getSongsFolder, setVisualsFolder } =
  await import('./contentFolders')
const { KEY_VISUALS_BROADCAST } = await import('./visualsBroadcast')
const { GIG_FOLDER_KEY } = await import('./gigFolderStore')

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
})

const FOLDER = '/gigs/setup/k3f9x2abcd'

function song(id: string, title: string): LibrarySong {
  return {
    id,
    title,
    items: [{ languages: { es: 'línea' } }],
  } as LibrarySong
}

/**
 * **A room that says what a song plays.** Since *the song holds no media* (Jorge, 2026-09-03) the
 * video's name lives in `visuals.json`, so this screen — the one that lists every name the files
 * ask for — reads it from there.
 */
function broadcastRoomWithSongVideo(): void {
  localStorage.setItem(GIG_FOLDER_KEY, FOLDER)
  localStorage.setItem(
    KEY_VISUALS_BROADCAST,
    JSON.stringify({
      folderPath: FOLDER,
      gigId: 'k3f9x2abcd',
      visuals: {
        visualsVersion: 1,
        gigId: 'k3f9x2abcd',
        shapes: [{ id: 'v-1', name: 'Frame', layer: { type: 'song-video' } }],
        songVisuals: {
          defaults: { 'song-video': ['v-1'] },
          songs: {},
          assets: { tragedia: { 'v-1': 'tragedia.mp4' } },
        },
      },
    })
  )
}

/** A room with a logo, exactly the shape E4 left unresolvable. */
function broadcastRoomWithLogo(): void {
  localStorage.setItem(GIG_FOLDER_KEY, FOLDER)
  localStorage.setItem(
    KEY_VISUALS_BROADCAST,
    JSON.stringify({
      folderPath: FOLDER,
      gigId: 'k3f9x2abcd',
      visuals: {
        visualsVersion: 1,
        gigId: 'k3f9x2abcd',
        shapes: [
          { id: 'logo', name: 'Logo', layer: { type: 'image', src: 'chango-pepper-logo.png' } },
        ],
        songVisuals: { defaults: {}, songs: {} },
      },
    })
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  fileExists.mockResolvedValue(true)
  describeDisplays.mockResolvedValue({ count: 1, displays: [], fingerprint: '1728x1117@2*' })
  installLibrary([song('tragedia', 'Tragedia')])
})

afterEach(cleanup)

describe('the folders screen', () => {
  it('shows all three folders as unset to begin with', async () => {
    broadcastRoomWithSongVideo()
    render(<FoldersView />)
    expect(screen.getByTestId('folders-songs-value').textContent).toContain('Not set')
    expect(screen.getByTestId('folders-gigs-value').textContent).toContain('Not set')
    expect(screen.getByTestId('folders-media-value').textContent).toContain('Not set')
    await waitFor(() => expect(screen.getByTestId('folders-source-tragedia.mp4')).toBeTruthy())
  })

  // **Preferences is where a setting is changed, never where you find out it exists.** The gigs
  // root was asked for on first run and then had nowhere to be changed at all.
  it('remembers a chosen gigs folder', async () => {
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    render(<FoldersView />)
    await act(async () => {
      screen.getByTestId('folders-gigs').querySelector('button')!.click()
    })
    await waitFor(() => expect(getGigsFolder()).toBe('/vault/gigs'))
    expect(screen.getByTestId('folders-gigs-value').textContent).toContain('/vault/gigs')
  })

  it('remembers a chosen media folder', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs/video')
    render(<FoldersView />)
    await act(async () => {
      screen.getByTestId('folders-media').querySelector('button')!.click()
    })
    await waitFor(() => expect(getVisualsFolder()).toBe('/vault/songs/video'))
    expect(screen.getByTestId('folders-media-value').textContent).toContain('/vault/songs/video')
  })

  it('remembers a chosen songs folder, and answers nothing about media on its behalf', async () => {
    // **Changed twice.** It once asserted null, then `<songs>/audio` when the media folder was
    // defaulted there. The default is gone (2026-09-01): audio and video are not one thing, and
    // defaulting made the catalogue load-bearing for media a user may keep anywhere. Choosing a
    // catalogue answers the catalogue question and no other.
    chooseFolderPath.mockResolvedValue('/vault/songs')
    render(<FoldersView />)
    await act(async () => {
      screen.getByTestId('folders-songs').querySelector('button')!.click()
    })
    await waitFor(() => expect(getSongsFolder()).toBe('/vault/songs'))
    expect(getVisualsFolder()).toBeNull()
    expect(screen.getByTestId('folders-media-value').textContent).toContain('Not set')
  })

  it('lists the logo the room names — the file that had no screen at all', async () => {
    broadcastRoomWithLogo()
    render(<FoldersView />)
    await waitFor(() =>
      expect(screen.getByTestId('folders-source-chango-pepper-logo.png')).toBeTruthy()
    )
    expect(
      screen.getByTestId('folders-source-chango-pepper-logo.png').textContent
    ).toContain('Logo — image shape')
  })

  it('says a name has nowhere to resolve from when no media folder is set', async () => {
    broadcastRoomWithLogo()
    render(<FoldersView />)
    await waitFor(() =>
      expect(screen.getByTestId('folders-status-chango-pepper-logo.png').textContent).toContain('No media folder, and no link')
    )
  })

  it('says it found the logo once the media folder holds it', async () => {
    broadcastRoomWithLogo()
    setVisualsFolder('/vault/assets')
    render(<FoldersView />)
    await waitFor(() =>
      expect(screen.getByTestId('folders-status-chango-pepper-logo.png').textContent).toContain('Found in the media folder')
    )
    expect(fileExists).toHaveBeenCalledWith('/vault/assets/chango-pepper-logo.png')
  })

  it('says a name is not there when the folder does not hold it', async () => {
    broadcastRoomWithLogo()
    setVisualsFolder('/vault/assets')
    fileExists.mockResolvedValue(false)
    render(<FoldersView />)
    await waitFor(() =>
      expect(screen.getByTestId('folders-status-chango-pepper-logo.png').textContent).toContain('Not there')
    )
  })
})
