# Code prompt — Video & tempo rework

A spec for Claude Code to implement, following the repo's strict TDD protocol (Red → Green → Refactor, small atomic commits, no mixing feature + refactor in one step). This reworks how video is linked and played, simplifies the performer view, replaces the single `meter` with `numerator`/`denominator`, and removes Timed mode / record-by-tapping from the flow.

The work splits into independent slices — each can be its own branch/PR. Suggested order is at the bottom. Surface any test that doesn't fail "for the right reason" before writing production code.

---

## 1. Tempo: split `meter` into `numerator` + `denominator`

**Why:** a single `meter` number can't distinguish 3/4 from 6/8, and there are already songs in different meters.

**Schema change** (both `SongTempoFromFile` in `songState.ts` and `SongTempo` in `beatScheduler.ts`, plus the setlistStore `SongTempo`):

```ts
{ bpm: number, numerator: number, denominator: number, countInBars?: number }
```

- `numerator`, `denominator`: positive integers. Validate in `validateTempo` (replace the `meter` checks).
- `countInBars`: unchanged — positive integer, default 1. (It's the number of full **bars** counted in before the song "begins"; total count-in beats = `countInBars × beatsPerBar`.)

**Migration:** the setlist store is versioned and already migrates v1→v2→v3 on load. Add a migration step that rewrites any tempo carrying the old `meter: N` into `{ numerator: N, denominator: 4 }` (4/4 was the implicit assumption, so this is behavior-preserving). Keep reading old JSON files that still have `meter` by applying the same defaulting at parse time. Bump the schema version and add migration tests.

**`bpm` convention — document it in code and in `docs/subtitle-format.md`:** `bpm` is the **felt pulse** — the beat you actually count out loud. In 4/4 that's the quarter note; in 6/8 set `bpm` to the dotted-quarter rate. This keeps simple-meter behavior byte-identical to today (e.g. Tragedia stays `bpm: 126, numerator: 4, denominator: 4`).

### Beat indicator — compound grouping

`getBeatPhase` currently treats `meter` as beats-per-bar. Replace with a derived `beatsPerBar`:

```ts
const isCompound = denominator === 8 && numerator % 3 === 0 && numerator > 3 // 6/8→true, 9/8, 12/8; 3/8 stays simple
const beatsPerBar = isCompound ? numerator / 3 : numerator
```

So 6/8 pulses as **2** dotted-quarter beats, 3/4 as **3** quarter beats. Everything downstream (`countInTotalBeats`, `beatInBar`, `barInCountIn`, downbeat = `beatInBar === 1`) uses `beatsPerBar` instead of `meter`. `beatMs = 60000 / bpm` is unchanged (bpm = felt pulse).

Add `beatScheduler.test.ts` cases for 3/4 and 6/8 proving the different pulse counts per bar, and that 4/4 output is identical to before.

---

## 2. Media: two video files per song (big-screen + small-screen)

**Why:** Jorge wants to attach a big-screen export and a small-screen export per song, and pick which one projects at performance time.

**Schema change** — replace the single `MediaMetadata` with a per-screen block. Both slots optional; a song may have neither, one, or both:

```ts
interface MediaFile { type: 'video' | 'audio'; src: string; offset?: number; trimStart?: number }
interface SongMedia { big?: MediaFile; small?: MediaFile }
```

- Add a v-bump migration: an existing single `media` object migrates to `{ small: <that object> }` (Small is the default size — see §4), so currently-linked songs keep working.
- `src` stays a **logical filename**; the absolute path is still resolved per-machine via `mediaPathStore`. Each slot's `src` gets its own mediaPathStore entry.
- **Timeline:** keep a single shared `timeline` on the song. Assume both exports share subtitle timing; per-slot `offset` aligns each file if they differ slightly. (Flag if a song ever needs two genuinely different timelines — not supported by this design.)

---

## 3. Link video from "Manage setlists" (camera icon + dialog)

**Why:** today the file is linked too late (only on re-arm). Move linking into the setlist manager.

**`ManageSetlistsView.tsx` — SETLIST SONGS rows:** add a small **camera** button immediately to the **left of the "−"** button. Style it exactly like the library column's "+" button (square, white border). Clicking opens the link dialog for that song.

It edits the **underlying song** (library-level), so a video linked here is reflected wherever that song appears.

**Link dialog** (small modal): two rows —

- **Big screen** → `[Choose file…]` button opening the native file finder (`window.electronAPI.openFileDialog`)
- **Small screen** → `[Choose file…]` button, same

Each row shows the currently-linked filename if set, with a **Clear** action. No "custom"/other option for now. On pick: run the existing `validateVideoForImport` and show its warnings (ProRes/MOV, >500 MB) inline; set that slot's `media.<size>` (type `video`, `src` = chosen file's basename) and register the absolute path via `setMediaPath`. Persist to the song library. A **Done/Close** dismisses.

---

## 4. Performer setup/arming view — Big/Small in the Projection column

- In the Projection column (where `ProjectionButton` and the "Projection: Open/Closed" status live), add two buttons labelled **"Big"** and **"Small"** **above** the Open/Close button.
- They appear **only for songs that have at least one video slot**. If only one slot is present, show only that button. Default selection = **Small** when present, otherwise the available size.
- Selected size is reflected in the status text: **"Open, Small screen"** / **"Open, Big screen"** (and just **"Open"/"Closed"** for songs with no video). Update the status string in both the header and the setup row.
- Add the selected screen-size to performance/session state (sessionStorage, like the other performance state), defaulting per song to Small. Broadcast it across the WebSocket so the Projection window plays the correct file.

