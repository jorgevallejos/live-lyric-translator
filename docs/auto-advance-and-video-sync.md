# Auto-advance & video-synced subtitles — feasibility + design

_Created 2026-06-18. Covers two requests: (1) recognize where Jorge is in a song from his voice and auto-advance the translation; (2) drive the translator from an animation video the singer follows. Engineering counterpart: implement via Claude Code in `live-lyric-translator`._

## TL;DR

Both requests are the same feature wearing two hats: **a per-song timeline (each lyric line gets a start time) plus a clock that plays it back.** The app already has the skeleton — `subtitleState.ts` defines a timed `SubtitleLine` and `useSubtitleTimer.ts` runs a tick loop — it just isn't wired to real song data yet.

What differs is **where the timing comes from** and **what the master clock is**:

- **Request 2 (sing to the animation video)** is the easy, robust one. The video element's own `currentTime` is the master clock, so subtitles stay locked to the picture forever — this is essentially WebVTT-on-video, no live recognition involved. It also kills your "one hardcoded copy per language" problem: one clean video + all four language tracks already living in the song JSON. **Ship this first.**
- **Request 1 (follow my live voice)** is harder and depends on how you perform. A pre-computed timeline only stays true live if you sing to a fixed tempo (backing track / click). Fully-live rubato drifts from any baked timing. Live speech-recognition that listens and follows you in real time is not stage-safe (latency, band bleed, crowd noise, your own ornamentation).

So: build the timeline + clock once, feed it from whichever source fits the gig.

## What I actually tested on your voice stem

I ran a vocal-activity analysis on `Tragedia de Cerdo Asado - voice.mp3` (the isolated vocal you uploaded). Real numbers:

- Duration 194.2 s. First vocal onset **18.7 s** (after the instrumental intro), last vocal offset **176.4 s** — clean head/tail silence the app can use to know when to go blank.
- **47 distinct sung phrases** detected, with clean onsets and breath gaps between them. The song JSON has 28 lyric lines; the higher count is expected because your longer two-clause lines (the ones with `\n`) break into separate breath groups.

The takeaway: **the isolated vocal is excellent alignment material** — distinct, separable phrases with detectable boundaries. That's exactly the precondition a forced aligner needs.

What I could **not** do here: run a true text-anchored aligner (the one that maps each Spanish line to a timestamp). This sandbox has no package-network access, so I couldn't install `aeneas`/WhisperX. That step runs fine on your Mac or inside Claude Code (Prompt B below). The energy test confirms it will work; it doesn't replace it.

Honest limit: energy segmentation alone can tell *that* you're singing and roughly *where* phrases break, but not *which words* — so it can't, by itself, drive line-accurate advance. The line accuracy comes from one of the three acquisition methods below.

## Three ways to get the timeline (cheapest first)

You don't need machine learning to start. Ranked by effort:

1. **Record-by-tapping (reuse what you already have).** Play the track or video once and advance lyrics manually (arrows or pedal). The app timestamps each advance → that *is* the cue sheet. Zero new tech, reuses the existing navigation, and it's exactly how you already rehearse. Replays perfectly for any later performance to the same track. This is the MVP.
2. **Forced alignment from the voice stem (automated).** Feed the known Spanish lyrics + the vocal stem to an aligner offline; it emits per-line start/end times with no manual pass. This is the upgrade that removes even the one tap-through. Your stem is ideal for it.
3. **Live ASR (someday, off-stage only).** Real-time recognition that follows you with no fixed tempo. Treat as an experiment, never a first-night dependency.

For the **video** case, sync robustness doesn't depend on any of these — the video clock handles it — but you still need the cue *times*, which come from tapping through once against the video (method 1) or aligning the video's audio (method 2).

## Request 2 in detail — the animation video

**Answer to your question: yes, send the video — and send the clean version without the burned-in English.** Here's why. The app should play one language-neutral animation and overlay the chosen audience language itself from the song JSON. That's the whole point — it ends the multiple-hardcoded-copies problem. The English-burned version would still work for *timing extraction* (the audio is identical), but you can't project it, because the translation is baked into the picture. So the clean no-text version is the one that becomes your reusable asset. If producing it is a hassle, send what you have and I'll pull the timing from its audio while you make the clean one.

