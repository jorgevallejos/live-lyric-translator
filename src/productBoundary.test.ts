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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import {
  PLAYER,
  SHELL,
  SHARED,
  UNSPLIT,
  KNOWN_CROSSINGS,
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
    // **`PLAYER` is no longer among them**: those files live in Pregonero's repository now,
    // and what this asserts is that every file still HERE is the shell's or shared.
    const declared = [...SHELL, ...SHARED, ...UNSPLIT]
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

describe('the player is not in this repository', () => {
  it('has none of the files that went to Pregonero', () => {
    // **The split of 2026-09-06.** These names are kept, rather than deleted with the files, so
    // that a player module reappearing here turns this red. **A copy is how a vendored product
    // stops being vendored** — it starts as one file someone needed in a hurry and ends as a fork
    // nobody declared. The player is consumed as a built page: `vendorPregonero.test.ts` pins it.
    const present = PLAYER.filter((name) => existsSync(join(SRC, name)))
    expect(present).toEqual([])
  })

  it('still knows what left, so the guard above is not vacuous', () => {
    expect(PLAYER.length).toBeGreaterThan(30)
    expect(PLAYER).toContain('ControlView.tsx')
    expect(PLAYER).toContain('ProjectionView.tsx')
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
