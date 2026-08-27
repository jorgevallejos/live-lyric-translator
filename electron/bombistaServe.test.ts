import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'

const require_ = createRequire(import.meta.url)
const { startBombistaServe, findUrl } = require_('./bombistaServe.cjs') as {
  startBombistaServe: (
    args: unknown[],
    options?: Record<string, unknown>
  ) => Promise<{ ok: boolean; url?: string; error?: string; child?: unknown }>
  findUrl: (text: string) => string | null
}

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => void
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('reading the address Bombista prints', () => {
  it('finds it in the line the CLI actually writes', () => {
    expect(findUrl('bombista serve — http://127.0.0.1:51234/ (ctrl-c to stop)')).toBe(
      'http://127.0.0.1:51234/'
    )
  })

  it('finds nothing in output that has no address yet', () => {
    expect(findUrl('loading model…')).toBeNull()
  })

  it('does not mistake some other host for loopback', () => {
    expect(findUrl('http://192.168.1.9:8000/')).toBeNull()
  })
})

describe('starting the review server', () => {
  it('passes the staging directory and the song, and always an ephemeral port', async () => {
    const child = fakeChild()
    const spawnFn = vi.fn(() => child)
    const pending = startBombistaServe(['/staging/pimiento', '/songs/pimiento.json'], { spawn: spawnFn })
    child.stdout.emit('data', 'bombista serve — http://127.0.0.1:5000/ (ctrl-c to stop)\n')
    await pending
    expect(spawnFn.mock.calls[0]![1]).toEqual([
      'serve',
      '/staging/pimiento',
      '/songs/pimiento.json',
      '--port',
      '0',
    ])
  })

  it('resolves with the address once it is printed', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child })
    child.stdout.emit('data', 'bombista serve — http://127.0.0.1:5051/ (ctrl-c to stop)\n')
    const r = await pending
    expect(r.ok).toBe(true)
    expect(r.url).toBe('http://127.0.0.1:5051/')
  })

  it('reads the address off stderr too, wherever the CLI happens to put it', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child })
    child.stderr.emit('data', 'http://127.0.0.1:5052/')
    expect((await pending).url).toBe('http://127.0.0.1:5052/')
  })

  it('reports a missing binary rather than throwing — a machine with no Python still performs', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child })
    child.emit('error', new Error('spawn bombista ENOENT'))
    const r = await pending
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ENOENT/)
  })

  it('reports a process that dies without announcing an address, with what it said', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child })
    child.stderr.emit('data', 'Error: no lyrics argument\n')
    child.emit('exit', 1)
    const r = await pending
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no lyrics argument/)
  })

  it('gives up rather than hanging, and kills what it started', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child, timeout: 5 })
    const r = await pending
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/did not announce an address in time/)
    expect(child.kill).toHaveBeenCalled()
  })

  it('answers once, whatever arrives afterwards', async () => {
    const child = fakeChild()
    const pending = startBombistaServe([], { spawn: () => child })
    child.stdout.emit('data', 'http://127.0.0.1:1/')
    child.emit('exit', 1)
    expect((await pending).url).toBe('http://127.0.0.1:1/')
  })
})