**The audience view plays the video too — no more QuickTime.** Confirmed: the projection (audience) window renders the clean animation full-screen and overlays the translated subtitle itself. The translator becomes the single thing on the projector; you stop switching to QuickTime entirely, and you stop maintaining one exported video per language.

**Subtitle format is fixed; only size adapts.** The overlay reproduces your current audience-view styling — white serif, centered, along the bottom — identical across languages and gigs. The one thing that varies is **size**, because the same show runs on very different screens (the intimate living-room screen vs the cinema-style screen in your two photos). So the subtitle is sized relative to the projected video height and carries a per-gig size multiplier you can nudge on the night. Full spec: `docs/subtitle-format.md`; reference still lives at `animations/tragedia-de-cerdo-asado/reference/`.

**Performer view (your pick: live video + line, thumbnails as fallback).** Plan for live video as the default and thumbnails as the graceful degradation:

- **Projection (audience):** the clean animation, full-screen, with the translated subtitle overlaid, bound to the video clock.
- **Performer (iPad):** the same video, smaller, with the **Spanish** line under it and the next line greyed below, plus an elapsed/position bar so you always know where you are. If playing full video on the iPad is ever too heavy or you want the iPad off the projector's clock, fall back to a **thumbnail strip** — periodic frames as position markers — with the same current/next Spanish lines. Both render from the same cue data; the thumbnail mode is just a lighter view.

Sync here is the reliable kind: subtitles read `video.currentTime`, so a pause, a seek, or a stutter never desyncs them.

**Where the video lives:** in a new root-level `animations/` folder, parallel to `songs/` — see `animations/README.md`. The song JSON points at it via the `media` block.

## Unifying architecture (what to tell Claude Code)

Extend the song format and add a clock abstraction; keep today's manual mode untouched as the always-available override.

- **Song JSON gains optional blocks** (back-compatible — songs without them behave exactly as now):
  - `timeline`: per-line `{ start, end }` in seconds, parallel to `lyrics`.
  - `media`: `{ type: "video" | "audio", src, offset, trimStart }` — the asset the timeline is locked to. `offset` nudges global sync; `trimStart` skips a blank lead-in (the clean Tragedia master has ~4 s of black before the animation).
  - `tempo`: `{ bpm, meter, countInBars }` — drives the performer-view count-in/metronome (see below). Optional per song.
- **Display profiles** (a gig-level setting, not per song): the app composites the clean animation into the projection canvas and adds the black subtitle band itself, sized per profile — so you hand it a video with no black space. See "The projection frame" below.
- **Three playback modes**, selected per song:
  - `MANUAL` — today's behaviour (arrows / pedal). Always the fallback.
  - `VIDEO` — projection plays `media.video`; subtitles + performer view bind to `currentTime`. (Request 2.)
  - `TIMED` — `useSubtitleTimer` plays the `timeline` against a wall clock for backing-track songs. (Request 1, track-based.)
- **Manual override is always live:** in any mode, an arrow press or pedal tap re-seizes control and a "nudge ±0.25 s" re-syncs without stopping. This is the safety net that makes auto-advance stage-trustworthy.

This reuses your existing pieces: the WebSocket control↔projection bridge, the blank-before-first-line behaviour, and the per-language selection already in `songState.ts`.

## The projection frame — dynamic black band + display profiles

Today you bake the black subtitle band into each exported video, sized per screen. The app should do this instead: **you give it a clean, full-frame animation with no black space, and it composites the band on the fly.** Your reference stills show why this matters — the band is *small* on the big cinema screen (the picture is huge, text can be modest) but *large* on the 130×100 canvas (the picture shrinks up and the text gets a generous band so it stays readable from the room).

Mechanically this is simple in the projection window: a black background, the `<video>` scaled with `object-fit: contain` into the upper region, and a black band below holding the subtitle. A **display profile** sets the proportions:

