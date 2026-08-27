import { describe, it, expect } from 'vitest'
import {
  currentStep,
  flowStep,
  flowSteps,
  LAST_STEP,
  OPTIONAL_STEPS,
  STEP_ESCAPE_HATCH,
} from './setupFlow'
import type { GigReadiness, GigStep, StepStatus } from './gigReadiness'

function step(n: number, status: StepStatus, missing: string[] = []): GigStep {
  return { step: n, name: `Step ${n}`, status, missing, notes: [] }
}

function readiness(statuses: Record<number, StepStatus>, missing: Record<number, string[]> = {}): GigReadiness {
  return {
    folderPath: '/gigs/g',
    gigId: 'g',
    date: null,
    venue: null,
    gate: 'on',
    steps: [1, 2, 3, 4, 5, 6].map((n) => step(n, statuses[n] ?? 'not-yet', missing[n] ?? [])),
    songs: [],
    playableSongIds: [],
    refusals: [],
    validationSkipped: false,
    confirmation: null,
    adoption: null,
  }
}

const ALL_COMPLETE: Record<number, StepStatus> = { 1: 'complete', 2: 'complete', 3: 'complete', 4: 'complete', 5: 'complete', 6: 'complete' }

describe('the guided path', () => {
  it('has six steps, in order', () => {
    const steps = flowSteps(readiness({}))
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6])
    expect(LAST_STEP).toBe(6)
  })

  describe('the forward button', () => {
    it('is live when the step is done', () => {
      expect(flowStep(readiness({ 1: 'complete' }), 1).canGoForward).toBe(true)
    })

    it('greys when the step is not done, and says why', () => {
      const r = readiness({ 1: 'not-yet' }, { 1: ['No songs yet.'] })
      expect(flowStep(r, 1).canGoForward).toBe(false)
      expect(flowStep(r, 1).blockedReason).toBe('No songs yet.')
    })

    it('greys on a broken step too', () => {
      expect(flowStep(readiness({ 3: 'broken' }), 3).canGoForward).toBe(false)
    })

    it('stays live on the optional step, so the common case is never held by the rare one', () => {
      expect(OPTIONAL_STEPS).toEqual([4])
      const r = readiness({ 4: 'not-yet' }, { 4: ['A song deviates and has nowhere to go.'] })
      expect(flowStep(r, 4).canGoForward).toBe(true)
      expect(flowStep(r, 4).blockedReason).toBeNull()
    })

    it('has nowhere to go from the last step', () => {
      expect(flowStep(readiness(ALL_COMPLETE), 6).canGoForward).toBe(false)
      expect(flowStep(readiness(ALL_COMPLETE), 6).blockedReason).toBeNull()
    })
  })

  describe('the escape hatch', () => {
    it('is said out loud on a step that is not done', () => {
      expect(flowStep(readiness({ 3: 'not-yet' }), 3).escapeHatch).toBe(STEP_ESCAPE_HATCH[3])
      expect(flowStep(readiness({ 3: 'not-yet' }), 3).escapeHatch).toMatch(/Muralista/)
    })

    it('names the tool that owns the work, step by step', () => {
      expect(STEP_ESCAPE_HATCH[1]).toMatch(/bombista/)
      expect(STEP_ESCAPE_HATCH[3]).toMatch(/Muralista/)
      expect(STEP_ESCAPE_HATCH[4]).toMatch(/Muralista/)
    })

    it('is said on the optional step too, which is not blocked but does have work', () => {
      expect(flowStep(readiness({ 4: 'not-yet' }), 4).escapeHatch).toMatch(/Muralista/)
    })

    it('is silent on a step that is done', () => {
      expect(flowStep(readiness({ 3: 'complete' }), 3).escapeHatch).toBeNull()
    })
  })

  describe('where the flow puts you', () => {
    it('is the first step that is not done', () => {
      expect(currentStep(readiness({ 1: 'complete', 2: 'complete' }))).toBe(3)
    })

    it('is step 1 on a fresh install', () => {
      expect(currentStep(readiness({}))).toBe(1)
    })

    it('skips over the optional step rather than stopping on it', () => {
      expect(currentStep(readiness({ 1: 'complete', 2: 'complete', 3: 'complete', 4: 'not-yet' }))).toBe(5)
    })

    it('is the end when everything is done', () => {
      expect(currentStep(readiness(ALL_COMPLETE))).toBe(6)
    })

    it('is derived, never stored — the same readiness gives the same answer twice', () => {
      const r = readiness({ 1: 'complete' })
      expect(currentStep(r)).toBe(currentStep(r))
    })
  })
})
