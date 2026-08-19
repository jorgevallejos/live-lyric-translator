import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { APP_VERSION } from './appVersion'

describe('APP_VERSION', () => {
  it('is the version package.json declares', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../package.json'), 'utf8')
    ) as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('imports the single field, not the whole manifest', () => {
    // A default JSON import cannot be tree-shaken, so it inlines the entire package.json —
    // scripts, dependencies and every pinned devDependency version — into the renderer bundle
    // that ships to users. Verified once against a real `vite build`: default import leaked the
    // manifest, named import emitted only the string. This guards the shape cheaply, because
    // running a build in the test suite would not be cheap.
    // Comments stripped first: the module's own comment quotes the bad form as the example of
    // what not to do, and matching raw text would flag the explanation instead of the code.
    const code = readFileSync(resolve(__dirname, 'appVersion.ts'), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(code).toMatch(/import\s*\{\s*version\s*\}\s*from\s*'\.\.\/package\.json'/)
    expect(code).not.toMatch(/import\s+\w+\s+from\s*'\.\.\/package\.json'/)
  })
})