- **Big screen (cinema):** narrow band (~12–15% of height), smaller text. Picture dominates.
- **Small canvas (130×100):** taller band (~25–30%), larger text, animation pushed up.

Profiles are a **gig-level** choice (you pick big or small on the night), not stored per song — the same animation runs on either. Start with those two named profiles plus a custom option (enter band-height % and text scale, or the physical screen size) and calibrate the two defaults against the reference stills in `animations/.../reference/`. This replaces the per-screen video exports the same way dynamic subtitles replace the per-language exports.

## Tempo / count-in indicator (your idea — yes, and it generalises)

Right now the tempo count-in lives at the head of the audience video so you can lock in before singing. **Move it out of the audience view entirely** — the audience shouldn't see it — and put a beat indicator in the **performer view**, driven by a per-song `tempo { bpm, meter, countInBars }`.

How it plays: you hit start → the performer view counts you in visually (big **1 · 2 · 3 · 4**, downbeat emphasised, for one or two bars) → on beat 1 the video auto-rolls and the subtitles follow its clock. The audience just sees the title screen hold, then the animation begins clean — no numbers.

You're right that it generalises to every song, and I'd frame it as **complementary to voice recognition, not a substitute**:

- For **video** songs, the count-in's main job is locking you in before the picture rolls; during the song the *video itself* is your reference, so a running metronome is optional (offer it as a small persistent pulse you can glance at, or hide it).
- For **fixed-tempo backing-track** songs (TIMED mode), the metronome *is* the backbone that keeps you aligned with the timeline.
- For songs with **silent spaces / rubato** — your exact worry — a fixed tempo won't hold, the metronome can't save it, and that's precisely the case where **voice recognition earns its place.** So keep both on the roadmap: the metronome is cheap and ships now; voice-following is the harder track that covers the songs a click can't.

