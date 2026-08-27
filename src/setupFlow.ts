/**
 * **The setup flow: six ordered steps, and where the forward button greys.**
 *
 * Everything here is a *rendering* of `computeGigReadiness`. **Nothing in this file decides whether
 * anything is ready** — it takes the delta that function already returns and answers the questions
 * a guided path asks of it: which step are you on, may you go forward, and what does a blocked step
 * say. A second opinion about readiness would be the warp problem in a different costume.
 *
 * ## The order, and why it is this order
 *
 * 1. **Prepare the songs** — first, because songs are **gig-independent** and are often done days
 *    ahead. `bombista new`, the words, alignment, review and tempo, `bombista validate`.
 * 2. **Create the gig**, with a setlist drawn from those songs.
 * 3. **Gig visuals**: the room's shapes and the type of each. Serves every song.
 * 4. **Song visuals** — optional, deviating songs only, and reassignment only.
 * 5. **Readiness check, at the venue**, where the projection is recalibrated against the wall.
 * 6. **Setup confirmed.**
 *
 * ## The block is on the guided path, and nowhere else
 *
 * Pregonero **greys a forward button**. It never refuses to open, parse or display a half-built gig
 * — the gig file exists from step 2 and being incomplete is its normal state, so a block that
 * prevented loading would make a half-built gig impossible to finish. Every step stays readable at
 * any time; only *moving on* is held.
 *
 * ## The escape hatch is said out loud
 *
 * A blocked step also reads **or do it in the tool that owns it and come back**. That is not a
 * workaround being tolerated, it is the relief valve that makes strict blocking affordable: every
 * tool in the suite is fully usable on its own by requirement, so the blocked path is never the
 * only path. **Pregonero owns the flow, not the capability.** Work done outside comes back in
 * through the on-open re-check, which is why step completion is derived from the files and never
 * stored as progress.
 */

import type { GigReadiness, GigStep, StepStatus } from './gigReadiness'

export const FIRST_STEP = 1
export const LAST_STEP = 6

/** What each step is for, in the words the screen shows above the work. */
export const STEP_PURPOSE: Record<number, string> = {
  1: 'Songs are gig-independent, so they come first and are usually done days ahead. A song needs lyrics and audio — the timeline comes from aligning one against the other.',
  2: 'A gig is a folder with a file in it: the date, the venue, and a setlist drawn from the songs above.',
  3: 'The room, mapped at the wall: the shapes and the type of each. One setup serves every song.',
  4: 'Only for a song that deviates, and reassignment only — pick which existing shape it uses. A song never holds its own geometry.',
  5: 'At the venue. Everything above, re-checked against the actual room, plus the rig.',
  6: 'Setup finishes at the venue, not at home. This is where you can stand in the room and know you took every step.',
}

/**
 * The tool that owns the work a blocked step is waiting for, and the sentence that says so.
 *
 * **One string per step, and it is the load-bearing one.** It teaches the ownership rule at exactly
 * the moment the rule matters: the thing this step needs is not Pregonero's to make.
 */
export const STEP_ESCAPE_HATCH: Record<number, string> = {
  1: 'Or run bombista yourself in a terminal and come back — it is fully usable on its own, and Pregonero re-checks the files when you return.',
  2: 'Or write gig.json by hand in the folder and come back — Pregonero reads what is in the file rather than replacing it.',
  3: 'Or map the wall directly in Muralista and come back — it needs no Pregonero, and the room is discovered on the next re-check.',
  4: 'Or map the wall directly in Muralista and come back — it needs no Pregonero, and the room is discovered on the next re-check.',
  5: 'Or fix what is missing wherever it lives — the song files are Bombista’s, the room is Muralista’s — and come back.',
  6: 'Or leave setup unconfirmed: arming warns, it never refuses. The hard gate is per-song completeness, which is a different thing.',
}

/**
 * **Step 4 is optional**, and that is a fact about the flow rather than about the delta.
 *
 * A gig where no song deviates is fully set up having done nothing at step 4, so holding the
 * forward button there would block the common case on the rare one.
 */
export const OPTIONAL_STEPS: readonly number[] = [4]

export type FlowStep = {
  step: number
  name: string
  status: StepStatus
  missing: string[]
  notes: string[]
  purpose: string
  /** Whether the forward button is live on this step. */
  canGoForward: boolean
  /** Why not, in the words the screen shows. Null when it is live. */
  blockedReason: string | null
  /** The sentence a blocked step says out loud. Null when nothing is blocked. */
  escapeHatch: string | null
}

function stepOf(readiness: GigReadiness, step: number): GigStep {
  return (
    readiness.steps.find((s) => s.step === step) ?? {
      step,
      name: `Step ${step}`,
      status: 'not-yet',
      missing: [],
      notes: [],
    }
  )
}

/** One step, as the guided path sees it. */
export function flowStep(readiness: GigReadiness, step: number): FlowStep {
  const base = stepOf(readiness, step)
  const optional = OPTIONAL_STEPS.includes(step)
  const last = step >= LAST_STEP
  const open = optional || base.status === 'complete'
  const canGoForward = !last && open
  const blockedReason = last || open ? null : (base.missing[0] ?? `${base.name} is not done yet.`)
  return {
    step,
    name: base.name,
    status: base.status,
    missing: base.missing,
    notes: base.notes,
    purpose: STEP_PURPOSE[step] ?? '',
    canGoForward,
    blockedReason,
    // The hatch is said whenever the step is not done, whether or not the flow is held here:
    // an optional step that is incomplete still has work somebody may want to do elsewhere.
    escapeHatch: base.status === 'complete' ? null : (STEP_ESCAPE_HATCH[step] ?? null),
  }
}

/** Every step, in order. */
export function flowSteps(readiness: GigReadiness): FlowStep[] {
  const steps: FlowStep[] = []
  for (let step = FIRST_STEP; step <= LAST_STEP; step++) steps.push(flowStep(readiness, step))
  return steps
}

/**
 * Where the flow puts you when you arrive: the first step that is not done.
 *
 * **Derived, like everything else here.** Storing "you got to step 4" would diverge the moment work
 * happened outside Pregonero, and would diverge silently.
 */
export function currentStep(readiness: GigReadiness): number {
  for (let step = FIRST_STEP; step <= LAST_STEP; step++) {
    const base = stepOf(readiness, step)
    if (base.status !== 'complete' && !OPTIONAL_STEPS.includes(step)) return step
  }
  return LAST_STEP
}
