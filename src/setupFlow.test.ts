import { describe, it, expect } from 'vitest'
import { currentStep, flowStep, flowSteps, LAST_STEP, STEP_ESCAPE_HATCH } from './setupFlow'
import type { GigReadiness, GigStep, StepStatus } from './gigReadiness'

function step(n: number, status: StepStatus, missing: string[] = []): GigStep {
  return { step: n, name: `Step ${n}`, status, missing, notes: [] }
}

function readiness(
  statuses: Record<number, StepStatus>,
  missing: Record<number, string[]> = {}
): GigReadiness {
  return {
    doubledShapes: [],
    folderPath: '/gigs/g',
    gigId: 'g',
    date: null,
    venue: null,
    gate: 'on',
    steps: [1, 2, 3, 4].map((n) => step(n, statuses[n] ?? 'not-yet', missing[n] ?? [])),
    songs: [],
    playableSongIds: [],
    refusals: [],
    visualsRefusal: null,
    canConfirm: false,
    validationSkipped: false,
    confirmation: null,
    adoption: null,
  }
}

const ALL_COMPLETE: Record<number, StepStatus> = {
  1: 'complete',
  2: 'complete',
  3: 'complete',
  4: 'complete',
}

describe('the guided path', () => {
  it('has four steps, in order', () => {
    const steps = flowSteps(readiness({}))
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4])
    expect(LAST_STEP).toBe(4)
  })

  describe('the forward button', () => {
    it('is live when the step is done', () => {
      expect(flowStep(readiness({ 1: 'complete' }), 1).canGoForward).toBe(true)
    })

    it('greys when the step is not done, and says why', () => {
      const r = readiness({ 1: 'not-yet' }, { 1: ['The gig has no date.'] })
      expect(flowStep(r, 1).canGoForward).toBe(false)
      expect(flowStep(r, 1).blockedReason).toBe('The gig has no date.')
    })

    it('greys on a broken step too', () => {
      expect(flowStep(readiness({ 3: 'broken' }), 3).canGoForward).toBe(false)
    })

    /**
     * **There is no list of optional steps any more, and there must not be one.**
     *
     * A step whose optional half is undone is `complete` in the delta, with the work in `notes` —
     * so it is open here for the same reason every complete step is, and this file forms no
     * opinion of its own about which half of a step mattered.
     */
    it('is live on a step the delta calls complete, whatever notes it carries', () => {
      const r = readiness({ 3: 'complete' })
      r.steps[2]!.notes = ['duelo: no shape carries this song']
      expect(flowStep(r, 3).canGoForward).toBe(true)
      expect(flowStep(r, 3).blockedReason).toBeNull()
    })

    it('has nowhere to go from the last step', () => {
      expect(flowStep(readiness(ALL_COMPLETE), 4).canGoForward).toBe(false)
      expect(flowStep(readiness(ALL_COMPLETE), 4).blockedReason).toBeNull()
    })
  })

  describe('the escape hatch', () => {
    it('is said out loud on a step that is not done', () => {
      expect(flowStep(readiness({ 3: 'not-yet' }), 3).escapeHatch).toBe(STEP_ESCAPE_HATCH[3])
      expect(flowStep(readiness({ 3: 'not-yet' }), 3).escapeHatch).toMatch(/Muralista/)
    })

    it('names the tool or the file that owns the work, step by step', () => {
      expect(STEP_ESCAPE_HATCH[1]).toMatch(/gig\.json/)
      expect(STEP_ESCAPE_HATCH[2]).toMatch(/gig\.json/)
      expect(STEP_ESCAPE_HATCH[3]).toMatch(/Muralista/)
      expect(STEP_ESCAPE_HATCH[4]).toMatch(/arming warns/)
    })

    /**
     * **No step points at a terminal any more.** The old step 1 read "Or run bombista yourself in a
     * terminal and come back", which is the 2026-08-31 dead end verbatim. Song preparation left
     * this flow with that step; nothing here should invite it back.
     */
    it('never sends anybody to a terminal', () => {
      for (const hatch of Object.values(STEP_ESCAPE_HATCH)) {
        expect(hatch).not.toMatch(/terminal/i)
      }
    })

    it('is silent on a step that is done', () => {
      expect(flowStep(readiness({ 3: 'complete' }), 3).escapeHatch).toBeNull()
    })
  })

  describe('where the flow puts you', () => {
    it('is the first step that is not done', () => {
      expect(currentStep(readiness({ 1: 'complete', 2: 'complete' }))).toBe(3)
    })

    /**
     * **A from-scratch gig opens on its own first step, and that step is the gig.** It used to open
     * on "Prepare the songs" — a library step, gated, pointing at a terminal.
     */
    it('is the gig itself on a gig with nothing in it', () => {
      expect(currentStep(readiness({}))).toBe(1)
    })

    it('is the end when everything is done', () => {
      expect(currentStep(readiness(ALL_COMPLETE))).toBe(4)
    })

    it('is derived, never stored — the same readiness gives the same answer twice', () => {
      const r = readiness({ 1: 'complete' })
      expect(currentStep(r)).toBe(currentStep(r))
    })
  })
})
