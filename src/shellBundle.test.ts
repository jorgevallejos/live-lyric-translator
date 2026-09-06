/**
 * **THE SHELL'S BUNDLE CONTAINS NO PLAYER.**
 *
 * `productBoundary.test.ts` asserts that no SHELL *file* imports a PLAYER *file*. That is a
 * statement about the files someone wrote. **This is a statement about what the bundler builds**,
 * and the two are not the same question: `App.tsx` imported two small symbols from `PlayerApp.tsx`
 * — a route predicate and a timer wrapper — and an import is all-or-nothing, so the shell's entry
 * shipped every view the player has, the whole compositor, 255 KB of it.
 *
 * **Nothing went red for that, from `v0.102.0` until `v0.107.0`.** The frame was drawn, the two
 * products looked separate in every diagram and every boundary test, and the code was never
 * severed. It was found by walking the graph while planning the repo split, not by a failing test.
 *
 * So this walks the graph. **It starts at the real entry** — `main.tsx`, what `index.html` loads —
 * follows every relative import, and asserts the closure holds nothing classified `PLAYER`.
 *
 * If this goes red, do not add the module to an exception list. **A shell file has reached into the
 * player, and the fix is to move the thing they share to `SHARED` or to stop sharing it.**
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, normalize, basename } from 'node:path'
import { PLAYER } from './productBoundary'

const RELATIVE_IMPORT = /(?:from|import)\s+['"](\.[^'"]+)['"]/g

function resolveFrom(file: string, spec: string): string | undefined {
  const base = normalize(join(dirname(file), spec))
  for (const ext of ['', '.ts', '.tsx', '.json', '/index.ts', '/index.tsx']) {
    if (existsSync(base + ext)) return base + ext
  }
  return undefined
}

/** Every module reachable from an entry by relative import, the entry included. */
function closureFrom(entry: string): Set<string> {
  const seen = new Set<string>()
  const stack = [entry]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.tsx?$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const resolved = resolveFrom(file, match[1])
      if (resolved !== undefined && !seen.has(resolved)) stack.push(resolved)
    }
  }
  return seen
}

describe("the shell's bundle", () => {
  it('reaches no module the boundary calls the player’s', () => {
    const reached = [...closureFrom('src/main.tsx')].map((f) => basename(f))
    const player = reached.filter((name) => PLAYER.includes(name))
    // Named in the failure so the message says which door was opened, not just that one was.
    expect(player).toEqual([])
  })

  it('still reaches the shell’s own rooms, so the walk is not vacuously empty', () => {
    // A closure that resolved nothing would pass the test above for the wrong reason — the standing
    // tell that a test which arranges nothing proves nothing.
    const reached = [...closureFrom('src/main.tsx')].map((f) => basename(f))
    expect(reached).toContain('App.tsx')
    expect(reached).toContain('SetupHomeView.tsx')
    expect(reached).toContain('GigFlowView.tsx')
  })

  it('is measured from what index.html actually loads', () => {
    expect(readFileSync('index.html', 'utf8')).toContain('/src/main.tsx')
  })
})
