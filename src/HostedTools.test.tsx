/** @vitest-environment jsdom */
/**
 * **Hosting Bombista and Muralista is packaging, not architecture.**
 *
 * The three things these tests defend, all of them boundaries rather than behaviours:
 *
 * - **Bombista is handed a song file path, never a gig.** It does not know Pregonero exists and does
 *   not know gigs exist.
 * - **Muralista is hosted over `http://127.0.0.1`, never `file://`** — its File System Access API
 *   needs a secure context.
 * - **Nothing passes data between running processes.** The file is the only channel, and *pass
 *   control back* is courtesy: if the bridge is absent the button is absent.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'

const runBombista = vi.fn()
const bombistaStagingDir = vi.fn()
const chooseFilePath = vi.fn()
const chooseFolderPath = vi.fn()
const openTool = vi.fn()
const openBombistaReview = vi.fn()
const closeTool = vi.fn()
let hosted = true

vi.mock('./platform', () => ({
  canRunBombista: () => hosted,
  canHostTools: () => hosted,
  runBombista: (...a: unknown[]) => runBombista(...a),
  bombistaVersion: () => Promise.resolve({ present: true, version: 'bombista 1.1.0' }),
  bombistaStagingDir: (...a: unknown[]) => bombistaStagingDir(...a),
  chooseFilePath: (...a: unknown[]) => chooseFilePath(...a),
  chooseFolderPath: (...a: unknown[]) => chooseFolderPath(...a),
  openTool: (...a: unknown[]) => openTool(...a),
  openBombistaReview: (...a: unknown[]) => openBombistaReview(...a),
  closeTool: (...a: unknown[]) => closeTool(...a),
  hasFolderPicker: () => true,
  hasGigFolderAccess: () => true,
  chooseGigFolderPath: vi.fn(),
  readGigFolder: vi.fn().mockResolvedValue({
    folderPath: '/g',
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
  }),
  writeGigFile: vi.fn().mockResolvedValue({ ok: true }),
  writeDebriefFile: vi.fn(),
  validateSongForPerformance: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'no bombista' }),
  fileExists: vi.fn().mockResolvedValue(true),
  readSongFileText: vi.fn(),
  describeDisplays: vi.fn().mockResolvedValue({ count: 0, displays: [], fingerprint: '' }),
}))

const { SongSubflow } = await import('./SongSubflow')
const { MuralistaDoor, MURALISTA_KEY, MURALISTA_PAGE } = await import('./MuralistaDoor')
const { setSongsFolder, setMuralistaFolder } = await import('./contentFolders')

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

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  hosted = true
  runBombista.mockResolvedValue({ status: 'ok', output: 'done', code: 0 })
  bombistaStagingDir.mockResolvedValue('/staging/pimiento')
  openTool.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:51234/muralista/mapper.html' })
  openBombistaReview.mockResolvedValue({ ok: true, url: 'http://127.0.0.1:51235/' })
})

afterEach(cleanup)

describe('the song door: Bombista, hosted', () => {
  it('asks one question when the file does not exist yet — two entry points, one flow', () => {
    render(<SongSubflow songId="pimiento" songPath={null} />)
    expect(screen.getByTestId('subflow-question').textContent).toBe('Does a song file exist yet?')
    expect(screen.getByTestId('subflow-have-file')).toBeTruthy()
    expect(screen.getByTestId('subflow-new')).toBeTruthy()
  })

  it('goes straight into the flow when the file is already there', () => {
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    expect(screen.queryByTestId('subflow-entry')).toBeNull()
    expect(screen.getByTestId('subflow-flow')).toBeTruthy()
  })

  it('says at the entry that a song needs lyrics and audio', () => {
    render(<SongSubflow songId="pimiento" songPath={null} />)
    expect(screen.getByTestId('subflow-entry').textContent).toMatch(/needs lyrics and audio/)
  })

  it('names the LLM session as a gap outside the suite, and never performs it', () => {
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    expect(screen.getByTestId('subflow-gap').textContent).toMatch(/outside the suite/)
    expect(screen.getByTestId('subflow-gap').textContent).toMatch(/no tool here gets a language model/)
  })

  it('writes a new skeleton into the songs folder under the canonical name', async () => {
    setSongsFolder('/vault/songs')
    render(<SongSubflow songId="pimiento" songPath={null} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-new'))
    })
    expect(runBombista).toHaveBeenCalledWith('new', ['pimiento', '-o', '/vault/songs/pimiento.json'])
  })

  it('cannot write a skeleton with no songs folder, and says why rather than picking a path', () => {
    render(<SongSubflow songId="pimiento" songPath={null} />)
    expect((screen.getByTestId('subflow-new') as HTMLButtonElement).disabled).toBe(true)
  })

  it('will not align without audio, because the timeline comes from aligning one against the other', () => {
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    expect((screen.getByTestId('subflow-align') as HTMLButtonElement).disabled).toBe(true)
  })

  it('aligns the chosen audio against the song file, into a directory Pregonero names', async () => {
    chooseFilePath.mockResolvedValue('/vault/songs/audio/pimiento.m4a')
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    expect(chooseFilePath).toHaveBeenCalledWith('audio')
    expect(runBombista).toHaveBeenCalledWith('align', [
      '/vault/songs/audio/pimiento.m4a',
      '/songs/pimiento.json',
      '-o',
      '/staging/pimiento',
      '--emit',
      'html',
    ])
  })

  it('promotes by calling promote — there is no file-replacement step in this repo', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-promote'))
    })
    expect(runBombista).toHaveBeenCalledWith('promote', [
      '/staging/pimiento/pimiento-timeline.json',
      '/songs/pimiento.json',
    ])
  })

  it('shows what promote printed — the per-line diff is Bombista’s, not a summary of it', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    runBombista.mockResolvedValue({
      status: 'ok',
      output: 'line 19: 92.40 -> 91.20\nline 20: unchanged',
      code: 0,
    })
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-promote'))
    })
    expect(screen.getByTestId('bombista-bombista promote').textContent).toMatch(/92\.40 -> 91\.20/)
  })

  it('opens Bombista’s own review page — with the staging dir, the song and the audio', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-review'))
    })
    expect(openBombistaReview).toHaveBeenCalledWith([
      '/staging/pimiento',
      '/songs/pimiento.json',
      '--audio',
      '/audio/pimiento.m4a',
    ])
  })

  it('offers Done only once the review window is open, and closing it re-checks', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    expect(screen.queryByTestId('subflow-review-done')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-review'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-review-done'))
    })
    expect(closeTool).toHaveBeenCalledWith('bombista')
  })

  it('names the reason when the review server will not start, rather than a blank window', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    openBombistaReview.mockResolvedValue({ ok: false, error: 'bombista is not on PATH' })
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-review'))
    })
    expect(screen.getByTestId('subflow-review-error').textContent).toMatch(/not on PATH/)
  })

  it('validates for performance, which is the exit gate of this step', async () => {
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-validate'))
    })
    expect(runBombista).toHaveBeenCalledWith('validate', ['/songs/pimiento.json', '--for-performance'])
  })

  it('hands Bombista a song file path and never a gig — no argument mentions one', async () => {
    chooseFilePath.mockResolvedValue('/audio/pimiento.m4a')
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    for (const id of ['subflow-align', 'subflow-promote', 'subflow-validate']) {
      await act(async () => {
        fireEvent.click(screen.getByTestId(id))
      })
    }
    for (const call of runBombista.mock.calls) {
      const argv = JSON.stringify(call)
      expect(argv).not.toMatch(/gig/i)
      expect(argv).not.toMatch(/visuals/i)
      expect(argv).not.toMatch(/setlist/i)
    }
  })

  it('with no bridge, the buttons are absent and the terminal is named instead', () => {
    hosted = false
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    expect(screen.getByTestId('subflow-unhosted').textContent).toMatch(/Run it in a terminal/)
    expect(screen.queryByTestId('subflow-align')).toBeNull()
  })
})

describe('the visuals door: Muralista, hosted', () => {
  it('asks for the folder rather than carrying a copy of the page', () => {
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-no-folder').textContent).toMatch(/does not carry a copy/)
  })

  it('remembers the chosen folder', async () => {
    chooseFolderPath.mockResolvedValue('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-choose-folder'))
    })
    await waitFor(() => expect(screen.getByTestId('muralista-hosted')).toBeTruthy())
  })

  it('opens mapper.html from that folder, in a window of its own', async () => {
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    expect(openTool).toHaveBeenCalledWith(
      MURALISTA_KEY,
      '/tools/muralista/mapper',
      MURALISTA_PAGE,
      'Muralista'
    )
  })

  it('is served over http on localhost, never file://', async () => {
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    const url = (await openTool.mock.results[0]!.value).url as string
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(url).not.toMatch(/^file:/)
  })

  it('pass control back is courtesy: Done closes the window and re-checks', async () => {
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-done'))
    })
    expect(closeTool).toHaveBeenCalledWith(MURALISTA_KEY)
  })

  it('offers no Done button before anything is open — the courtesy has nothing to be courteous about', () => {
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-done')).toBeNull()
  })

  it('with no bridge, the button is absent and Chrome is named instead', () => {
    hosted = false
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-unhosted').textContent).toMatch(/Chrome/)
    expect(screen.queryByTestId('muralista-open')).toBeNull()
  })

  it('says the file is the only channel, not a running connection', () => {
    setMuralistaFolder('/tools/muralista/mapper')
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-hosted').textContent).toMatch(
      /Nothing passes between them while both are running/
    )
  })
})
