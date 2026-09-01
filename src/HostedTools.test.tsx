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
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'

const runBombista = vi.fn()
const bombistaStagingDir = vi.fn()
const chooseFilePath = vi.fn()
const chooseFolderPath = vi.fn()
const openTool = vi.fn()
const openBombistaReview = vi.fn()
const closeTool = vi.fn()
let hosted = true

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionPlacement: () => Promise.resolve({ placed: false, reason: null, display: null }),
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

const { SongSubflow, wordsStem } = await import('./SongSubflow')
const { MuralistaDoor, MURALISTA_KEY, MURALISTA_PAGE } = await import('./MuralistaDoor')
const { setSongsFolder } = await import('./contentFolders')

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
describe('the song door: one door, two pickers, three moves', () => {
  /**
   * **Rewritten 2026-09-01.** The old door opened with *does a song file exist yet?* and laid the
   * pipeline out as six controls — `new`, a named gap, align, review, promote, validate. Jorge
   * stopped the R1 walk rather than test it, which was right: it implemented a design already
   * replaced. These tests are the replacement, and the first one is the whole point of it.
   */
  it('asks no question about whether the song exists — one door, either way', () => {
    render(<SongSubflow songId="libertad" songPath={null} />)
    expect(screen.queryByTestId('subflow-question')).toBeNull()
    expect(screen.queryByTestId('subflow-entry')).toBeNull()
    expect(screen.getByTestId('subflow-choose-words')).toBeTruthy()
    expect(screen.getByTestId('subflow-choose-audio')).toBeTruthy()
  })

  it('is the same door for a song that already exists', () => {
    render(<SongSubflow songId="pimiento" songPath="/vault/songs/pimiento.json" />)
    expect(screen.getByTestId('subflow-choose-words')).toBeTruthy()
    expect(screen.getByTestId('subflow-choose-audio')).toBeTruthy()
  })

  it('takes a lyrics .txt or a song .json through one picker', async () => {
    // The branch belongs to Bombista: `align` accepts SONG_JSON_OR_LYRICS_TXT and normalises both.
    chooseFilePath.mockResolvedValue('/takes/libertad/libertad.txt')
    render(<SongSubflow songId="libertad" songPath={null} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-words'))
    })
    expect(chooseFilePath).toHaveBeenCalledWith('lyrics')
  })

  it('says at the entry that a song needs words and a recording', () => {
    render(<SongSubflow songId="libertad" songPath={null} />)
    expect(screen.getByTestId('subflow-flow').textContent).toMatch(/needs lyrics and audio/)
  })

  it('holds Align until both are chosen, disabled with the reason', () => {
    render(<SongSubflow songId="libertad" songPath={null} />)
    const align = screen.getByTestId('subflow-align') as HTMLButtonElement
    expect(align.disabled).toBe(true)
    expect(screen.getByTestId('subflow-align-reason').textContent).toMatch(/words and a recording/)
  })

  it('aligns with --emit songjson, which is what promote can land as a new song', async () => {
    setSongsFolder('/vault/songs')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/libertad.txt')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/take.mp3')
    render(<SongSubflow songId="libertad" songPath={null} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-words'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    expect(runBombista).toHaveBeenCalledWith('align', [
      '/takes/libertad/take.mp3',
      '/takes/libertad/libertad.txt',
      '-o',
      '/staging/pimiento',
      '--emit',
      'songjson',
      '--emit',
      'html',
    ])
  })

  it('lands the song at the canonical name inside <songs>/song-performance, never asking for a path', async () => {
    // The id comes from the words file — `align` names its output `<stem>-song.json` and `promote`
    // will only create `<stem>.json` from it, so this is read rather than chosen. **The folder is
    // the catalogue's `song-performance/`, not its root**: the song file is the author's, and it
    // sits beside `audio/` and `lyrics/` in a folder named after the format.
    setSongsFolder('/vault/songs')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/libertad.txt')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/take.mp3')
    render(<SongSubflow songId="libertad" songPath={null} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-words'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-add'))
    })
    expect(runBombista).toHaveBeenCalledWith('promote', [
      '/staging/pimiento/libertad-song.json',
      '/vault/songs/song-performance/libertad.json',
    ])
  })

  it('promotes into the existing file for a song that already exists — same button, no branch', async () => {
    setSongsFolder('/vault/songs')
    chooseFilePath.mockResolvedValueOnce('/takes/pimiento/take.mp3')
    render(<SongSubflow songId="pimiento" songPath="/vault/songs/pimiento.json" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-choose-audio'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-align'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('subflow-add'))
    })
    expect(runBombista).toHaveBeenCalledWith('promote', [
      '/staging/pimiento/pimiento-song.json',
      '/vault/songs/pimiento.json',
    ])
  })

  it('never runs `bombista new` — that is the no-audio branch, and it lives on Setup home', async () => {
    setSongsFolder('/vault/songs')
    render(<SongSubflow songId="libertad" songPath={null} />)
    const subcommands = runBombista.mock.calls.map((c) => c[0])
    expect(subcommands).not.toContain('new')
  })

  it('shows what promote printed — the per-line diff is Bombista’s, not a summary of it', async () => {
    setSongsFolder('/vault/songs')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/libertad.txt')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/take.mp3')
    runBombista.mockResolvedValue({
      status: 'ok',
      output: 'created: /vault/songs/libertad.json\ntimeline added (24 entries)',
      code: 0,
    })
    render(<SongSubflow songId="libertad" songPath={null} />)
    for (const id of ['subflow-choose-words', 'subflow-choose-audio', 'subflow-align', 'subflow-add']) {
      await act(async () => {
        fireEvent.click(screen.getByTestId(id))
      })
    }
    expect(screen.getByTestId('bombista-bombista promote').textContent).toMatch(/timeline added/)
  })

  it('names the reason when the review server will not start, rather than a blank window', async () => {
    setSongsFolder('/vault/songs')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/libertad.txt')
    chooseFilePath.mockResolvedValueOnce('/takes/libertad/take.mp3')
    openBombistaReview.mockResolvedValue({ ok: false, error: 'bombista could not be run' })
    render(<SongSubflow songId="libertad" songPath={null} />)
    for (const id of ['subflow-choose-words', 'subflow-choose-audio', 'subflow-align', 'subflow-review']) {
      await act(async () => {
        fireEvent.click(screen.getByTestId(id))
      })
    }
    expect(screen.getByTestId('subflow-problem').textContent).toMatch(/could not be run/)
  })

  it('names Translations as the gap, and never performs it', () => {
    render(<SongSubflow songId="libertad" songPath={null} />)
    const gap = screen.getByTestId('subflow-gap').textContent ?? ''
    expect(gap).toMatch(/Translations/)
    expect(gap).toMatch(/outside the suite/)
    expect(gap).toMatch(/no tool here gets a language model/)
  })

  /**
   * **The skeleton, and why the words picker does not prefill from it** (2026-09-01).
   *
   * `New song` now continues into this door on the song it just made, so the common way to arrive
   * here is on a file that exists and has no words in it. Prefilling the picker from it would arm
   * **Align** over a file with nothing to align, one click away, on the from-nothing walk.
   */
  it('does not offer a skeleton as the words, because a skeleton is not the words', () => {
    render(<SongSubflow songId="libertad" songPath="/songs/libertad.json" skeleton />)
    expect(screen.getByTestId('subflow-inputs-summary').textContent).toMatch(/No words yet/)
    const align = screen.getByTestId('subflow-align') as HTMLButtonElement
    expect(align.disabled).toBe(true)
  })

  it('says the skeleton is there and what it carries, so the empty picker is not a mystery', () => {
    render(<SongSubflow songId="libertad" songPath="/songs/libertad.json" skeleton />)
    const said = screen.getByTestId('subflow-skeleton').textContent ?? ''
    expect(said).toMatch(/libertad\.json/)
    expect(said).toMatch(/no words yet/i)
    // The two-step underneath, said where it matters: nothing the skeleton carries is lost.
    expect(said).toMatch(/merges/)
  })

  it('still lands the song on the skeleton, so promote merges rather than writing a second file', () => {
    render(<SongSubflow songId="libertad" songPath="/songs/libertad.json" skeleton />)
    expect(screen.getByTestId('subflow-target').textContent).toMatch(/\/songs\/libertad\.json/)
  })

  it('a song that already has its words still opens with them', () => {
    // The prefill is not gone, only the case where the file is not the words.
    render(<SongSubflow songId="pimiento" songPath="/vault/songs/pimiento.json" />)
    expect(screen.getByTestId('subflow-inputs-summary').textContent).toMatch(/pimiento\.json/)
    expect(screen.queryByTestId('subflow-skeleton')).toBeNull()
  })

  it('with no bridge, says so and offers no controls that cannot work', () => {
    hosted = false
    render(<SongSubflow songId="pimiento" songPath="/songs/pimiento.json" />)
    expect(screen.getByTestId('subflow-unhosted').textContent).toMatch(/Run it in a terminal/)
    expect(screen.queryByTestId('subflow-align')).toBeNull()
    // **Step 0 is named whether or not Bombista is installed** — a fact about the work, not about
    // this machine's tooling. The first version of this door dropped it on this branch.
    expect(screen.getByTestId('subflow-gap').textContent).toMatch(/Translations/)
  })
})

