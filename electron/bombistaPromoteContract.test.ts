/**
 * **A canary on Bombista, not a test of Pregonero. Do not delete it as redundant.**
 *
 * `v0.37.0` made an edit **replace** the song file instead of merging a timeline into it, because
 * page 1 is the edit surface and `promote` writes only the timeline envelope. That took Pregonero's
 * save off `bombista promote` for the edit case — and with it, off the rule promote states:
 *
 * > a song that has a timeline is never replaced by a candidate carrying none.
 *
 * **Pregonero now enforces its own copy of that rule** (`SongFlowView`'s refusal check). Two
 * statements of one rule, in two repositories, is how they drift apart silently, and the first
 * symptom would be a song losing its timings — which is the one thing in this suite that cannot be
 * recomputed without the recording it was measured from.
 *
 * **So this file asserts nothing about Pregonero at all.** Its whole job is to go red on the day
 * Bombista changes its mind, so that the change is met by a failing test rather than by a walk.
 * It runs the **installed** `bombista`, resolved exactly the way the app resolves it.
 *
 * **The real fix is `promote --replace`** — one write path, one statement of the rule — and this
 * canary is what stands in for it until then. It is recorded as known debt in
 * `journey-setup.md`, step 6, with its trigger: **when Bombista next touches promotion, do the fix
 * and delete this file.**
 *
 * **The two controls are not decoration.** A Bombista that refused every promotion would satisfy
 * the refusal on its own, so the accepting cases are pinned beside it — otherwise the canary
 * passes while the tool is broken in the other direction.
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const require = createRequire(import.meta.url)
const { resolveBombista } = require('./bombistaBinary.cjs') as {
  resolveBombista: (configured?: string | null) => { command: string }
}

/** The binary the app itself would run. Not `'bombista'` — see `bombistaBinary.cjs`. */
const command = resolveBombista(null).command

let available = false
let version = ''

beforeAll(() => {
  try {
    version = execFileSync(command, ['--version'], { encoding: 'utf8' }).trim()
    available = true
  } catch {
    available = false
  }
})

/**
 * **Skipped, loudly, on a machine with no Bombista** — and never failed there.
 *
 * A canary that goes red because the machine has no Python is noise, and noise is what gets a file
 * deleted. It has to fail for one reason only, which is the reason it exists.
 */
function skipUnlessBombista(): boolean {
  if (!available) {
    console.warn(
      `[promote contract] SKIPPED — \`${command}\` could not be run on this machine. ` +
        'This canary only means anything where Bombista is installed.'
    )
  }
  return !available
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pregonero-promote-contract-'))
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const SONG = {
  title: 'Libertad',
  artist: 'Chango Pepper',
  notes: '',
  title_translations: { es: 'Libertad' },
  intro: { es: '' },
  lyrics: [{ es: 'una' }, { es: 'dos' }],
}

const ENVELOPE = {
  linesHash: 'sha256:abc',
  timelineSignedOff: '2026-09-02T10:00:00+00:00',
  timelineVersion: 2,
  leadIn: { durationSec: 0.0, source: 'measured', confidence: 'high', apply: false },
  timeline: [
    { start: 0.0, end: 0.9 },
    { start: 1.0, end: 1.9 },
  ],
}

function write(name: string, data: unknown): string {
  const full = join(dir, name)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, JSON.stringify(data, null, 2))
  return full
}

/** Runs the real binary. Returns the exit code and everything it said. */
function promote(candidate: string, target: string): { code: number; output: string } {
  try {
    const stdout = execFileSync(command, ['promote', candidate, target], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, output: stdout }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

describe('the rule Pregonero also states: a timed song is not replaced by a timeline-less candidate', () => {
  it('is still refused by the installed bombista promote', () => {
    if (skipUnlessBombista()) return
    // The target has been measured; the candidate is a manual song. Promoting would either drop a
    // measured timeline or keep one the candidate never mentioned.
    const target = write('libertad.json', { ...SONG, ...ENVELOPE })
    // The same shape as the real one: `<staging>/libertad.json` over
    // `<songs>/song-performance/libertad.json`, same name, different directory.
    const candidate = write('staging/libertad.json', SONG)

    const result = promote(candidate, target)

    expect(result.code).not.toBe(0)
    // The wording is Bombista's to change; the refusal is not.
    expect(result.output.toLowerCase()).toContain('timeline')
    // And nothing was written on the way to refusing.
    expect(JSON.parse(readFileSync(target, 'utf8')).timeline).toHaveLength(2)
  })

  it('still accepts a timed candidate over a timed song — the canary is not just "refuses"', () => {
    if (skipUnlessBombista()) return
    const target = write('libertad.json', { ...SONG, ...ENVELOPE })
    const candidate = write('staging/libertad.json', {
      ...SONG,
      ...ENVELOPE,
      timeline: [
        { start: 0.0, end: 0.5 },
        { start: 0.6, end: 1.5 },
      ],
    })

    expect(promote(candidate, target).code).toBe(0)
    expect(JSON.parse(readFileSync(target, 'utf8')).timeline[1].end).toBe(1.5)
  })

  it('still accepts a timeline-less candidate over a song that never had one', () => {
    if (skipUnlessBombista()) return
    // Re-saving a manual song is ordinary. Absence is a state; only incompleteness is a fault.
    const target = write('libertad.json', SONG)
    const candidate = write('staging/libertad.json', { ...SONG, notes: 'edited' })

    expect(promote(candidate, target).code).toBe(0)
  })

  it('reports which Bombista it asked, so a red run says what changed', () => {
    if (skipUnlessBombista()) return
    expect(version).toMatch(/^bombista \d+\.\d+\.\d+/)
    console.warn(`[promote contract] checked against ${version} at ${command}`)
  })
})
