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

## What the app owns vs the video

The clean animation master carries **no** subtitle, title, or end-card. The app overlays the translated subtitle itself (this spec), shows the title via the intro screen (v3 `title_translations` + `intro`), and shows credits via the end-card (Prompt H). The master is only ever the animation.
