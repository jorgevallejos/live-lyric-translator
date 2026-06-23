# Subtitle format — audience projection overlay

_Restored 2026-06-19 (original was lost). Spec for how the audience-view subtitle is rendered over the animation in VIDEO mode. Consumed by Prompt D; geometry comes from the display profile (Prompt F)._

## What it is

The single line of translated lyric shown to the audience, composited by the app into the black subtitle band beneath the animation. The format is **fixed across languages and gigs** — the only thing that varies is **size**, which is driven by the active display profile, never hand-set per song.

## Visual spec

- **Font:** EB Garamond serif — the same family already used for audience lyrics on `main`. Weight regular.
- **Colour:** white (`#fff` / the audience-lyric CSS variable already in use).
- **Alignment:** centered horizontally; vertically centered within the subtitle band.
- **Legibility:** subtle dark shadow / outline so text stays readable if it ever overlaps a light frame edge (it normally sits on the black band, so keep the shadow light, not heavy).
- **Wrapping:** the overlay reproduces the current audience-view line behaviour — one logical lyric line at a time; long two-clause lines (with `\n`) wrap within the band rather than overflowing it.
- **Position:** in the black band along the bottom; the animation occupies the region above (`object-fit: contain`).

## Size — driven by the display profile

Size is **not** absolute. It comes from the active display profile's `textScale` (see `displayProfile`), expressed relative to the projection height so the same show reads correctly on very different screens:

- **Big screen (cinema):** ~13% band, smaller text (picture dominates).
- **Small canvas 130×100:** ~28% band, larger text (text stays readable from the room).
- **Custom:** band% + textScale entered directly.

The subtitle font size = a function of projection height × the profile's `textScale`, matching `computeProjectionLayout`. One global per-gig size, nudgeable on the night via the Custom profile — no per-song sizing.

## Tempo schema

Songs may carry an optional `tempo` block used for the count-in and beat indicator in the performer view:

```json
"tempo": { "bpm": 126, "numerator": 4, "denominator": 4, "countInBars": 1 }
```

**bpm convention:** `bpm` is the **felt pulse** — the beat you count out loud. In 4/4 that is the quarter note; in 6/8 set `bpm` to the dotted-quarter rate (so the visual pulse fires twice per bar, not six times). This keeps simple-meter songs byte-identical across schema versions.

**Compound meters** (6/8, 9/8, 12/8): `denominator: 8`, `numerator` divisible by 3 and > 3. The app derives `beatsPerBar = numerator / 3`, so 6/8 shows 2 felt beats, 9/8 shows 3, etc. Simple meters (including 3/8) use `beatsPerBar = numerator`.

**Old `meter` field (pre-v4):** Song JSON files that still carry `meter: N` are accepted at import time and defaulted to `numerator: N, denominator: 4`. Stored snapshots at schema v3 are migrated automatically on first load.

## Media schema (v5)

Songs may carry an optional `media` block with separate big-screen and small-screen video slots:

```json
"media": {
  "small": { "type": "video", "src": "song-small.mp4", "trimStart": 0, "offset": 0 },
  "big":   { "type": "video", "src": "song-big.mp4" }
}
```

Both slots are optional; a song may have neither, one, or both. Each slot has `type` (`"video"` or `"audio"`), `src` (logical filename — resolved to an absolute path per-machine via `mediaPathStore`), and optional `trimStart` (seconds to skip at the start) and `offset` (subtitle time alignment offset in seconds).

The active slot for performance is selected in the Projection column of the setup/arming view (§4 of the rework). The default is `small` when present, otherwise `big`. Both video files share a single `timeline`; per-slot `offset` handles alignment if they differ slightly.

**Old flat `media` format (pre-v5):** Song JSON files that still carry a single flat `media: { "type": "video", "src": "..." }` object are auto-migrated to `{ "small": { ... } }` at import time. Stored snapshots at schema v4 are migrated automatically on first load.

## What the app owns vs the video

The clean animation master carries **no** subtitle, title, or end-card. The app overlays the translated subtitle itself (this spec), shows the title via the intro screen (v3 `title_translations` + `intro`), and shows credits via the end-card (Prompt H). The master is only ever the animation.
