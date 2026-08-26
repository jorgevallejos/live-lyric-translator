# Subtitle format — audience projection overlay

_Restored 2026-06-19 (original was lost). Spec for how the audience-view subtitle is rendered over the animation in VIDEO mode. Consumed by Prompt D; geometry comes from the display profile (Prompt F)._

## What it is

The single line of translated lyric shown to the audience, composited by the app into the black subtitle band beneath the animation. The format is **fixed across languages and gigs** — the only thing that varies is **size**, which is driven by the active display profile, never hand-set per song.

## Visual spec

- **Font:** EB Garamond — the same family already used for audience lyrics on `main`. Weight **SemiBold (600)**, matching the reference Premiere export (the bundled variable font covers weights 400–700, so no new font file was needed).
- **Colour:** white (`#fff` / the audience-lyric CSS variable already in use).
- **Alignment:** centered horizontally.
- **Legibility:** subtle dark text-shadow so text stays readable when it overlaps a light frame (big-screen format superimposes the subtitle directly over the video, not a solid black band).
- **Wrapping:** the overlay reproduces the current audience-view line behaviour — one logical lyric line at a time; long two-clause lines (with `\n`) wrap rather than overflowing.
- **Position:** driven by the active display profile's `subtitlePosition` (see below).

## Size and position — driven by the display profile

Geometry comes from the active display profile (see `displayProfile.ts`), expressed as **percentages of a fixed 3:2 reference frame** (4752×3168 in the source Premiere export; the clean master mp4 is 1920×1280, same ratio). The frame is `object-fit: contain`-ed into the actual projector viewport, so all percentages are resolution-independent.

- **Big screen (cinema):** video fills the frame at native scale (`videoScalePercent: 100`, no crop, no split). Subtitle is **superimposed over the video**, bottom-centered (`subtitlePosition: 'overlay-bottom'`), font ≈ 3.73% of frame height (118/3168pt in the reference), bottom margin ≈ 4.5% of frame height.
- **Small canvas 130×100:** video is scaled to 75.8% of the frame, horizontally centered, vertically shifted up so its center sits at 38.3% of frame height — leaving the bottom ~23.8% of the frame black. Subtitle is **centered in that black area** (`subtitlePosition: 'below-video'`), font ≈ 5.05% of frame height (160/3168pt in the reference).
- **Custom:** all of the above (`videoScalePercent`, `videoCenterYPercent`, `subtitlePosition`, `subtitleFontPercent`, `subtitleBottomMarginPercent`) entered directly — see `displayProfileStore.setCustomProfile`.

`computeProjectionLayout(profile, viewportWidth, viewportHeight)` turns these percentages into pixel geometry: it contains the 3:2 frame in the viewport, then positions the video box and subtitle within that frame. One global per-gig size/position, nudgeable on the night via the Custom profile — no per-song sizing.

## Tempo schema

Songs may carry an optional `tempo` block used for the count-in and beat indicator in the performer view:

```json
"tempo": { "bpm": 126, "numerator": 4, "denominator": 4, "countInBars": 1 }
```

**bpm convention:** `bpm` is the **felt pulse** — the beat you count out loud. In 4/4 that is the quarter note; in 6/8 set `bpm` to the dotted-quarter rate (so the visual pulse fires twice per bar, not six times). This keeps simple-meter songs byte-identical across schema versions.

**Compound meters** (6/8, 9/8, 12/8): `denominator: 8`, `numerator` divisible by 3 and > 3. The app derives `beatsPerBar = numerator / 3`, so 6/8 shows 2 felt beats, 9/8 shows 3, etc. Simple meters (including 3/8) use `beatsPerBar = numerator`.

**Old `meter` field (pre-v4):** Song JSON files that still carry `meter: N` are accepted at import time and defaulted to `numerator: N, denominator: 4`. Stored snapshots at schema v3 are migrated automatically on first load.

## Media schema (v6 — one video per song)

Songs may carry an optional `media` block: **exactly one file, not a slot per screen.**

```json
"media": { "type": "video", "src": "pimiento.mp4", "trimStart": 0, "offset": 0 }
```

| field | meaning |
|---|---|
| `type` | `"video"` or `"audio"` |
| `src` | **A logical filename only** — the actual file is linked once per machine and remembered locally (`mediaPathStore`; see [media-assets.md](media-assets.md)) |
| `trimStart` *(optional)* | seconds to skip at the start of the file (blank lead-in) |
| `offset` *(optional)* | subtitle time-alignment offset in seconds |

**One clean export per song.** "Big" and "Small" are a **projection display-format toggle**, not two files — they map to the `big-screen` / `small-canvas` display profiles described above, and the app composites the band itself. A single clean master therefore serves every screen and every language.

Feed the app **web-playable MP4s** (H.264, ≤1080p). ProRes masters are a mastering format and will not play.

**Migration history.** Pre-v5 song files carried a flat `media: { type, src }`, which v5 wrapped into `{ small: { … } }`; **v6 collapsed that back to a single `MediaFile`**, which is the shape above. `SongMedia { big?, small? }` survives in `songState.ts` only as a `@deprecated` type. The stored snapshot is at **v8** (`SETLIST_STORE_VERSION`) and no longer holds songs at all: it holds a reference — an id and a path — per library entry, and every field above is read from the file. Snapshots older than v8 are **discarded on load, not migrated**, because their copies had no authority over the files they were copied from.

## Song-level fields

The rest of the song JSON, for reference. The timeline fields — `timelineVersion`, `leadIn`, `timeline` — are **not** listed here: they are owned by [timeline-v2-contract.md](timeline-v2-contract.md), the shared contract with Bombista, and that file is the only place they may be specified.

| field | meaning |
|---|---|
| `title` | song name |
| `title_translations` *(optional)* | translated titles for the intro/title screen, indexed by language code |
| `intro` *(optional)* | translatable spoken introduction shown on the intro screen |
| `notes` *(optional)* | performer notes — capo, key, reminders. Shown to the performer only, never projected |
| `tempo` *(optional)* | see **Tempo schema** above |
| `media` *(optional)* | see **Media schema** above |
| `lyrics` | ordered list of lyric lines |

Each lyric line holds its translations indexed by language code (`es`, `en`, `fr`, `nl`, …). **Missing translations are allowed** — the line simply stays blank in projection rather than failing. A song carrying none of the optional blocks behaves exactly as it always has, in Manual mode.

## What the app owns vs the video

The clean animation master carries **no** subtitle, title, or end-card. The app paints the translated subtitle into a `song-lyrics` shape (this spec), the title into a `song-intro` shape (v3 `title_translations` + `intro`), and the contact details into a `gig-contact` shape. The master is only ever the animation.
