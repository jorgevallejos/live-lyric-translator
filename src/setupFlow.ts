/**
 * **The setup flow: four ordered steps, and where the forward button greys.**
 *
 * Everything here is a *rendering* of `computeGigReadiness`. **Nothing in this file decides whether
 * anything is ready** — it takes the delta that function already returns and answers the questions
 * a guided path asks of it: which step are you on, may you go forward, and what does a blocked step
 * say. A second opinion about readiness would be the warp problem in a different costume.
 *
 * ## The order, and why it is this order
 *
 * 1. **The gig** — its name, its venue, its date. The one step where anything is typed.
 * 2. **The setlist** — the songs of this gig, drawn from the library.
 * 3. **Visuals** — the room's shapes and the type of each, then the songs that deviate from them.
 * 4. **Setup confirmed** — at the venue, against the actual wall.
 *
 * ## What went, and why (2026-09-01)
 *
 * **There was a step 1 called *Prepare the songs*, and it is gone.** Its subject was the library
 * rather than this gig; the forward button was gated on it; `currentStep` returns the first step
 * that is not complete, so a from-scratch gig opened there; and its escape hatch read *"Or run
 * bombista yourself in a terminal and come back"*. That is, word for word, the screen that stopped
 * the 2026-08-31 walk. **The song door owns song preparation now** and is reached from Setup home
 * without a gig at all, which is where a gig-independent thing belongs.
 *
 * **The folder question is gone too.** First run records the gigs root once and `New gig` asks for
 * a name; picking a folder is the import path. Nothing in the flow asks for a filesystem path.
 *
 * **`OPTIONAL_STEPS` is gone, and was not replaced.** It listed step numbers that never hold the
 * flow — old step 4, the songs that deviate, because a gig where none does is complete having done
 * nothing there. Merged into step 3, half of that step is required and half is not, and a list of
 * step *numbers* cannot say that. So optionality is said where every other such distinction is
 * already said: **the delta puts the required half in `missing` and the optional half in `notes`**,
 * and this file needs no list of its own to render it. One less place holding an opinion about
 * readiness.
 *
 * ## The block is on the guided path, and nowhere else
 *
 * Pregonero **greys a forward button**. It never refuses to open, parse or display a half-built gig
 * — the gig file exists from step 1 and being incomplete is its normal state, so a block that
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
export const LAST_STEP = 4

/** What each step is for, in the words the screen shows above the work. */
export const STEP_PURPOSE: Record<number, string> = {
  1: 'A gig is a folder with a file in it. Name it, say where it is and when — the app makes the folder inside your gigs folder, so there is no path to choose.',
  2: 'The songs of this gig, in the order you will play them. Drawn from the library; a song that needs work is named here and fixed in its own door.',
  3: 'The room, mapped at the wall: the shapes and the type of each. One setup serves every song, and only a song that deviates needs anything more.',
  4: 'Setup finishes at the venue, not at home. This is where you can stand in the room, check it against the actual wall, and know you took every step.',
}

/**
 * The tool that owns the work a blocked step is waiting for, and the sentence that says so.
 *
 * **One string per step, and it is the load-bearing one.** It teaches the ownership rule at exactly
 * the moment the rule matters: the thing this step needs is not Pregonero's to make.
 */
export const STEP_ESCAPE_HATCH: Record<number, string> = {
  1: 'Or write gig.json by hand in the folder and come back — Tramoya reads what is in the file rather than replacing it.',
  2: 'Or name the running order in gig.json yourself and come back — the file states it, and this app performs what the file says.',
  3: 'Or map the wall directly in Muralista and come back — it needs no Tramoya, and the room is discovered on the next re-check.',
  4: 'Or leave setup unconfirmed: arming warns, it never refuses. The hard gate is per-song completeness, which is a different thing.',
}

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

/**
 * One step, as the guided path sees it.
 *
 * **The delta is the only judge.** A step is open when it is complete, full stop — there is no
 * list of exceptions here any more. What used to need one, an optional step, is now a step whose
 * optional work is in `notes` rather than `missing`, so it is already complete when the required
 * half is done and this function does not have to know which half was which.
 */
export function flowStep(readiness: GigReadiness, step: number): FlowStep {
  const base = stepOf(readiness, step)
  const last = step >= LAST_STEP
  const open = base.status === 'complete'
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
    // The hatch is said whenever the step is not done, whether or not the flow is held here.
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
    if (stepOf(readiness, step).status !== 'complete') return step
  }
  return LAST_STEP
}
