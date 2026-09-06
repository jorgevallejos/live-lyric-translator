/**
 * **THE TEST THAT MAKES THE VENDORED PLAYER A CACHE AND NOT A FORK.**
 *
 * Pregonero is its own repository and its own product since 2026-09-06. Tramoya does not compile
 * it: it takes the page Pregonero built, at the tag written down beside it, and serves it from the
 * app's own origin. **This asks one question — are these still those bytes?**
 *
 * It is the arrangement `vendorWarp.test.ts` already describes for Muralista, and the same rule
 * applies: **if this fails, do not update the digests to match the files.** Either the copy was
 * edited in place, which nothing may do, or a genuine change landed in Pregonero — and then the
 * copy and the tag move together, by rebuilding there and re-vendoring here.
 *
 * **What this cannot answer is whether the page is correct.** Only Pregonero can, because only
 * Pregonero has its 1181 tests and its own build. A digest is meaningful precisely because the
 * bytes it pins were verified where they were made.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import source from '../vendor/pregonero.source.json'

function vendoredBytes(name: string): Buffer {
  return readFileSync(resolve(process.cwd(), 'vendor/pregonero', name))
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('the vendored Pregonero', () => {
  it('is byte-identical to the build it records, every file of it', () => {
    for (const [name, digest] of Object.entries(source.files)) {
      expect(sha256(vendoredBytes(name)), name).toBe(digest)
    }
  })

  it('names the tag it was taken from, not a branch or a date', () => {
    // "main" and "sometime in September" both fail to answer *which Pregonero is this*, which is
    // the only question the digests above are useful for.
    expect(source.owner).toBe('pregonero')
    expect(source.repository).toBe('https://github.com/jorgevallejos/pregonero')
    expect(source.tag).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('carries the entry the shell frames and the projection window opens', () => {
    expect(source.entry).toBe('player.html')
    expect(existsSync(resolve(process.cwd(), 'vendor/pregonero/player.html'))).toBe(true)
  })

  it('records every file that is actually there, so nothing rides along unpinned', () => {
    // A digest list that simply omitted a file would pass the first case while an unrecorded
    // script sat in the bundle. The manifest and the folder must agree in both directions.
    const listed = Object.keys(source.files).sort()
    const onDisk: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
        else onDisk.push(`${prefix}${entry.name}`)
      }
    }
    walk('vendor/pregonero', '')
    expect(onDisk.sort()).toEqual(listed)
  })

  it('is what the built page actually loads', () => {
    // The entry references its own assets by name; if a rebuild renamed a chunk and the manifest
    // was not regenerated, the page would ask for a file that is not here.
    const html = readFileSync(resolve(process.cwd(), 'vendor/pregonero/player.html'), 'utf8')
    for (const match of html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)) {
      expect(Object.keys(source.files)).toContain(match[1])
    }
  })
})