---

## 5. Performer **video** performance screen — simplify

Replace the current `VideoControlPanel` layout for armed video songs with a much simpler one:

- **Video preview larger, in the upper part** of the screen (it's currently a small box).
- Bottom controls: **only** `Play`, `Pause`, `Restart`, `Unarm`.
- A **tempo/beat indicator overlapping one corner of the video** (see §7).
- Subtitles are driven **automatically** from `video.currentTime` → `videoCueLookup(timeline, …)` (existing Video-mode behavior). No manual cue during playback.

### Play sequence — count-in, then video (locked to one clock)

Hitting **Play** must run the **count-in first, then start the video**, both driven off a **single clock** so they stay locked:

1. On Play, start the beat clock at t=0. The tempo indicator (§7) pulses through the count-in: `countInBars × beatsPerBar` clicks (e.g. Cerdo at `countInBars: 2`, 4/4 → **2 bars of 4 = 8 clicks**).
2. The video stays paused/held at `trimStart` during the count-in.
3. The instant the count-in completes (`beginFired`, i.e. on the downbeat after the last count-in beat), **start video playback**. From here the indicator keeps pulsing and subtitles follow `video.currentTime`.
4. **Pause** halts both video and the clock; **Play** from paused resumes the video (no re-count-in mid-song); **Restart** returns to the top and re-runs the count-in from t=0.

Compute the count-in→video handoff from `getBeatPhase` so there's no separate timer to drift against (reuse the count-in math, don't duplicate it). A song with `countInBars` omitted/0 starts the video immediately on Play with no count-in.

**Remove from this screen:** `← Cue` / `Cue →`, `Cue strip` / `Hide strip`, `Locate video…` (linking now happens in Manage setlists), and `End Card`. The bottom bar for video songs is just the four buttons above.

This screen is used **only for songs with a video**.

---

## 6. Performer **non-video** performance screen — manual only

- Keep Manual mode (keyboard arrows / Bluetooth pedal) exactly as the always-available fallback: `Previous` / `Next` / `Restart` / `Unarm`.
- **Remove the record-timeline UI** and the Timed-mode wiring from this flow (see §8).
- Add the **tempo/beat indicator** (§7) somewhere on screen — same visual size as the gig-time indicator (the "0'" circle) but in a different position (e.g. opposite corner), so the two don't collide.

The `End Card` concert-level feature stays in the app, but does **not** belong on the simplified video screen (§5). Keep it reachable for non-video / end-of-concert flow as it is today; just don't render it on the video performance screen. (Confirm placement if it currently only lived in the shared bottom bar.)

---

## 7. Tempo / beat indicator (shared component)

- Drive it from `getBeatPhase(tempo, elapsed)` with the compound grouping from §1.
- Visual size = same as the gig-time indicator. Position: a corner of the video for video songs; a non-conflicting spot for non-video songs.
- Show the count-in (the `barInCountIn` / `inCountIn` phase) and then the running beat-in-bar pulse with the downbeat accented (`beatInBar === 1`).
- Only render it for songs that **have a `tempo`** in their JSON. Songs without tempo show no indicator.

---

## 8. Remove Timed mode + record-by-tapping from the flow

Per decision: **remove the Timed-mode and record-by-tapping UI; video timelines are authored offline in the JSON.**

- Remove all UI entry points and wiring that start recording or run Timed (wall-clock) playback — the record buttons, the Timed-mode timer wiring (`useSubtitleTimer`), and any nudge/drift UI tied to Timed mode.
- The `timeline` field **stays** on songs — Video mode reads it. It is authored offline in the JSON (or a future dedicated edit screen, out of scope here), not captured live.
- Pure modules (`timelineCapture.ts`, `subtitleState.ts`, `useSubtitleTimer.ts`) may be deleted if nothing references them after the UI removal; if removing them is noisy, leaving them dormant with no UI path is acceptable. Don't leave dead UI.
- Update `CLAUDE.md`'s "Playback modes" section: modes are now **Manual** and **Video** only.

---

## Assumptions / things to flag during build

- **Two video files share one timeline** (per-slot `offset` for alignment). If a song needs two different timelines, this design doesn't cover it.
- **Big/Small files already encode their target framing/size** — Projection plays the selected file full-frame. Whether the display-profile subtitle-band compositing still applies on top is unchanged by this spec; keep current compositing behavior unless it conflicts, and flag if it does. (Note: two pre-rendered files partly supersede the "one clean video, composite per screen" display-profile rationale — call out any code that becomes redundant.)
- **Manual override on video songs:** the simplified video screen has no manual cue, so if the video drifts there's no in-performance nudge. Accepted for simplicity; flag if this bites during D-wire.
- Keep the `getLibrarySongById` hook-stability rule in mind (key effects on primitives like `tempo.bpm`, `currentSongId`, not the song object).

## Suggested step order (each its own commit/PR)

1. **§1 tempo schema + migration + beatScheduler compound grouping** (pure, well-tested, no UI risk).
2. **§2 media schema + migration** (pure store changes).
3. **§8 remove Timed/record UI** (subtractive; shrinks surface before rebuilding).
4. **§3 camera icon + link dialog** in Manage setlists.
5. **§4 Big/Small in the Projection column** + status text + broadcast.
6. **§7 tempo indicator** component.
7. **§5 simplified video performance screen** + **§6 non-video screen** wiring the indicator in.

Start at step 1. Restate the behavior as failing tests first.
