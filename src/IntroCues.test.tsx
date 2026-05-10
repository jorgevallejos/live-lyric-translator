/** @vitest-environment jsdom */
/**
 * Conditional rendering of intro_cues on the first performer screen.
 * Three cases: cue present, cue absent, cue is empty string in storage.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import {
  setSongLines,
  setSongIndex,
  setCurrentSongId,
  setProjectionLanguage,
  setSingingLanguage,
} from './songState'
import type { SongItem } from './songState'
import { createInitialSnapshot, saveSetlistStore, type LibrarySong } from './setlistStore'

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
    return {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
  }))
})

const LINES: SongItem[] = [
  { languages: { es: 'Hola', en: 'Hello' } },
  { languages: { es: 'Mundo', en: 'World' } },
]

function setupArmedFirstScreen(song: LibrarySong) {
  sessionStorage.setItem('liveLyricLaunched', '1')
  sessionStorage.setItem('liveLyricPerformanceArmed', '1')
  saveSetlistStore(createInitialSnapshot([song]))
  setSongLines(song.items)
  setSongIndex(-1)
  setCurrentSongId(song.id)
  setProjectionLanguage('en')
  setSingingLanguage('es')
  window.location.hash = '#/';
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isProjectionOpen: vi.fn().mockResolvedValue(true),
    onProjectionOpened: vi.fn(() => vi.fn()),
    onProjectionClosed: vi.fn(() => vi.fn()),
    openProjection: vi.fn().mockResolvedValue(undefined),
    closeProjection: vi.fn().mockResolvedValue(undefined),
  }
}

const WAIT_TIMEOUT = 3000

describe('intro_cues on first performer screen', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = '#/'
  })

  it('shows intro_cues text when the song has the field', async () => {
    setupArmedFirstScreen({ id: 'song-a', title: 'Song A', items: LINES, intro_cues: 'The leap of faith' })
    render(<App initialHash="#/" />)

    await waitFor(() => {
      expect(screen.getByText('The leap of faith')).toBeTruthy()
    }, { timeout: WAIT_TIMEOUT })
    expect(document.querySelector('.control-intro-cues')).toBeTruthy()
    expect(screen.getByText(/Press Next to reveal the first line/)).toBeTruthy()
  })

  it('shows nothing extra when the song has no intro_cues field', async () => {
    setupArmedFirstScreen({ id: 'song-b', title: 'Song B', items: LINES })
    render(<App initialHash="#/" />)

    await waitFor(() => {
      expect(screen.getByText(/Press Next to reveal the first line/)).toBeTruthy()
    }, { timeout: WAIT_TIMEOUT })
    expect(document.querySelector('.control-intro-cues')).toBeNull()
  })

  it('shows nothing extra when intro_cues is an empty string in storage', async () => {
    setupArmedFirstScreen({ id: 'song-c', title: 'Song C', items: LINES, intro_cues: '' })
    render(<App initialHash="#/" />)

    await waitFor(() => {
      expect(screen.getByText(/Press Next to reveal the first line/)).toBeTruthy()
    }, { timeout: WAIT_TIMEOUT })
    expect(document.querySelector('.control-intro-cues')).toBeNull()
  })
})
