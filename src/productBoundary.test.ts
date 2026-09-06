/**
 * **THE BOUNDARY, MEASURED** (2026-09-05).
 *
 * `productBoundary.ts` declares which modules are the player's and which are the shell's. This
 * reads the actual import graph and checks the declaration against it, so **the line goes red on
 * the day it is crossed** rather than on the day someone tries to separate the two products.
 *
 * **It moves no code and it must never be made to pass by moving any.** If a new import crosses,
 * the answer is either that the module was classified wrongly — fix the declaration and say why —
 * or that the crossing is real, in which case it is a design question and not a test failure to
 * route around.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import {
  PLAYER,
  SHELL,
  SHARED,
  UNSPLIT,
  HOST_SEAM,
  KNOWN_CROSSINGS,
  PLAYER_MAY_READ_FROM_CATALOGUE,
} from './productBoundary'

const SRC = resolve(__dirname)

/**
 * **What the boundary is drawn around**: the app's own modules.
 *
 * `vendor/` is somebody else's code and is never edited here; `fixtures/` and `testSupport/` exist
 * for the tests and ship in neither product.
 */
const SKIP_DIRS = new Set(['vendor', 'fixtures', 'testSupport'])

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      sourceFiles(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    if (/\.d\.ts$/.test(entry.name)) continue
    out.push(relative(SRC, full))
  }
  return out
}

/** Relative imports only — a package import crosses no boundary of this repo's. */
function importsOf(moduleRelPath: string): string[] {
  const src = readFileSync(join(SRC, moduleRelPath), 'utf8')
  const found = new Set<string>()
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"](\.[^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const base = resolve(dirname(join(SRC, moduleRelPath)), m[1]!)
    for (const ext of ['', '.ts', '.tsx']) {
      try {
        if (statSync(base + ext).isFile()) {
          found.add(relative(SRC, base + ext))
          break
        }
      } catch {
        // not this extension
      }
    }
  }
  return [...found]
}

const MODULES = sourceFiles(SRC).sort()
const GRAPH = new Map(MODULES.map((m) => [m, importsOf(m)]))

function edges(from: readonly string[], to: readonly string[]): string[] {
  const target = new Set(to)
  const out: string[] = []
  for (const m of from) {
    for (const dep of GRAPH.get(m) ?? []) {
      if (target.has(dep)) out.push(`${m} -> ${dep}`)
    }
  }
  return out.sort()
}

describe('every module is on one side of the line', () => {
  it('classifies every source module, exactly once', () => {
    // **A new file forces a decision.** That is most of this test's value: the crossing that
    // matters is the one nobody thought about, and an unclassified module is that shape.
    const declared = [...PLAYER, ...SHELL, ...SHARED, ...UNSPLIT]
    expect([...new Set(declared)]).toHaveLength(declared.length)
    expect([...declared].sort()).toEqual(MODULES)
  })

  it('leaves no module belonging to both products', () => {
    // **`App.tsx` was the one, and the cost has been paid** (2026-09-06). It defined Standby, the
    // performing view and the projection window while importing every one of the shell's rooms to
    // route to them; those screens are their own files now, `PlayerApp.tsx` is the player's router
    // and `App.tsx` is the shell's. **The empty list is the guard**: a module that belongs to both
    // has to be named here to exist.
    expect(UNSPLIT).toEqual([])
  })
})

describe('the player does not reach into the shell', () => {
  it('imports nothing the shell owns', () => {
    // **The claim the design asked for.** The player receives a gig and never reaches into
    // Backstage, Preferences or the catalogue.
    expect(edges(PLAYER, SHELL)).toEqual([])
  })

  it('imports neither the router nor the entry point', () => {
    expect(edges(PLAYER, UNSPLIT)).toEqual([])
  })
})

describe('the shell does not reach into the player either', () => {
  it('reaches into the player exactly once, through the host seam', () => {
    // **`App.tsx` mounts `PlayerApp`, and that is the whole of it.** Today it is a component;
    // **when the player becomes a framed page it becomes a URL**, and that is the line that
    // changes. Pinned so a second edge — the shell reaching past the seam into a player screen or
    // a player module — turns this red.
    //
    // Everything else the shell needs from the player's side it reads through `SHARED`: the same
    // `gig.json`, the same catalogue, the same song. That is the contract, not a leak.
    expect(edges(SHELL, PLAYER)).toEqual(HOST_SEAM)
  })
})

describe('what is shared belongs to neither product', () => {
  it('reaches into the player not at all, since v0.107.0', () => {
    // There was one crossing — `mediaSources.ts` importing `isStaticType` from `ShapeStatic.tsx` —
    // named rather than fixed, because that round moved no code to make a test pass. The repo
    // split paid it: the predicate is a fact about the file format and now lives in
    // `visualsFile.ts`. **Empty is the assertion now**, not a list with one entry on it.
    expect(edges(SHARED, PLAYER)).toEqual(KNOWN_CROSSINGS)
    expect(KNOWN_CROSSINGS).toEqual([])
  })

  it('reaches into the shell not at all', () => {
    expect(edges(SHARED, SHELL)).toEqual([])
  })

  it('reaches into the router not at all', () => {
    expect(edges(SHARED, UNSPLIT)).toEqual([])
  })
})

describe('the player reads the catalogue and never writes it', () => {
  it('takes only the declared read symbols from `setlistStore`', () => {
    // **The one place the design's line can be broken without any import crossing.**
    // `setlistStore.ts` is `SHARED` because it holds a read half the player needs and a management
    // half that is the shell's — so the symbols are pinned rather than the module. A write
    // reaching the player turns this red.
    const taken = new Set<string>()
    for (const module of PLAYER) {
      const src = readFileSync(join(SRC, module), 'utf8')
      const re = /import\s+\{([^}]*)\}\s+from\s+'\.\/setlistStore'/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        for (const raw of m[1]!.split(',')) {
          const name = raw.trim().replace(/^type\s+/, '')
          if (name) taken.add(name)
        }
      }
    }
    expect([...taken].sort()).toEqual([...PLAYER_MAY_READ_FROM_CATALOGUE].sort())
  })
})
