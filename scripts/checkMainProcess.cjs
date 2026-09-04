#!/usr/bin/env node
/**
 * **Every file in `electron/` has to parse, or the build fails.**
 *
 * **Why this exists, and it is not hypothetical.** `v0.44.0` removed the debrief, and the deletion
 * took `writeGigFile,` and the closing brace out of one destructuring in `main.cjs`, leaving
 * `= require('./gigFolder.cjs')`. **Eight releases shipped after that — `v0.44.0` to `v0.51.0` —
 * and not one of them could start.** Every one was built, installed, hash-verified and recorded as
 * *unwalked*, which is a different word from *unlaunchable*.
 *
 * **Nothing in the pipeline could see it.** Vitest never loads `electron/*.cjs` — the main process
 * is invisible to jsdom, which this repo already knew and wrote down. `npm run lint` is
 * `eslint src`, so it does not reach this folder at all. `tsc --noEmit` covers the TypeScript in
 * `src/`. And the renderer hash check, which is how a build is verified as installed, compares the
 * bytes of `index-*.js` and `index-*.css` — **it proves the right bytes are on the machine and says
 * nothing about whether they run.** Four checks, all green, on an app that died on launch.
 *
 * **This is the cheapest guard that would have caught it**, and it runs before `vite build` so a
 * file that cannot parse fails the build rather than the launch.
 *
 * **What it does NOT catch, said out loud so nobody reads more into a green run than is there:**
 *
 * - **A name that is bound nowhere.** The same deletion also left `writeGigFile` used at
 *   `main.cjs:513` and imported nowhere; with the brace restored that parses perfectly and throws
 *   at the first gig write. `eslint`'s `no-undef` over this folder is what catches that class, and
 *   it is not enabled here — see the report of 2026-09-04.
 * - **Anything that only fails at runtime**: a handler that throws, a protocol that resolves
 *   nowhere, an IPC name nothing answers. **Only launching the app catches those.**
 */

const { readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = join(__dirname, '..', 'electron')

/** Every `.cjs` under `electron/`, recursively — the folder is flat today and need not stay so. */
function cjsFilesIn(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...cjsFilesIn(full))
    else if (name.endsWith('.cjs')) out.push(full)
  }
  return out.sort()
}

const files = cjsFilesIn(ROOT)

// **An empty list is a failure, not a pass.** A check that silently covers nothing is worse than no
// check: it reports green forever the moment the folder moves or is renamed.
if (files.length === 0) {
  console.error(`No .cjs files found under ${ROOT} — this check is covering nothing.`)
  process.exit(1)
}

const broken = []
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) broken.push({ file, output: (result.stderr || '').trim() })
}

if (broken.length > 0) {
  console.error(`\nThe main process will not parse. The app cannot start.\n`)
  for (const { file, output } of broken) {
    console.error(`  ${file}`)
    console.error(
      output
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    )
    console.error('')
  }
  process.exit(1)
}

console.log(`main process: ${files.length} files parse`)
