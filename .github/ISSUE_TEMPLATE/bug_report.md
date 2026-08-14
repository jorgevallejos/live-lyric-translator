---
name: Bug report
about: Something Pregonero did on stage or in rehearsal that it shouldn't have
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- What you expected, and what you got instead. -->

## Which window

- [ ] Control (performer)
- [ ] Projection (audience)
- [ ] Both, or the two disagreed with each other

When the two windows disagree, say what each one showed — that difference is
usually the bug.

## Where in the flow

<!-- Setup / Ready / Armed / Performing, and what you pressed to get there. -->

- Playback mode for the song: **Manual** or **Video**?
- Was it a pedal press, a keyboard arrow, or an on-screen button?
- Did it happen on the first song of the setlist, or later in the run?

## If it's a timing problem

- Do the lyrics run ahead of the audio, behind it, or drift further apart as
  the song goes on?
- A **constant offset** is usually `media.offset` or `trimStart` in the song
  JSON, or a lead-in the timeline carries and the app isn't applying.
- **Growing error** usually means the timeline was authored against a
  different cut of the video than the one linked on this machine.
- For the count-in specifically: what are `tempo.bpm`, `numerator`,
  `denominator` and `countInBars` for that song?

## If the video didn't play

Video files are linked once per machine and remembered locally, so a song
that plays on one Mac can be unlinked on another. Worth checking first:

- Does the song row show the camera glyph as linked (green)?
- Is the file a web-playable MP4 (H.264, ≤1080p) rather than a ProRes master?

## Environment

- Pregonero version: <!-- the app menu, or "version" in package.json -->
- macOS version:
- Running from `npm run dev`, or a packaged build?
- Display setup: projector, second monitor, Sidecar iPad, single screen?

## Songs and media

Don't attach anything you can't share — recordings, animations and
unreleased lyrics usually fall in that category. A description of the shape
is normally enough: number of lyric lines, which languages, whether the song
has `tempo`, `media` and `timeline` blocks, and roughly how long it runs.
