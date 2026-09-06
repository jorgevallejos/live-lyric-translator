/**
 * **THE THIRTY-ONE MODULES THAT EXIST IN BOTH REPOSITORIES, AND THE DRIFT THEY COULD HIDE.**
 *
 * The split of 2026-09-06 gave the player its own repository and its own build. It could not give
 * it its own copy of the *contract*: `gigFile.ts`, `songState.ts`, `visualsFile.ts`,
 * `setlistStore.ts` and their neighbours are how the shell writes what the player reads. **Both
 * products need them, so both repositories have them.**
 *
 * **That is the one thing the split made worse, and this is the price being paid deliberately.**
 * Before, there was one `gigFile.ts` and a change to it was a change for both products by
 * construction. Now the shell can change how it writes a gig, ship, and the vendored player will go
 * on reading the old shape — **at a gig, on the night, with no test anywhere having gone red.**
 *
 * So this goes red instead. It pins every shared module against Pregonero's copy at the tag in
 * `vendor/pregonero.shared.json`.
 *
 * **What to do when it fails, and it is never *update the digest*:**
 *
 * 1. Make the change in Pregonero, where the player reads the file.
 * 2. Tag Pregonero, rebuild, and re-vendor the page here.
 * 3. Regenerate this manifest from that tag, in the same commit as the source change.
 *
 * **A divergence that is genuinely wanted has to be written down**, not waved through — the two
 * products would then disagree about a file format, which is a decision, not an edit.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import shared from '../vendor/pregonero.shared.json'

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('the modules Tramoya shares with Pregonero', () => {
  it('are byte-identical to Pregonero’s copies at the vendored tag', () => {
    for (const [name, digest] of Object.entries(shared.files)) {
      const here = resolve(process.cwd(), 'src', name)
      expect(existsSync(here), `${name} is missing from this repository`).toBe(true)
      expect(sha256(readFileSync(here)), name).toBe(digest)
    }
  })

  it('name the tag those copies came from', () => {
    expect(shared.owner).toBe('pregonero')
    expect(shared.tag).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('include the data contract, which is the pair this exists for', () => {
    // If the contract files ever fell off this list the test would still pass, and pass for the
    // one reason that matters least. Named so that cannot happen quietly.
    for (const name of ['gigFile.ts', 'songState.ts', 'visualsFile.ts', 'setlistStore.ts']) {
      expect(Object.keys(shared.files)).toContain(name)
    }
  })

  it('are pinned against the same Pregonero the page came from', () => {
    // Two manifests, one product: a shared module from v1.0.0 and a built page from v1.0.1 would
    // be exactly the drift this file exists to catch, wearing the costume of a passing test.
    const page = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vendor/pregonero.source.json'), 'utf8')
    ) as { tag: string }
    expect(shared.tag).toBe(page.tag)
  })
})
