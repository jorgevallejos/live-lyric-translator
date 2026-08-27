import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { chooseProjectorDisplay } = require_('./projectorDisplay.cjs') as {
  chooseProjectorDisplay: (d: unknown) => { display: { id: string } | null; reason: string | null }
}

const LAPTOP = { id: '1', width: 1728, height: 1117, scaleFactor: 2, internal: true, primary: true }
const PROJECTOR = { id: '2', width: 1920, height: 1080, scaleFactor: 1, internal: false, primary: false }
const SECOND_MONITOR = { id: '3', width: 2560, height: 1440, scaleFactor: 1, internal: false, primary: false }

describe('choosing the projector', () => {
  it('is the external display when there is a laptop and a projector', () => {
    const r = chooseProjectorDisplay({ displays: [LAPTOP, PROJECTOR] })
    expect(r.display?.id).toBe('2')
    expect(r.reason).toBeNull()
  })

  it('takes it whichever order the platform lists them in', () => {
    expect(chooseProjectorDisplay({ displays: [PROJECTOR, LAPTOP] }).display?.id).toBe('2')
  })

  it('takes the first external one when there are two, rather than refusing to choose', () => {
    const r = chooseProjectorDisplay({ displays: [LAPTOP, PROJECTOR, SECOND_MONITOR] })
    expect(r.display?.id).toBe('2')
  })

  it('prefers an external display that is not primary, over one that is', () => {
    const externalPrimary = { ...PROJECTOR, id: '9', primary: true }
    const r = chooseProjectorDisplay({ displays: [externalPrimary, SECOND_MONITOR] })
    expect(r.display?.id).toBe('3')
  })

  it('falls back with a reason when there is only one display', () => {
    const r = chooseProjectorDisplay({ displays: [LAPTOP] })
    expect(r.display).toBeNull()
    expect(r.reason).toMatch(/Only one display/)
  })

  it('falls back with a reason when there are none at all', () => {
    expect(chooseProjectorDisplay({ displays: [] }).reason).toMatch(/No displays reported/)
    expect(chooseProjectorDisplay(undefined).display).toBeNull()
  })

  it('takes a non-primary display even when it calls itself internal', () => {
    // Two built-in panels is not a real rig, but "everything is internal" must not mean "nowhere".
    const r = chooseProjectorDisplay({
      displays: [LAPTOP, { ...LAPTOP, id: '4', primary: false }],
    })
    expect(r.display?.id).toBe('4')
  })

  it('says so rather than choosing when every display is primary', () => {
    const r = chooseProjectorDisplay({
      displays: [LAPTOP, { ...LAPTOP, id: '5' }],
    })
    expect(r.display).toBeNull()
    expect(r.reason).toMatch(/Every display is the primary one/)
  })
})
