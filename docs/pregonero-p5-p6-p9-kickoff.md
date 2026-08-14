# Pregonero — P5, P6, P9 kickoff (pulse, manual override, performed tempo)

**Written 2026-08-14 by the Cowork PM session.** This is **step 4b** of the plan in `context/current-priorities.md` — pulled forward from step 10 because it is **deadline-critical for the 21 Aug solo-ready date**, not polish.

Read `../../bombista/docs/bombista-product-backlog.md` — the P5/P6 rows, the new **P9** section, and the three **Rules established 2026-08-14** — before touching anything.

## Runs in parallel with B13

Bombista is on `feat/b13-migration` in the other submodule right now. Different repo, no shared files.

- Work in `projects/live-lyric-translator` only.
- Commit and push **inside this repo only**.
- **Do not bump the vault-root submodule pointer.** Jorge does that once, at the end.

## Why this is deadline work

Jorge plays **to the pulse** — a visual beat he performs against, not a drift reference. The pulse is **silent**; the app has never produced a click, and one is not planned (see the P10 candidate below). Everything below follows from that one fact.

---

## P5 — the pulse runs from Arm, and the cue must not re-phase it

**The real scenario:** Jorge talks to the audience while arming. The pulse starts. He picks the tempo up on guitar and plays a **2-bar intro to the pulse**, then cues the lyrics with the pedal when he is settled. The lyrics do not always start on the first pulse of a bar — **the performer owns the relationship between beat and first word.**

**The bug:** `startAtCue` currently calls `setPhase(getBeatPhase(tempo, 0))`, which forces the pedal press to become a downbeat. Live, that means the pulse **jumps at the exact moment he starts singing.**

**The fix:**

- Run the beat phase from **Arm**, while idle. It free-runs from there.
- The cue starts `songElapsedMs` and **nothing else**. Remove the `setPhase` call — do not replace it with a smarter re-phase.
- Two independent clocks: the pulse (from Arm) and the song timeline (from the cue). A constant offset between them is correct and expected.

**Acceptance:** arm a song, let the pulse run for an arbitrary time, press the pedal mid-bar. The pulse must not visually shift. Line 0 appears; the song advances.

---

## P6 — Next drops the song into Manual for the rest of the song

**The bug:** the auto-advance effect recomputes the index from elapsed time every tick and snaps to it, so a manual Next reverts within a tick. The buttons *look* like a safety net and are not one — and they fail exactly when drift shows up mid-song and the instinct is to tap Next.

**The fix (already chosen, do not redesign):** pressing Next or Previous during Auto playback **drops the song into Manual for the remainder of the song.** One press to take the wheel. Predictable under pressure, no new concepts.

- Auto-advance stops recomputing the index once Manual is taken.
- The state must be **visible** — the performer needs to know at a glance that the song is no longer driving itself.
- Resets on the next song / next arm. Not sticky across songs.

**Acceptance:** mid-song, press Next. The line advances and *stays* advanced. Auto does not snap it back on the next tick.

---

## P9 — performed-tempo scaling

**New, decided 2026-08-14.** Full rationale in the backlog's P9 section — read it, the reasoning matters more than the code.

Jorge may decide to perform a song at a different tempo than the recording. The scaling is applied **here, at playback** — Bombista never rewrites timestamps.

```
scale      = tempo.bpm (declared, from the recording) / performedBpm
cueTime[i] = timeline[i].start × scale
```

The pulse also runs at `performedBpm`. **Both derive from the same number**, so they cannot drift apart.

**Non-negotiables:**

1. **Never overwrite `tempo.bpm`.** That field is a fact about the recording and the anchor the whole scale depends on. Overwrite it once and the scaling silently becomes relative to a past gig, with nothing to detect it. If the performed tempo persists, it persists as a **separate key `performedBpm`**; `tempo.bpm` is untouched, always.
2. **Adjustable while idle, frozen once armed.** Changing the scale mid-song would jump the current line under the performer.
3. **Default `performedBpm` = `tempo.bpm`.** Scale of exactly 1.0, current behaviour byte-identical, no song changes unless Jorge nudges it.
4. **A song with no `tempo` block gets no pulse and no scaling** — unchanged from the existing rule. Do not invent a fallback BPM.

**Acceptance:** with `performedBpm == tempo.bpm`, every cue time is identical to today (assert this on Libertad's 20 lines). Set `performedBpm` to 1.5× declared and every cue time scales by 2/3 within rounding tolerance, and the pulse speeds up to match.

---

## Standing constraints

- **Establish the real test baseline from the parent commit** before treating "tests green" as a gate. A wrong baseline cost real debugging time on 2026-08-14.
- **Never weaken an assertion to hit a number.** If a test is wrong, say so and stop.
- One commit per item, item ID (`P5`, `P6`, `P9`) in the message. Tests green before each commit.
- **Regression guard:** the 11 un-timed songs must keep loading untouched, and Libertad must behave exactly as it does today when `performedBpm` is unset.

## Out of scope

- **P7 and P8** — lower priority, after the 21 Aug date.
- **B13, B15** — the other repo, other agent.
- **The rename (step 11).** Do not touch names, the bundle identifier, or `package.json` product fields.

---

## Found during implementation — P10 candidate: the pulse is silent

**Claude Code, 2026-08-14. Not built, by Jorge's explicit call: out of scope for this round, and a separate decision he wants to make away from this work. Logged here because the backlog lives in the other repo (`projects/bombista`), which the B13 agent was holding — the backlog row is Jorge's or Cowork's to add.**

P5 was originally specified and reasoned about throughout as a **click track Jorge plays to**. That wording has since been corrected above — it was loose, not a missing feature. The app does not produce a click. The pulse is **visual only**:

- `BeatCircle.tsx` renders a beat number and a dot row. That is the entire output.
- There is **no `AudioContext`, no `new Audio`, no oscillator and no audio asset anywhere in `src/`** — verified by grep across the renderer.

So what P5 delivers is a *visible* pulse that free-runs from Arm and does not re-phase on the cue. Every phase guarantee in P5 holds; the performer just has to **look at the screen** to use it. Playing a 2-bar intro to a click he cannot hear, while talking to an audience, is a materially different act from playing to one he can.

This does not weaken P5 — the phase behaviour is unchanged. **The P5 acceptance is visual because the pulse is visual, full stop:** the circle must not shift when the cue lands, and that is the whole test. It is not a visual stand-in for an audible check that is missing.

**Decided by Jorge, 2026-08-14: an audible click is out of scope and is not planned.** The shape below is kept as a record of what it would take, not as queued work. Were it ever built, it would inherit P5's phase behaviour for free, deriving from the same `phase`/epoch the circle already uses.

If it is built later, the natural shape is a short WebAudio blip fired on `absoluteBeat` change, accented on `beatInBar === 1`, with an on/off control and an output-device question worth thinking about (laptop speaker is useless on stage; it likely wants to go to an in-ear/monitor path).

## Stop and report when

P5, P6 and P9 are implemented, tested, committed and pushed on a branch in this repo. Then tell Jorge: the PR is ready, the submodule pointer bump is his, and **the `.dmg` must be rebuilt (`npm run pack`) before any of this can be tested** — the installed build is from 1 July.
