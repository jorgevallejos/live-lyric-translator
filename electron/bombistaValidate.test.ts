/**
 * The bombista shell-out. The spawner is injected, so no Python is involved — and `command` is
 * pinned wherever the assertion mentions it by name, because the module RESOLVES the binary now
 * and would otherwise pick up whatever is installed on the machine running these tests. Which
 * answer resolution gives is `bombistaBinary.test.ts`'s question, not this file's.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { validateSongForPerformance } = require('./bombistaValidate.cjs') as {
  validateSongForPerformance: (
    songPath: string,
    options?: { execFile?: unknown; command?: string }
  ) => Promise<
    | { status: 'ok' }
    | { status: 'failed'; messages: string[] }
    | { status: 'skipped'; reason: string }
  >
}

type Cb = (error: (Error & { code?: string; killed?: boolean }) | null, stdout: string, stderr: string) => void

function spawner(
  error: (Error & { code?: string; killed?: boolean }) | null,
  stdout = '',
  stderr = '',
  seen?: { command?: string; args?: string[] }
) {
  return (command: string, args: string[], _opts: unknown, cb: Cb) => {
    if (seen) {
      seen.command = command
      seen.args = args
    }
    cb(error, stdout, stderr)
  }
}

describe('validateSongForPerformance', () => {
  it('asks the finished question, and hands over a path and nothing else', async () => {
    const seen: { command?: string; args?: string[] } = {}
    await validateSongForPerformance('/songs/duelo.json', {
      execFile: spawner(null, '', '', seen),
      command: 'bombista',
    })
    expect(seen.command).toBe('bombista')
    expect(seen.args).toEqual(['validate', '/songs/duelo.json', '--for-performance'])
  })

  it('a zero exit is ok', async () => {
    expect(
      await validateSongForPerformance('/songs/pimiento.json', { execFile: spawner(null) })
    ).toEqual({ status: 'ok' })
  })

  it('a non-zero exit carries every line back, not just the first', async () => {
    const err = Object.assign(new Error('exit 1'), { code: 1 })
    const r = await validateSongForPerformance('/songs/libertad.json', {
      execFile: spawner(err, 'error: 20 timeline entries\nerror: 24 lyric lines\n'),
    })
    expect(r).toEqual({
      status: 'failed',
      messages: ['error: 20 timeline entries', 'error: 24 lyric lines'],
    })
  })

  it('never reports a failure with no words in it', async () => {
    const err = Object.assign(new Error('exit 2'), { code: 2 })
    const r = await validateSongForPerformance('/songs/x.json', {
      execFile: spawner(err),
      command: 'bombista',
    })
    expect(r).toEqual({ status: 'failed', messages: ['bombista exited 2'] })
  })

  it('does not fail closed when bombista is not installed', async () => {
    const err = Object.assign(new Error('spawn bombista ENOENT'), { code: 'ENOENT' })
    const r = await validateSongForPerformance('/songs/x.json', {
      execFile: spawner(err),
      command: 'bombista',
    })
    expect(r).toEqual({ status: 'skipped', reason: 'bombista could not be run' })
  })

  it('does not fail closed when bombista hangs', async () => {
    const err = Object.assign(new Error('timed out'), { killed: true })
    const r = await validateSongForPerformance('/songs/x.json', {
      execFile: spawner(err),
      command: 'bombista',
    })
    expect(r).toEqual({ status: 'skipped', reason: 'bombista did not answer in time' })
  })
})
