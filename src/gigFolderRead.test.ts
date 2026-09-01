/**
 * **Reading a gig folder without writing to it.**
 *
 * `refreshGigReadiness` writes — it creates `gig.json` when the folder has none, and injects the
 * app's running order into a gig whose file has not reached one. Both are correct for the gig you
 * have open and both are catastrophic for a list: Setup home draws one row per remembered gig, and
 * a list that ran the opening path per row would **create files in every folder it drew**, and
 * would push the open gig's setlist into all of them.
 *
 * So these tests are mostly about what does NOT happen. The write-freeness is asserted directly —
 * the platform's writers are spies, and a passing test is one where they were never called.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { readGigReadiness } from './gigFolderRead'
import * as platform from './platform'
import { resetGigSession } from './gigSession'
import { installLibrary } from './testSupport/library'
import { ensureStorage } from './testSupport/storage'
import type { LibrarySong } from './setlistStore'

function song(id: string): LibrarySong {
  return { id, title: id, items: [{ languages: { es: 'línea' } }] } as LibrarySong
}

vi.mock('./platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./platform')>()
  return {
    ...actual,
    readGigFolder: vi.fn(),
    writeGigFile: vi.fn(),
    writeDebriefFile: vi.fn(),
    fileExists: vi.fn(),
    validateSongForPerformance: vi.fn(),
    describeDisplays: vi.fn(),
  }
})

const readGigFolder = vi.mocked(platform.readGigFolder)
const writeGigFile = vi.mocked(platform.writeGigFile)
const fileExists = vi.mocked(platform.fileExists)
const validateSongForPerformance = vi.mocked(platform.validateSongForPerformance)
const describeDisplays = vi.mocked(platform.describeDisplays)

const GIG = '/gigs/2026-09-04-de-poel'

function gigJson(fields: Record<string, unknown>): string {
  return JSON.stringify({ gigVersion: 1, id: '2026-09-04-de-poel', date: '2026-09-04', ...fields })
}

function folder(over: Partial<Awaited<ReturnType<typeof platform.readGigFolder>>> = {}) {
  return {
    folderPath: GIG,
    gigText: null,
    gigError: null,
    gigPresent: false,
    visualsText: null,
    visualsError: null,
    visualsPresent: false,
    ...over,
  }
}

beforeAll(ensureStorage)

beforeEach(() => {
  localStorage.clear()
  resetGigSession()
  vi.clearAllMocks()
  fileExists.mockResolvedValue(true)
  describeDisplays.mockResolvedValue({ count: 1, displays: [], fingerprint: 'f' })
  validateSongForPerformance.mockResolvedValue({ status: 'skipped', reason: 'not run' })
  writeGigFile.mockResolvedValue({ ok: true })
})

describe('readGigReadiness', () => {
  it('writes nothing when the folder has no gig.json at all', async () => {
    // The opening path CREATES one here. A list must not: drawing a row is not a decision to make
    // a gig, and four rows would be four files nobody asked for.
    readGigFolder.mockResolvedValue(folder())
    const readiness = await readGigReadiness(GIG)
    expect(writeGigFile).not.toHaveBeenCalled()
    expect(readiness.folderPath).toBe(GIG)
  })

  it('writes nothing when gig.json states no running order', async () => {
    // The other write in the opening path: the app's setlist is injected into a gig that has none.
    // For a row that would push the OPEN gig's order into a gig that is merely listed.
    readGigFolder.mockResolvedValue(
      folder({ gigPresent: true, gigText: gigJson({ venue: { name: 'De Poel' } }) })
    )
    await readGigReadiness(GIG)
    expect(writeGigFile).not.toHaveBeenCalled()
  })

  it('reads the running order from the gig’s own file, never from the app’s active setlist', async () => {
    // A row is that gig's delta. The app's active setlist belongs to whichever gig is open, and
    // reading it here would make every row show the same songs.
    installLibrary([song('pimiento'), song('duelo')])
    readGigFolder.mockResolvedValue(
      folder({
        gigPresent: true,
        gigText: gigJson({
          setlist: ['duelo'],
          songs: [{ id: 'duelo', title: 'Duelo', file: '../../songs/duelo.json' }],
        }),
      })
    )
    const readiness = await readGigReadiness(GIG)
    expect(readiness.songs.map((s) => s.songId)).toEqual(['duelo'])
  })

  it('carries the gig’s identity, so a row can name the night', async () => {
    readGigFolder.mockResolvedValue(
      folder({
        gigPresent: true,
        gigText: gigJson({ venue: { name: 'De Poel', city: 'Gent' }, setlist: [] }),
      })
    )
    const readiness = await readGigReadiness(GIG)
    expect(readiness.gigId).toBe('2026-09-04-de-poel')
    expect(readiness.date).toBe('2026-09-04')
    expect(readiness.venue?.name).toBe('De Poel')
  })

  it('reports a file that will not parse as a refusal, not as an empty gig', async () => {
    readGigFolder.mockResolvedValue(folder({ gigPresent: true, gigText: '{ not json' }))
    const readiness = await readGigReadiness(GIG)
    expect(readiness.refusals.length).toBeGreaterThan(0)
  })

  it('does not run bombista per row by default', async () => {
    // Fourteen songs across four rows is fifty-six subprocesses to draw a screen. Bombista's
    // findings are notes and never blockers, so a row's verdict does not move without them.
    installLibrary([song('duelo')])
    readGigFolder.mockResolvedValue(
      folder({
        gigPresent: true,
        gigText: gigJson({
          setlist: ['duelo'],
          songs: [{ id: 'duelo', title: 'Duelo', file: '../../songs/duelo.json' }],
        }),
      })
    )
    await readGigReadiness(GIG)
    expect(validateSongForPerformance).not.toHaveBeenCalled()
  })

  it('says so when validation did not run, rather than implying it passed', async () => {
    installLibrary([song('duelo')])
    readGigFolder.mockResolvedValue(
      folder({
        gigPresent: true,
        gigText: gigJson({
          setlist: ['duelo'],
          songs: [{ id: 'duelo', title: 'Duelo', file: '../../songs/duelo.json' }],
        }),
      })
    )
    const readiness = await readGigReadiness(GIG)
    expect(readiness.validationSkipped).toBe(true)
  })

  it('does not disturb the open gig’s snapshot', async () => {
    // The list is drawn while a gig may be open and armed. Reading a row must not publish, must
    // not broadcast a room to the Projection window, and must not move the remembered folder.
    const before = localStorage.getItem('pregoneroGigFolder')
    readGigFolder.mockResolvedValue(
      folder({ gigPresent: true, gigText: gigJson({ setlist: [] }) })
    )
    await readGigReadiness(GIG)
    expect(localStorage.getItem('pregoneroGigFolder')).toBe(before)
  })
})
