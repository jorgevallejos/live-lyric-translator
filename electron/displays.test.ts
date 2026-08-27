/**
 * `describeDisplays` is pure over Electron's `screen` module, so it is testable without Electron.
 * The IPC round trip itself is not — that needs the real app, per CLAUDE.md.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { describeDisplays } = require_('./displays.cjs') as {
  describeDisplays: (screenModule: unknown) => {
    count: number
    displays: { id: string; width: number; height: number; primary: boolean }[]
    fingerprint: string
  }
}

function screenWith(displays: unknown[], primaryIndex = 0) {
  return {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[primaryIndex],
  }
}

const LAPTOP = { id: 1, size: { width: 1728, height: 1117 }, scaleFactor: 2, internal: true }
const PROJECTOR = { id: 2, size: { width: 1920, height: 1080 }, scaleFactor: 1, internal: false }

describe('describing the displays', () => {
  it('counts them and marks the primary', () => {
    const d = describeDisplays(screenWith([LAPTOP, PROJECTOR]))
    expect(d.count).toBe(2)
    expect(d.displays.map((x) => x.primary)).toEqual([true, false])
  })

  it('fingerprints size, scale and which is primary', () => {
    expect(describeDisplays(screenWith([LAPTOP, PROJECTOR])).fingerprint).toBe(
      '1728x1117@2* + 1920x1080@1'
    )
  })

  it('is stable whatever order the platform hands them over in', () => {
    const a = describeDisplays(screenWith([LAPTOP, PROJECTOR])).fingerprint
    const b = describeDisplays(screenWith([PROJECTOR, LAPTOP], 1)).fingerprint
    expect(a).toBe(b)
  })

  it('notices the projector being unplugged', () => {
    const withBoth = describeDisplays(screenWith([LAPTOP, PROJECTOR])).fingerprint
    const laptopOnly = describeDisplays(screenWith([LAPTOP])).fingerprint
    expect(withBoth).not.toBe(laptopOnly)
  })

  it('notices a projector swapped for one of another resolution', () => {
    const a = describeDisplays(screenWith([LAPTOP, PROJECTOR])).fingerprint
    const b = describeDisplays(
      screenWith([LAPTOP, { ...PROJECTOR, size: { width: 1280, height: 800 } }])
    ).fingerprint
    expect(a).not.toBe(b)
  })

  it('answers for a screen module that is not there rather than throwing', () => {
    expect(describeDisplays(undefined)).toEqual({ count: 0, displays: [], fingerprint: '' })
  })

  it('falls back to bounds when a display reports no size', () => {
    const d = describeDisplays(screenWith([{ id: 3, bounds: { width: 800, height: 600 } }]))
    expect(d.fingerprint).toBe('800x600@1*')
  })
})