describe('the visuals door: Muralista, hosted', () => {
  /**
   * **Rewritten 2026-08-31: there is no folder to choose any more.** The page is vendored — four
   * files at one tag with a hash test, the same device that already carries `warp.js` — so the two
   * tests that asserted Pregonero *asks* for a folder and *remembers* it are gone rather than
   * adjusted. A copy is not a fork when a test proves it current, and what the setting really did
   * was make the visuals door do nothing until somebody discovered it.
   */
  it('opens mapper.html without asking where Muralista is', async () => {
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    // The folder argument is ignored for this key — the main process serves the vendored page out
    // of the app itself — and it is still passed so the one IPC keeps one shape.
    expect(openTool).toHaveBeenCalledWith(MURALISTA_KEY, '', MURALISTA_PAGE, 'Muralista')
  })

  it('never asks for a folder, and never says it does not carry a copy', () => {
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-no-folder')).toBeNull()
    expect(screen.queryByTestId('muralista-choose-folder')).toBeNull()
    expect(screen.queryByTestId('muralista-forget-folder')).toBeNull()
  })

  it('is served over http on localhost, never file://', async () => {
    // Muralista's File System Access API needs a secure context, which `file://` is not — and
    // vendoring the page changes where the bytes come from, never how they are served.
    render(<MuralistaDoor />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('muralista-open'))
    })
    const url = (await openTool.mock.results[0]!.value).url as string
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    expect(url).not.toMatch(/^file:/)
  })

  it('pass control back is courtesy: Done closes the window and re-checks', async () => {
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
    render(<MuralistaDoor />)
    expect(screen.queryByTestId('muralista-done')).toBeNull()
  })

  it('with no bridge, the button is disabled with its reason — and Chrome is still named', () => {
    // **Changed 2026-08-31, and the change is the point.** This asserted the button was ABSENT,
    // which is the defect the R1 walk found on `New song`: a screen with no control on it reads as
    // a wall rather than as a fork in the road, however good the sentence beside it. The escape
    // hatch is still the real answer here — Muralista is fully usable on its own by requirement —
    // but it now sits under a visible, disabled action. See `GatedAction.tsx`.
    hosted = false
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-unhosted').textContent).toMatch(/Chrome/)
    const button = screen.getByTestId('muralista-open') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('muralista-open-reason').textContent).toMatch(/desktop app/)
  })

  it('says the file is the only channel, not a running connection', () => {
    render(<MuralistaDoor />)
    expect(screen.getByTestId('muralista-hosted').textContent).toMatch(
      /Nothing passes between them while both are running/
    )
  })
})

describe('the words file’s stem', () => {
  it('strips any extension, not only .json', () => {
    // `songIdFromPath` strips `.json` and only `.json` — right for a library reference, wrong for
    // the words, which are as often a `.txt`. The failure is silent: `align` would have written
    // `libertad.txt-song.json` and `promote` been asked for `libertad.txt.json`, both legal file
    // names and neither of them the song. Caught by a test before it reached a walk.
    expect(wordsStem('/takes/libertad/libertad.txt')).toBe('libertad')
    expect(wordsStem('/vault/songs/pimiento.json')).toBe('pimiento')
    expect(wordsStem('/takes/no-extension')).toBe('no-extension')
    expect(wordsStem('/takes/.hidden')).toBe('.hidden')
  })
})
