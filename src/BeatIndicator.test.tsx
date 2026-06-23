/** @vitest-environment jsdom */
/**
 * Beat indicator integration tests — performer view.
 *
 * The performer view now uses BeatCircle (§7 shared component) for the non-video
 * armed screen. Tests verify integration: clock starts on arm, count-in phase
 * renders correctly, transitions to running phase, auto-advance fires, etc.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, within, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import App from './App'
import {
  setSongLines,
  setSongIndex,
  setBlank,
  setCurrentSongId,
  setCurrentSongTitle,
  setProjectionLanguage,
  setSingingLanguage,
  getSongIndex,
} from './songState'
import type { SongItem } from './songState'
import { SONGS } from './songs'
import { createInitialSnapshot, saveSetlistStore } from './setlistStore'

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

const VALID_LINES: SongItem[] = [
  { languages: { es: 'Hola', en: 'Hello' } },
  { languages: { es: 'Mundo', en: 'World' } },
]

const WAIT_TIMEOUT = 3000

function clearStorage() {
  sessionStorage.clear()
  localStorage.clear()
}

function getArmButton() {
  const main = screen.getByRole('main')
  return within(main).getByRole('button', { name: 'Arm' })
}

function setupControlViewWithReadinessPassing() {
  sessionStorage.setItem('liveLyricLaunched', '1')
  sessionStorage.removeItem('liveLyricPerformanceArmed')
  setSongLines(VALID_LINES)
  setSongIndex(-1)
  setBlank(true)
  setCurrentSongId('duelo')
  setProjectionLanguage('en')
  setSingingLanguage('es')
  window.location.hash = '#/'
  const mockApi = {
    isProjectionOpen: vi.fn().mockResolvedValue(true),
    onProjectionOpened: vi.fn(() => vi.fn()),
    onProjectionClosed: vi.fn(() => vi.fn()),
    openProjection: vi.fn().mockResolvedValue(undefined),
    closeProjection: vi.fn().mockResolvedValue(undefined),
  }
  ;(window as unknown as { electronAPI?: unknown }).electronAPI = mockApi
  return mockApi
}

describe('Beat indicator (count-in + running) — performer view (BeatCircle)', () => {
  function installLibraryWithTempo(): void {
    const line: SongItem = { languages: { es: 't', en: 't' } }
    const songs = SONGS.map((s) => ({
      id: s.id,
      title: s.title,
      items: [line],
      ...(s.id === 'duelo' ? { tempo: { bpm: 120, numerator: 4, denominator: 4, countInBars: 1 } } : {}),
    }))
    saveSetlistStore(createInitialSnapshot(songs))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearStorage()
    installLibraryWithTempo()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('shows no beat circle when song has no tempo', async () => {
    setupControlViewWithReadinessPassing()
    setCurrentSongId('pimiento')
    setCurrentSongTitle('Pimiento')
    render(<App initialHash="#/" />)

    await waitFor(() => {
      expect(screen.getByTestId('performance-state-label').textContent).toBe('Performance: Ready to Arm')
    }, { timeout: WAIT_TIMEOUT })
    await act(async () => { fireEvent.click(getArmButton()) })

    expect(screen.queryByTestId('beat-circle')).toBeNull()
  })

  it('shows BeatCircle in count-in mode when armed with a tempo song', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('performance-state-label').textContent).toBe('Performance: Ready to Arm')

    await act(async () => { fireEvent.click(getArmButton()) })
    act(() => { vi.advanceTimersByTime(50) })

    expect(screen.getByTestId('beat-circle')).toBeTruthy()
    expect(screen.getByTestId('beat-circle-count-in')).toBeTruthy()
  })

  it('count-in shows beat 1 at start (downbeat class applied)', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    await act(async () => { fireEvent.click(getArmButton()) })
    act(() => { vi.advanceTimersByTime(50) })

    const numEl = screen.getByTestId('beat-circle-beat-number')
    expect(numEl.textContent).toBe('1')
    expect(numEl.classList.contains('beat-circle-downbeat')).toBe(true)
  })

  it('count-in advances to beat 2 after one beat duration (500ms at 120bpm)', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    await act(async () => { fireEvent.click(getArmButton()) })
    act(() => { vi.advanceTimersByTime(550) })

    const numEl = screen.getByTestId('beat-circle-beat-number')
    expect(numEl.textContent).toBe('2')
    expect(numEl.classList.contains('beat-circle-downbeat')).toBe(false)
  })

  it('shows 4 dots matching the meter (4/4)', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    await act(async () => { fireEvent.click(getArmButton()) })
    act(() => { vi.advanceTimersByTime(50) })

    const dotsEl = screen.getByTestId('beat-circle-dots')
    expect(dotsEl.querySelectorAll('[data-testid="beat-circle-dot"]').length).toBe(4)
    expect(dotsEl.querySelectorAll('[data-testid="beat-circle-dot"]')[0].className).toMatch(/active/)
  })

  it('after count-in, count-in phase disappears and running phase appears', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    await act(async () => { fireEvent.click(getArmButton()) })
    // Count-in is 4 beats × 500ms = 2000ms
    act(() => { vi.advanceTimersByTime(2100) })

    expect(screen.queryByTestId('beat-circle-count-in')).toBeNull()
    expect(screen.getByTestId('beat-circle-running')).toBeTruthy()
  })

  it('auto-navigates to first lyric when count-in ends (begin event)', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    await act(async () => { fireEvent.click(getArmButton()) })
    expect(getSongIndex()).toBe(-1)

    act(() => { vi.advanceTimersByTime(2100) })
    await act(async () => { await Promise.resolve() })

    expect(getSongIndex()).toBe(0)
  })

  it('beat circle is never rendered in the projection view', async () => {
    render(<App initialHash="#/projection" />)
    await act(async () => { await Promise.resolve() })

    expect(screen.queryByTestId('beat-circle')).toBeNull()
  })

  it('count-in does not appear in SETUP state (not armed)', async () => {
    vi.useFakeTimers()
    setupControlViewWithReadinessPassing()
    render(<App initialHash="#/" />)

    await act(async () => { await Promise.resolve() })
    // Do NOT arm — remain in READY_TO_ARM
    act(() => { vi.advanceTimersByTime(2100) })

    expect(screen.queryByTestId('beat-circle')).toBeNull()
  })
})