Open choices for you (I've defaulted to the first of each in the prompt): count-in length **1 bar vs 2**; during-song metronome **persistent-but-subtle vs count-in-only**; and later, an optional **audible click in your in-ears only** (never to the room). Tell me your leanings and I'll bake them in.

## Title screen & end card — the app owns these, not the video

Two small things currently baked into the video that the app should take over, so the clean master is *only* the animation:

- **Title.** Your video opens with a "Tragedia de Cerdo Asado / Tragedy of Roasted Pig" card. The app already has a song-intro/title screen (F-001) that holds until you start playing — let that show the title, and strip it from the video. (The clean master already omits it.)
- **End acknowledgements.** Add a reusable **end-card** screen in the app (credits/acknowledgements/thanks) you can show at the end of a concert, instead of tacking it onto each song's video. The clean master should end at the animation's last frame.

## Recommended sequencing

1. **Schema (Prompt A)** — `timeline` + `media` + `tempo`. Foundation for everything.
2. **VIDEO mode + display profiles + dynamic band (Prompts D, F).** Highest value, lowest risk: replaces QuickTime, the per-language exports, *and* the per-screen exports. Pair with record-by-tapping (C) for cue capture.
3. **Title screen reuse + end card (Prompt H).** Small, lets the clean master be just the animation.
4. **Tempo count-in / metronome (Prompt G).** Cheap, helps every song, and starts the video on beat.
5. **TIMED mode + nudge (Prompt E).** For fixed-tempo backing-track songs.
6. **Offline alignment tool (Prompt B)** so timelines generate without a tap-through.
7. **(Someday) live ASR** — for rubato / silent-gap songs a click can't cover; bench-tested off-stage first.

---

## Claude Code prompts (ready to paste)

Run these in the `live-lyric-translator` repo, one branch each, TDD as usual.

### Prompt A — extend the song schema (timeline + media)

> In the live-lyric-translator repo, extend the song file format in `src/songState.ts` with two optional, back-compatible fields, TDD (Red→Green→Refactor):
> 1. `timeline`: an optional array parallel to `lyrics`, each entry `{ start: number, end: number }` in seconds. Validate that, when present, it has the same length as the lyric-line count and that times are non-negative and monotonic.
> 2. `media`: an optional object `{ type: "video" | "audio", src: string, offset?: number }`.
> Add both to `ParsedSongFile` and the parse/validate path, leaving songs without these fields behaving exactly as today. Add unit tests for: missing fields (current behaviour), valid timeline/media, mismatched timeline length, and non-monotonic times. Don't wire any UI yet.

### Prompt B — offline cue-sheet generator (forced alignment)

> Add a repo script `scripts/align-song.ts` (or `.py`) that takes a song JSON and an audio file (e.g. an isolated vocal stem) and produces a `timeline` array of per-line `{ start, end }` times, using forced alignment. Use WhisperX (Spanish model) for word-level timestamps and snap them to the song's lyric-line boundaries; fall back to aeneas if WhisperX isn't available. Write the result back into the song JSON under `timeline`. Document the install steps in the script header. Include a `--review` flag that prints each line with its start time so I can eyeball it. Test against `songs/tragedia-de-cerdo-asado.json` + `songs/audio/Tragedia de Cerdo Asado - voice.mp3` (vocal onset is ~18.7 s, last phrase ends ~176.4 s — use that as a sanity check).

### Prompt C — record-by-tapping (capture a timeline by performing once)

> Add a "record timeline" mode to the control view. While armed in this mode, every lyric advance (arrow or pedal) timestamps the current line against a clock started on the first advance, building a `timeline` array. On stop, offer to save the captured timeline into the loaded song JSON. Reuse the existing navigation/state machine; don't change manual behaviour outside record mode. TDD the timestamp-capture logic as a pure function first, then wire the UI.

### Prompt D — VIDEO mode (Request 2)

> Add a VIDEO playback mode driven by a song's `media` (type `video`) + `timeline`. In the projection (audience) window, render the **clean, full-frame** animation (no baked-in black band) with the translated subtitle (current audience language) overlaid — the app replaces QuickTime, so the projector only ever shows this app. The app composites the projection frame itself: black background, `<video>` with `object-fit: contain` in the upper region, and a black subtitle band below whose height comes from the active **display profile** (see Prompt F). Start playback at `media.trimStart` to skip the clean master's blank lead-in, and bind the subtitle + blank-before/after behaviour to `video.currentTime + media.offset` — not a separate timer. Style the subtitle per `docs/subtitle-format.md`: white serif, centered in the band, dark outline/shadow, sized from the display profile's text scale. In the control/performer view, show the same video smaller with the current Spanish (singing-language) line and the next line greyed below it, plus a position bar. Add a thumbnail-strip fallback view (periodic frames as markers + current/next line) behind a toggle. Manual arrows/pedal must still override and re-seek. Keep the WebSocket sync model. TDD the cue-lookup-by-time as a pure function first.

### Prompt E — TIMED mode + nudge (Request 1, track-based)

> Wire `useSubtitleTimer`/`subtitleState` to a real song `timeline` instead of `SAMPLE_LINES`. Add a TIMED mode: start/pause/stop the clock, drive the active line from the timeline, and add a "nudge ±0.25 s" control plus an instant manual-override (any arrow/pedal press re-seizes control and resyncs the clock to that line's start). Surface a small drift indicator. TDD the active-line-from-timeline and nudge logic as pure functions first.

### Prompt F — display profiles + dynamic black band

> Add gig-level **display profiles** that control how the projection frame is composited. Each profile defines the subtitle-band height (as a % of projection height) and a subtitle text scale. Ship two presets — "Big screen (cinema)" (~13% band, smaller text) and "Small canvas 130×100" (~28% band, larger text) — plus a "Custom" option (enter band % and text scale). The selected profile is app/gig state, not per song. The projection window uses it to size the black band and the subtitle; the clean animation scales with `object-fit: contain` into the region above the band. Calibrate the two presets against the reference stills in `animations/tragedia-de-cerdo-asado/reference/`. TDD the band/text geometry as a pure function (profile + viewport → band rect + font size) first.

### Prompt G — performer-view tempo count-in / metronome

> Add a per-song optional `tempo { bpm, meter, countInBars }` to the song schema (back-compatible). In the **performer view only** (never the audience projection), render a visual beat indicator: on start, count in for `countInBars` bars showing the beat number large (e.g. 1·2·3·4 for 4/4) with the downbeat emphasised; on the first beat after the count-in, fire a "begin" event that auto-starts the song (rolls the video in VIDEO mode, starts the clock in TIMED mode). During the song, show a small persistent beat pulse that can be toggled off. Default count-in = 1 bar. TDD the beat-scheduling logic as a pure function (bpm + meter + elapsed → current beat, in-count-in?, begin-fired?) first, then wire the UI. Keep it visual only for now — no audio click.

### Prompt H — end-card / acknowledgements screen

> Add a reusable **end-card** screen the performer can trigger to show at the end of a concert (acknowledgements / credits / thanks), independent of any song, projected like the title screen. Content comes from a simple editable source (e.g. an `end-card.md`/config), so it's not baked into any video. TDD the show/hide state as part of the existing performance state machine.

### Prompt I — live voice-recognition spike (auto-advance by following the singer)

> Build a throwaway spike (separate branch, not wired into the app) that tests whether live speech recognition can auto-advance lyric lines by following a singer. Input: `songs/tragedia-de-cerdo-asado.json` (Spanish lyric lines) + a recording of the song. Use a streaming ASR (WhisperX, whisper-timestamped, or Vosk Spanish) to transcribe the vocal in (simulated) real time, and a matching layer that advances a pointer when the recognised words cross into the next lyric line — tolerant of mis-hearings, repeated/held words (melisma), and gaps. Report, per line, the detected advance time vs a hand-marked ground truth, and the accuracy/latency. Run it first on the clean vocal, then on the mixed voice+guitar audio, to quantify how much guitar bleed hurts. This needs models that install via network — run it in Claude Code on the Mac, not in Cowork. Goal is a go/no-go read on live following, especially for songs with an irregular/accelerating tempo where a fixed timeline can't work.

## Production & tempo notes (June 2026)

- **The current Tragedia recording is provisional.** Jorge re-records with a producer later this month; the tempo will be fixed and the animation re-adjusted. So **don't hand-tune a timeline for the current master** — build the mechanism, and regenerate the timeline (one automated alignment pass) once the produced master + adjusted animation exist. Automated alignment is what makes this re-pluggable; hand-tuning would be thrown away.
- **Vocal-only stem helps alignment, not projection.** A guitar-free vocal improves forced-alignment/ASR accuracy (less bleed). It's most valuable as a stem **time-locked to the produced master** (same take) — the standalone `voice.mp3` was a different take and didn't match. In VIDEO mode the projection **mutes** the video anyway (audience hears Jorge live), so video audio is only ever used to generate cues. For now, the mixed master audio is fine to test with; switch to a clean stem if accuracy is poor.
- **Tempo is irregular (~124→130 BPM, accelerando).** A single `bpm` (126 is set in the song JSON) is a **nominal count-in value only** — a constant metronome will drift against an accelerating performance. Don't use TIMED (fixed-clock) mode as the sync spine for this song; use the count-in to launch, then let **voice recognition** follow the actual tempo. This song is therefore a deliberate stress test for the voice-recognition spike.

---

## Appendix — the feasibility test

Reproducible with ffmpeg + Python (numpy), no extra installs:

```python
import wave, numpy as np
w = wave.open('voice.wav','rb'); sr = w.getframerate(); n = w.getnframes()
a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)/32768.0
fl = int(0.025*sr)
rms = np.array([np.sqrt(np.mean(a[i:i+fl]**2)+1e-9) for i in range(0, len(a)-fl, fl)])
thr = np.percentile(rms[rms > rms.max()*0.02], 25) * 0.9
# threshold rms > thr, bridge gaps < 0.18s, drop runs < 0.25s -> 47 sung phrases
```

Convert first: `ffmpeg -i "<stem>.mp3" -ac 1 -ar 16000 voice.wav`. Result: 47 sung phrases, onset 18.7 s, offset 176.4 s, against 28 lyric lines — clean, separable, alignment-ready.
