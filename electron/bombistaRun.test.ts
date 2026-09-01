/**
 * Running Bombista is a **subprocess invocation**, and these tests are about the three things that
 * go wrong at a venue: the binary is not there, it takes too long, or it says no. None of them may
 * turn into "the app cannot run a gig".
 *
 * `command` is pinned wherever an assertion names the binary, because the module RESOLVES it now
 * and would otherwise pick up whatever is installed on the machine running these tests. Which
 * answer resolution gives is `bombistaBinary.test.ts`'s question, not this file's.
 */
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { runBombista, bombistaVersion, ALLOWED } = require_('./bombistaRun.cjs') as {
  runBombista: (
    subcommand: string,
    args?: unknown[],
    options?: Record<string, unknown>
  ) => Promise<{ status: string; output: string; code: number | null }>
  bombistaVersion: (o?: Record<string, unknown>) => Promise<{ present: boolean; version: string | null }>
  ALLOWED: Set<string>
}

type Cb = (e: unknown, out: string, err: string) => void

function execFileReturning(result: { error?: unknown; stdout?: string; stderr?: string }) {
  return vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Cb) => {
    cb(result.error ?? null, result.stdout ?? '', result.stderr ?? '')
  })
}

describe('running one Bombista subcommand', () => {
  it('passes the subcommand and the arguments through, and nothing else', async () => {
    const run = execFileReturning({ stdout: 'ok' })
    await runBombista('validate', ['/songs/pimiento.json', '--for-performance'], {
      execFile: run,
      command: 'bombista',
    })
    expect(run.mock.calls[0]![0]).toBe('bombista')
    expect(run.mock.calls[0]![1]).toEqual(['validate', '/songs/pimiento.json', '--for-performance'])
  })

  it('reports a clean run as ok, with what it printed', async () => {
    const r = await runBombista('validate', ['/songs/a.json'], {
      execFile: execFileReturning({ stdout: '/songs/a.json: ok\n' }),
    })
    expect(r).toEqual({ status: 'ok', output: '/songs/a.json: ok\n', code: 0 })
  })

  it('reports a non-zero exit as failed, with every line it printed', async () => {
    const r = await runBombista('promote', ['/staging/t.json', '/songs/a.json'], {
      execFile: execFileReturning({
        error: { code: 1 },
        stderr: 'refusing: 19 entries for 20 lyric lines\n',
      }),
    })
    expect(r.status).toBe('failed')
    expect(r.output).toMatch(/19 entries for 20 lyric lines/)
  })

  it('reports a missing binary as skipped, never as failed — a machine with no Python still performs', async () => {
    const r = await runBombista('align', ['a', 'b'], {
      execFile: execFileReturning({ error: { code: 'ENOENT' } }),
      command: 'bombista',
    })
    expect(r.status).toBe('skipped')
    expect(r.output).toMatch(/could not be run/)
  })

  it('reports a timeout as skipped too', async () => {
    const r = await runBombista('align', ['a', 'b'], {
      execFile: execFileReturning({ error: { killed: true, code: null } }),
    })
    expect(r.status).toBe('skipped')
    expect(r.output).toMatch(/did not answer in time/)
  })

  it('gives align a long timeout, because it transcribes, and everything else a short one', async () => {
    const run = vi.fn((_c: string, _a: string[], opts: { timeout: number }, cb: Cb) => {
      cb(null, '', '')
      return opts
    })
    await runBombista('align', ['a', 'b'], { execFile: run })
    expect((run.mock.calls[0]![2] as { timeout: number }).timeout).toBeGreaterThan(60_000)
    await runBombista('validate', ['a'], { execFile: run })
    expect((run.mock.calls[1]![2] as { timeout: number }).timeout).toBeLessThanOrEqual(60_000)
  })

  it('refuses a subcommand outside the list, rather than passing it on', async () => {
    const run = execFileReturning({ stdout: '' })
    const r = await runBombista('rm', ['-rf', '/'], { execFile: run })
    expect(r.status).toBe('failed')
    expect(run).not.toHaveBeenCalled()
  })

  it('knows exactly the five subcommands a song passes through', () => {
    expect([...ALLOWED].sort()).toEqual(['align', 'migrate', 'new', 'promote', 'validate'])
  })
})

describe('whether Bombista is there at all', () => {
  it('says so, and what version', async () => {
    const r = await bombistaVersion({ execFile: execFileReturning({ stdout: 'bombista 1.1.0\n' }) })
    expect(r).toEqual({ present: true, version: 'bombista 1.1.0' })
  })

  it('says it is absent rather than throwing', async () => {
    const r = await bombistaVersion({ execFile: execFileReturning({ error: { code: 'ENOENT' } }) })
    expect(r).toEqual({ present: false, version: null })
  })
})
