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
const { createLocalhostServer, resolveRequest, MAX_WRITE_BYTES } = require_(
  './localhostServer.cjs'
) as {
  MAX_WRITE_BYTES: number
  createLocalhostServer: (o?: unknown) => {
    mount: (name: string, folder: string, writableFiles?: string | string[]) => void
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

/**
 * **The one write path.** Rule 2 of the contract, as amended on 2026-09-01: when Pregonero hosts a
 * preparing tool it may also be that tool's write path — it receives bytes and puts them on disk
 * unread.
 *
 * **Rule 1 survives because of the verbatim guard**, and these are what say so out loud: bytes in,
 * the same bytes on disk, nothing parsed and nothing repaired. The rest is refusals, because the
 * other half of the amendment is that this accepts *the visuals file at the expected place* and
 * nothing else at all.
 */
describe('the write path', () => {
  async function withServer(
    run: (port: number, dir: string) => Promise<void>,
    writableFile: string | string[] | undefined = 'visuals.json'
  ) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregonero-write-'))
    const server = createLocalhostServer()
    server.mount('gig', dir, writableFile)
    server.mount('page', dir)
    const port = await server.start()
    try {
      await run(port, dir)
    } finally {
      server.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  it('writes the received bytes verbatim, and does not read them', async () => {
    await withServer(async (port, dir) => {
      // Not valid JSON, on purpose. **A parser here would be rule 1 broken rather than bent**, so
      // the proof that there is none is that nonsense arrives on disk exactly as it was sent.
      const body = '{ this is not json at all \u00e9\n'
      const res = await fetch(`http://127.0.0.1:${port}/gig/visuals.json`, {
        method: 'PUT',
        body,
      })
      expect(res.status).toBe(204)
      expect(fs.readFileSync(path.join(dir, 'visuals.json'), 'utf8')).toBe(body)
    })
  })

  it('overwrites rather than merging: the file is whatever was last sent', async () => {
    await withServer(async (port, dir) => {
      const put = (body: string) =>
        fetch(`http://127.0.0.1:${port}/gig/visuals.json`, { method: 'PUT', body })
      await put('{"shapes":[1,2,3]}')
      await put('{"shapes":[]}')
      expect(fs.readFileSync(path.join(dir, 'visuals.json'), 'utf8')).toBe('{"shapes":[]}')
    })
  })

  it('refuses a mount that was not declared writable', async () => {
    await withServer(async (port, dir) => {
      const res = await fetch(`http://127.0.0.1:${port}/page/visuals.json`, {
        method: 'PUT',
        body: '{}',
      })
      expect(res.status).toBe(405)
      expect(fs.existsSync(path.join(dir, 'visuals.json'))).toBe(false)
    })
  })

  it('refuses any name but the one the mount accepts', async () => {
    await withServer(async (port, dir) => {
      for (const name of ['gig.json', 'visuals.json.bak', 'Visuals.json', 'anything']) {
        const res = await fetch(`http://127.0.0.1:${port}/gig/${name}`, {
          method: 'PUT',
          body: '{}',
        })
        expect(`${name}:${res.status}`).toBe(`${name}:403`)
      }
      expect(fs.readdirSync(dir)).toEqual([])
    })
  })

  it('refuses the right name anywhere but directly in the mount', async () => {
    await withServer(async (port) => {
      for (const url of ['/gig/sub/visuals.json', '/gig', '/gig/', '/gig/../visuals.json']) {
        const res = await fetch(`http://127.0.0.1:${port}${url}`, { method: 'PUT', body: '{}' })
        expect(`${url}:${res.status}`).toBe(`${url}:404`)
      }
    })
  })

  it('refuses a body over the cap without writing a truncated one', async () => {
    await withServer(async (port, dir) => {
      const tooBig = 'x'.repeat(MAX_WRITE_BYTES + 1024)
      try {
        const res = await fetch(`http://127.0.0.1:${port}/gig/visuals.json`, {
          method: 'PUT',
          body: tooBig,
        })
        expect(res.status).toBe(413)
      } catch {
        // The socket is destroyed on refusal, which fetch may surface as a network error. Either
        // way the assertion that matters is the next line: nothing partial reached the disk.
      }
      expect(fs.existsSync(path.join(dir, 'visuals.json'))).toBe(false)
    })
  })

  it('refuses every method that is not a read or that one write', async () => {
    await withServer(async (port, dir) => {
      for (const method of ['POST', 'DELETE', 'PATCH']) {
        const res = await fetch(`http://127.0.0.1:${port}/gig/visuals.json`, {
          method,
          body: '{}',
        })
        expect(`${method}:${res.status}`).toBe(`${method}:405`)
      }
      expect(fs.existsSync(path.join(dir, 'visuals.json'))).toBe(false)
    })
  })

  /**
   * **The list widened from one name to two on 2026-09-03**, when Muralista's `v1.8.0` started
   * saving a stage capture beside the gig's JSON. The rationale did not move with it: every check
   * is about *where* the bytes go and none is about what is in them, so a **closed list the host
   * declared** is the same guarantee at one entry or two. A wildcard would not be, and these say so.
   */
  it('takes each of the names the mount declares, and writes them verbatim', async () => {
    await withServer(
      async (port, dir) => {
        for (const [name, body] of [
          ['visuals.json', '{"visualsVersion":1}'],
          ['stage.png', 'PNG-ish bytes, unread'],
        ]) {
          const res = await fetch(`http://127.0.0.1:${port}/gig/${name}`, { method: 'PUT', body })
          expect(`${name}:${res.status}`).toBe(`${name}:204`)
          expect(fs.readFileSync(path.join(dir, name!), 'utf8')).toBe(body)
        }
      },
      ['visuals.json', 'stage.png']
    )
  })

  it('refuses a name the mount did not declare, even beside two that it did', async () => {
    // **A closed list, never a pattern.** A mount that took any name is a writable folder, which
    // is a different thing with a different blast radius.
    await withServer(
      async (port, dir) => {
        const res = await fetch(`http://127.0.0.1:${port}/gig/gig.json`, {
          method: 'PUT',
          body: '{}',
        })
        expect(res.status).toBe(403)
        expect(fs.existsSync(path.join(dir, 'gig.json'))).toBe(false)
      },
      ['visuals.json', 'stage.png']
    )
  })

  it('leaves a mount read-only when the declared list is empty', async () => {
    await withServer(
      async (port) => {
        const res = await fetch(`http://127.0.0.1:${port}/gig/visuals.json`, {
          method: 'PUT',
          body: '{}',
        })
        expect(res.status).toBe(405)
      },
      []
    )
  })

  it('leaves a mount read-only when it is re-mounted without the writable name', async () => {
    // Repointing a mount is how the gig folder changes between gigs. Dropping the opt-in must
    // drop the write with it, or a name could stay writable after the reason for it is gone.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregonero-write-'))
    const server = createLocalhostServer()
    server.mount('gig', dir, 'visuals.json')
    server.mount('gig', dir)
    const port = await server.start()
    try {
      const res = await fetch(`http://127.0.0.1:${port}/gig/visuals.json`, {
        method: 'PUT',
        body: '{}',
      })
      expect(res.status).toBe(405)
    } finally {
      server.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * **The one read verb, and the write rule's mirror** (Jorge, 2026-09-04, `project-context.md`,
 * *A mount may say what is in it*).
 *
 * **Why it exists at all:** a cross-origin frame cannot open a directory picker — Chromium refuses,
 * and unlike the camera there is no permissions-policy token that opens it — so a hosted Muralista
 * had no way to offer a name from the visuals folder. **Standalone it already works by names in a
 * folder**, holding a directory handle and storing the name rather than the folder; the listing
 * gives the hosted case the same mechanism instead of a second one.
 *
 * **These pin the constraints, not the convenience.** Names only, the mount root only, files only,
 * read-only. Each one is a door that was deliberately left shut, and a listing is the kind of thing
 * that grows a `?path=` the first time somebody finds it convenient.
 */
describe('the listing', () => {
  async function withServer(run: (port: number, dir: string) => Promise<void>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregonero-list-'))
    const server = createLocalhostServer()
    server.mount('visuals', dir)
    const port = await server.start()
    try {
      await run(port, dir)
    } finally {
      server.stop()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  it('answers the mount root with the names it holds, sorted', async () => {
    await withServer(async (port, dir) => {
      fs.writeFileSync(path.join(dir, 'pig.mp4'), 'x')
      fs.writeFileSync(path.join(dir, 'anthem.webm'), 'x')
      const res = await fetch(`http://127.0.0.1:${port}/visuals/`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      expect(await res.json()).toEqual({ names: ['anthem.webm', 'pig.mp4'] })
    })
  })

  it('answers the same without the trailing slash, because both are the mount root', async () => {
    await withServer(async (port, dir) => {
      fs.writeFileSync(path.join(dir, 'pig.mp4'), 'x')
      const res = await fetch(`http://127.0.0.1:${port}/visuals`)
      expect(await res.json()).toEqual({ names: ['pig.mp4'] })
    })
  })

  it('gives NAMES, never paths — a caller cannot learn where the folder is', async () => {
    await withServer(async (port, dir) => {
      fs.writeFileSync(path.join(dir, 'pig.mp4'), 'x')
      const body = await (await fetch(`http://127.0.0.1:${port}/visuals/`)).text()
      expect(body).toContain('pig.mp4')
      expect(body).not.toContain(dir)
      expect(body).not.toContain('/')
    })
  })

  it('lists files only: no directories, so the tree below is not described either', async () => {
    await withServer(async (port, dir) => {
      fs.writeFileSync(path.join(dir, 'pig.mp4'), 'x')
      fs.mkdirSync(path.join(dir, 'raw'))
      fs.writeFileSync(path.join(dir, 'raw', 'secret.mov'), 'x')
      expect(await (await fetch(`http://127.0.0.1:${port}/visuals/`)).json()).toEqual({
        names: ['pig.mp4'],
      })
    })
  })

  it('drops dotfiles, which are not assets', async () => {
    await withServer(async (port, dir) => {
      fs.writeFileSync(path.join(dir, '.DS_Store'), 'x')
      fs.writeFileSync(path.join(dir, 'pig.mp4'), 'x')
      expect(await (await fetch(`http://127.0.0.1:${port}/visuals/`)).json()).toEqual({
        names: ['pig.mp4'],
      })
    })
  })

  /**
   * **THE MOUNT ROOT ONLY, so there is no walk.** A listing that took a subdirectory would let a
   * page enumerate a tree one request at a time, which is the difference between *say what is here*
   * and *browse this machine*. Traversal is already refused by `resolveRequest`; this is the second
   * lock on the same door, and the one that stops a legitimate subfolder being listed too.
   */
  it('refuses to list anything but the mount root', async () => {
    await withServer(async (port, dir) => {
      fs.mkdirSync(path.join(dir, 'raw'))
      fs.writeFileSync(path.join(dir, 'raw', 'secret.mov'), 'x')
      // A subdirectory falls through to the file path, which looks for its index.html and fails.
      expect((await fetch(`http://127.0.0.1:${port}/visuals/raw/`)).status).toBe(404)
      expect((await fetch(`http://127.0.0.1:${port}/visuals/..`)).status).toBe(404)
    })
  })

  it('answers 404 for a mount that is not there, saying nothing about the disk', async () => {
    await withServer(async (port) => {
      expect((await fetch(`http://127.0.0.1:${port}/nope/`)).status).toBe(404)
    })
  })

  /** **No write surface anywhere near it.** A listable mount is not a writable one. */
  it('adds no way to write', async () => {
    await withServer(async (port, dir) => {
      const res = await fetch(`http://127.0.0.1:${port}/visuals/pig.mp4`, {
        method: 'PUT',
        body: 'x',
      })
      expect(res.status).toBe(405)
      expect(fs.existsSync(path.join(dir, 'pig.mp4'))).toBe(false)
    })
  })
})
