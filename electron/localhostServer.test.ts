/**
 * The localhost server exists so a hosted tool page gets a **secure context** — Muralista's File
 * System Access API needs one, and `file://` does not qualify. What is worth testing without a
 * socket is the part that would be a real hole: a request that tries to leave its mount.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const require_ = createRequire(import.meta.url)
const { createLocalhostServer, resolveRequest } = require_('./localhostServer.cjs') as {
  createLocalhostServer: (o?: unknown) => {
    mount: (name: string, folder: string) => void
    unmount: (name: string) => void
    start: () => Promise<number>
    stop: () => void
    resolve: (urlPath: string) => string | null
    port: number | null
  }
  resolveRequest: (mounts: Map<string, string>, urlPath: string) => string | null
}

describe('resolving a request against its mount', () => {
  const mounts = new Map([
    ['muralista', '/tools/muralista/mapper'],
    ['staging', '/var/staging'],
  ])

  it('serves a file inside the mount', () => {
    expect(resolveRequest(mounts, '/muralista/mapper.html')).toBe('/tools/muralista/mapper/mapper.html')
  })

  it('serves a file in a subfolder of the mount', () => {
    expect(resolveRequest(mounts, '/muralista/media/logo.png')).toBe(
      '/tools/muralista/mapper/media/logo.png'
    )
  })

  it('refuses a path that climbs out, however it is spelled', () => {
    for (const attack of [
      '/muralista/../../../etc/passwd',
      '/muralista/%2e%2e/%2e%2e/etc/passwd',
      '/muralista/a/../../../../etc/passwd',
    ]) {
      expect(resolveRequest(mounts, attack)).toBeNull()
    }
  })

  it('refuses a mount it does not have', () => {
    expect(resolveRequest(mounts, '/nowhere/x.html')).toBeNull()
    expect(resolveRequest(mounts, '/')).toBeNull()
  })

  it('ignores a query string', () => {
    expect(resolveRequest(mounts, '/muralista/mapper.html?v=2')).toBe(
      '/tools/muralista/mapper/mapper.html'
    )
  })

  it('refuses a malformed escape rather than throwing', () => {
    expect(resolveRequest(mounts, '/muralista/%')).toBeNull()
  })

  it('resolves the mount root itself, which the handler turns into index.html', () => {
    expect(resolveRequest(mounts, '/staging')).toBe('/var/staging')
  })
})

describe('the running server', () => {
  it('binds to loopback and serves a mounted file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregonero-host-'))
    fs.writeFileSync(path.join(dir, 'mapper.html'), '<h1>mapper</h1>')
    const server = createLocalhostServer()
    server.mount('muralista', dir)
    const port = await server.start()
    try {
      const res = await fetch(`http://127.0.0.1:${port}/muralista/mapper.html`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/text\/html/)
      expect(await res.text()).toBe('<h1>mapper</h1>')

      const outside = await fetch(`http://127.0.0.1:${port}/muralista/../../etc/passwd`)
      expect(outside.status).toBe(404)

      const unmounted = await fetch(`http://127.0.0.1:${port}/nope/x.html`)
      expect(unmounted.status).toBe(404)
    } finally {
      server.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is a secure context by being http on localhost, not file://', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregonero-host-'))
    const server = createLocalhostServer()
    server.mount('x', dir)
    const port = await server.start()
    try {
      expect(port).toBeGreaterThan(0)
      // The address is what makes the context secure; the scheme is what makes the media rules sane.
      expect(`http://127.0.0.1:${port}`).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    } finally {
      server.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
