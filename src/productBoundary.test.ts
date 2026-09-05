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
import { PLAYER, SHELL, SHARED, UNSPLIT, KNOWN_CROSSINGS } from './productBoundary'

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

  it('pins the modules that contain both products at exactly two', () => {
    // `App.tsx` is the router and holds Standby, the performing view and the projection window
    // while importing every one of the shell's screens. **That is the extraction's first work
    // item and the whole of its known cost**, and it is allowed to be paid, never to grow.
    expect([...UNSPLIT].sort()).toEqual(['App.tsx', 'main.tsx'])
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
  it('imports nothing the player owns', () => {
    // Stronger than was asked, and it held on the day it was written, so it is kept. The shell
    // reads the same files the player does — that is `SHARED`, and it is the contract.
    expect(edges(SHELL, PLAYER)).toEqual([])
  })
})

describe('what is shared belongs to neither product', () => {
  it('reaches into the player exactly once, and that crossing is named', () => {
    // **`mediaSources.ts` imports `isStaticType` from `ShapeStatic.tsx`** — a pure predicate that
    // happens to live in a component file, so a shared reader reaches into a player renderer.
    // Moving it is a one-line change and was **deliberately not made**: the round that drew this
    // line moved no code to make a test pass. Pinned here so a second one turns this red.
    expect(edges(SHARED, PLAYER)).toEqual(KNOWN_CROSSINGS)
  })

  it('reaches into the shell not at all', () => {
    expect(edges(SHARED, SHELL)).toEqual([])
  })

  it('reaches into the router not at all', () => {
    expect(edges(SHARED, UNSPLIT)).toEqual([])
  })
})
