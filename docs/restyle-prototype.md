# Brutalist restyle — validation prototype

_Branch `restyle/prototype`. Written 2026-08-18. **Nothing here is meant to
merge except the first commit.** The switcher and both variant blocks are
scaffolding for one decision: which of the two looks Jorge can actually
operate, on stage, mid-song._

The aesthetic comes from Bombista's `STYLESHEET` constant
(`projects/bombista/bombista/pages.py`, ~lines 80–225) — ink ground, paper
text, hairline rules, one clay accent, monospace for anything instrument-like.
That palette is already the Tramoya house style; Pregonero is the piece that
hadn't caught up.

## How to look at it

```bash
cd ~/Chango\ Pepper/projects/pregonero && git checkout restyle/prototype && npm run dev
```

**`Ctrl` + `Shift` + `K`** cycles `today → A → B → today`. A small label in the
bottom-left corner says which one is live. The chord works on the control,
songs, languages and setlist screens; it is not mounted on the projection
window, which never sees the attribute at all.

If you would rather test from the installed app than from `npm run dev`, run
`npm run pack` first — the installed `.dmg` is from 1 July and rejects v2
timelines.

## What did not change, and why

Layout, structure, grouping, hierarchy, control positions and **every font
size** are untouched. Pregonero is read on stage, in low light, while you are
singing; where brutalism and legibility disagreed, legibility won. The
projection window is out of scope and is deliberately unreachable by either
theme — its six colours are left as literals in `control.css` precisely so
no token re-point can touch them.

Both variants are **token re-points only**. There is not one new selector or
rule below the `:root` block. Delete a variant block and the app is itself
again.

## The order of the commits

| commit | what | survives? |
|---|---|---|
| 1 | Tokenise `control.css` — colour, type, shape. Visual no-op. | **yes, this is the only one** |
| 2 | The throwaway theme switcher | no — one `git revert` |
| 3 | Variant A block | only if you pick it |
| 4 | Variant B block | only if you pick it |

Commit 1 is a proven no-op, not an asserted one: expanding every `var()` back
to its token value reproduces the previous stylesheet byte-for-byte on every
declaration. The only lines that differ are comments and `font-family`
declarations that name the face each element already rendered in. 941 tests
green, `tsc --noEmit` clean, `eslint` clean.

## The two variants in one sentence each

- **A — restrained.** Status colour marks liveness and nothing else. Choosing
  something is a bright hairline box, not a green fill.
- **B — warmer.** Status colour is allowed onto selection, panel grounds,
  borders and buttons, closer to how the app reads today.

Everything that signals liveness — the Arm button, the beat indicator, the
prereq checks, drift, the manual-override badge — is **identical in A and B**,
deliberately. That is not the question. The question is whether the rest of
the UI is easier to operate when state colour is everywhere or when it is
rationed to the things that are actually live.

## Token mapping

Old Pregonero value → semantic token → what each variant re-points it to.


**Type**

| today | token | variant A | variant B |
|---|---|---|---|
| `Arial, sans-serif` | `--font-ui` | `-apple-system …` | `-apple-system …` |
| `Arial, sans-serif` | `--font-control` | `ui-monospace …` | `ui-monospace …` |
| `Arial, sans-serif` | `--font-numeric` | `ui-monospace …` | `ui-monospace …` |
| `Arial, sans-serif` | `--font-label` | `ui-monospace …` | `ui-monospace …` |

**Shape**

| today | token | variant A | variant B |
|---|---|---|---|
| `6px` | `--radius-control` | `0` | `0` |
| `6px` | `--radius-box` | `0` | `0` |
| `8px` | `--radius-tile` | `0` | `0` |
| `10px` | `--radius-panel` | `0` | `0` |
| `12px` | `--radius-float` | `0` | `0` |
| `0.5em` | `--radius-panel-sm` | `0` | `0` |
| `0.75em` | `--radius-dialog` | `0` | `0` |
| `0.35em` | `--radius-chip` | `0` | `0` |
| `0.4em` | `--radius-field` | `0` | `0` |
| `50%` | `--radius-round` | `0` | `0` |

**Grounds and surfaces**

| today | token | variant A | variant B |
|---|---|---|---|
| `#1c1c1e` | `--app-bg` | `#121211` | `#121211` |
| `#1c1c1e` | `--panel-bg` | `#1a1a18` | `#1a1a18` |
| `#1c1c1e` | `--input-bg` | `#1a1a18` | `#1a1a18` |
| `#242427` | `--surface-inset` | `#121211` | `#121211` |
| `#2c2c2e` | `--control-bg` | `#1a1a18` | `#1a1a18` |
| `#3a3a3c` | `--control-bg-raised` | `#232320` | `#232320` |
| `#252527` | `--control-bg-disabled` | `#161615` | `#161615` |
| `#2c2c2e` | `--dialog-bg` | `#1a1a18` | `#1a1a18` |
| `#3a3a3c` | `--surface-hover` | `#232320` | `#232320` |
| `#48484a` | `--surface-hover-strong` | `#2c2a26` | `#2c2a26` |
| `rgba(28, 28, 30, 0.95)` | `--surface-float` | `rgba(26, 26, 24, 0.97)` | `rgba(26, 26, 24, 0.97)` |

**Rules**

| today | token | variant A | variant B |
|---|---|---|---|
| `#262629` | `--rule-faint` | `#2c2a26` | `#2c2a26` |
| `#3a3a3c` | `--rule` | `#423e37` | `#423e37` |
| `#2c2c2e` | `--rule-strong` | `#423e37` | `#423e37` |
| `#48484a` | `--control-border` | `#423e37` | `#423e37` |
| `#444` | `--control-border-soft` | `#2c2a26` | `#2c2a26` |
| `#58585a` | `--control-border-hover` | `#e6dfd1` | `#e6dfd1` |
| `#636366` | `--control-border-focus` | `#d98b7a` | `#d98b7a` |
| `#3a3a3c` | `--control-border-disabled` | `#2c2a26` | `#2c2a26` |

**Text**

| today | token | variant A | variant B |
|---|---|---|---|
| `#e5e5e5` | `--text-primary` | `#e6dfd1` | `#e6dfd1` |
| `#f2f2f2` | `--text-lyric-current` | `#e6dfd1` | `#e6dfd1` |
| `#b0b0b2` | `--text-secondary` | `#8b8478` | `#8b8478` |
| `#a0a0a5` | `--text-status` | `#8b8478` | `#8b8478` |
| `#8e8e93` | `--text-muted` | `#8b8478` | `#8b8478` |
| `#8e8e93` | `--text-label` | `#8b8478` | `#8b8478` |
| `#98989d` | `--text-muted-2` | `#8b8478` | `#8b8478` |
| `#888` | `--text-soft` | `#8b8478` | `#8b8478` |
| `#5c5c60` | `--text-dim` | `#635d54` | `#635d54` |
| `#636366` | `--text-faint` | `#635d54` | `#635d54` |
| `#48484a` | `--text-disabled` | `#423e37` | `#423e37` |
| `#d0d0d2` | `--text-numeric` | `#e6dfd1` | `#e6dfd1` |
| `#b8b8bc` | `--text-played` | `#8b8478` | `#8b8478` |
| `#c0c0c2` | `--control-text-soft` | `#8b8478` | `#8b8478` |
| `#8e8e93` | `--control-text-disabled` | `#635d54` | `#635d54` |
| `#9a9a9f` | `--segment-text` | `#8b8478` | `#8b8478` |
| `#d0d0d5` | `--segment-text-hover` | `#e6dfd1` | `#e6dfd1` |

**Selection**

| today | token | variant A | variant B |
|---|---|---|---|
| `#2d4a2d` | `--state-selected-bg` | `#232320` | `#1d3129` |
| `#3d5c3d` | `--state-selected-border` | `#e6dfd1` | `#4f7d63` |
| `#3a5a3a` | `--state-selected-bg-hover` | `#2c2a26` | `#243f32` |
| `#4a6c4a` | `--state-selected-border-hover` | `#e6dfd1` | `#5b9074` |
| `#e8f0e8` | `--state-selected-text` | `#e6dfd1` | `#e6dfd1` |
| `#eaf3ea` | `--segment-active-text` | `#e6dfd1` | `#e6dfd1` |

**Armed / live**

| today | token | variant A | variant B |
|---|---|---|---|
| `#2d4a2d` | `--state-armed-bg` | `#1d3129` | `#1d3129` |
| `#3d5c3d` | `--state-armed-border` | `#4f7d63` | `#4f7d63` |
| `#3a5a3a` | `--state-armed-bg-hover` | `#243f32` | `#243f32` |
| `#4a6c4a` | `--state-armed-border-hover` | `#5b9074` | `#5b9074` |
| `#e8f0e8` | `--state-armed-text` | `#e6dfd1` | `#e6dfd1` |
| `#1e2e1e` | `--state-armed-bg-off` | `#141d19` | `#141d19` |
| `#2a3a2a` | `--state-armed-border-off` | `#25342c` | `#25342c` |
| `#6a7a6a` | `--state-armed-text-off` | `#4c6157` | `#4c6157` |
| `#1e261e` | `--state-confirm-bg-off` | `#141d19` | `#141d19` |
| `#2a352a` | `--state-confirm-border-off` | `#25342c` | `#25342c` |
| `#6e7a6e` | `--state-confirm-text-off` | `#4c6157` | `#4c6157` |
| `#6a9d6a` | `--state-ok` | `#5b9074` | `#5b9074` |
| `#7bd88f` | `--state-live` | `#7cbb97` | `#7cbb97` |
| `#34c759` | `--state-linked` | `#7cbb97` | `#7cbb97` |
| `#4d8c5a` | `--state-live-dim` | `#5b9074` | `#5b9074` |
| `#1a2d1a` | `--state-live-bg` | `#16221c` | `#1d3129` |
| `#223522` | `--state-live-bg-hover` | `#1d3129` | `#243f32` |
| `#5d855d` | `--state-drop-border` | `#d98b7a` | `#5b9074` |
| `#223022` | `--state-drop-bg` | `#241a17` | `#16221c` |

**Paused / unarmed**

| today | token | variant A | variant B |
|---|---|---|---|
| `#4a3d2d` | `--state-paused-bg` | `#232320` | `#241d11` |
| `#5c4d3d` | `--state-paused-border` | `#423e37` | `#6b5326` |
| `#5a4a3a` | `--state-paused-bg-hover` | `#2c2a26` | `#33290f` |
| `#6c5a4a` | `--state-paused-border-hover` | `#e6dfd1` | `#e0a437` |
| `#f0ebe0` | `--state-paused-text` | `#e6dfd1` | `#e0a437` |

**Warn**

| today | token | variant A | variant B |
|---|---|---|---|
| `#f4a22b` | `--state-warn` | `#e0a437` | `#e0a437` |
| `#ff9f0a` | `--state-override` | `#e0a437` | `#e0a437` |
| `rgba(255, 159, 10, 0.15)` | `--state-override-bg` | `transparent` | `rgba(224, 164, 55, 0.14)` |
| `#3a2a1a` | `--state-warn-bg` | `#121211` | `#241d11` |
| `#7a4a1a` | `--state-warn-border` | `#e0a437` | `#e0a437` |
| `#e0a060` | `--state-warn-text` | `#8b8478` | `#e0a437` |

**Fail / recording**

| today | token | variant A | variant B |
|---|---|---|---|
| `#b55` | `--state-fail` | `#ef7a70` | `#ef7a70` |
| `#e05252` | `--state-alert` | `#ef7a70` | `#ef7a70` |
| `#7c1d1d` | `--state-record-bg` | `#232320` | `#251715` |
| `#b34040` | `--state-record-border` | `#ef7a70` | `#ef7a70` |
| `#9b2626` | `--state-record-bg-hover` | `#2c2a26` | `#3a201c` |
| `#ffc0c0` | `--state-record-text` | `#ef7a70` | `#ef7a70` |
| `#8b3a3a` | `--state-danger-border` | `#423e37` | `#8a4b45` |
| `#5c2a2a` | `--state-danger-bg-hover` | `#2c2a26` | `#251715` |

**Beat indicator**

| today | token | variant A | variant B |
|---|---|---|---|
| `#e5e5e5` | `--beat-accent` | `#7cbb97` | `#7cbb97` |
| `#b0b0b2` | `--beat-pulse-off` | `#8b8478` | `#8b8478` |
| `#48484a` | `--beat-dot-idle` | `#423e37` | `#423e37` |
| `#3c3c3e` | `--count-in-dot-idle` | `#2c2a26` | `#2c2a26` |
| `#a0a0a2` | `--beat-number-text` | `#8b8478` | `#8b8478` |

**Scrims**

| today | token | variant A | variant B |
|---|---|---|---|
| `rgba(0, 0, 0, 0.72)` | `--scrim` | `rgba(0, 0, 0, 0.78)` | `rgba(0, 0, 0, 0.78)` |
| `rgba(0, 0, 0, 0.65)` | `--scrim-bar` | `rgba(0, 0, 0, 0.68)` | `rgba(0, 0, 0, 0.68)` |
| `rgba(28, 28, 30, 0.92)` | `--scrim-count-in` | `rgba(18, 18, 17, 0.94)` | `rgba(18, 18, 17, 0.94)` |
| `rgba(0, 0, 0, 0.9)` | `--overlay-text-shadow` | `rgba(0, 0, 0, 0.9)` | `rgba(0, 0, 0, 0.9)` |
| `rgba(0, 0, 0, 0.35)` | `--float-shadow` | `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.5)` |
| `#000` | `--video-letterbox` | `#000` | `#000` |

## Legibility — WCAG contrast, computed from the token values

Every ratio below is **arithmetic on the hex values**, not a sample of rendered
pixels. Nothing here was measured by screenshotting the app.

#### Primary and body text — floor ≥ 7:1

| element | today | variant A | variant B |
|---|---|---|---|
| Current lyric line | 15.20 ✅ | 14.14 ✅ | 14.14 ✅ |
| Body / primary text | 13.51 ✅ | 14.14 ✅ | 14.14 ✅ |
| Primary text on a control | 11.06 ✅ | 13.15 ✅ | 13.15 ✅ |
| Numeric readout (cue time) | 11.05 ✅ | 13.15 ✅ | 13.15 ✅ |
| Arm button label | 8.48 ✅ | 10.40 ✅ | 10.40 ✅ |
| Selected-item label | 8.48 ✅ | 11.89 ✅ | 10.40 ✅ |

#### Micro-labels and secondary text — floor ≥ 4.5:1

| element | today | variant A | variant B |
|---|---|---|---|
| Top-bar summary | 7.86 ✅ | 5.06 ✅ | 5.06 ✅ |
| Setup column status | 6.54 ✅ | 5.06 ✅ | 5.06 ✅ |
| Muted text (position, hints) | 5.22 ✅ | 5.06 ✅ | 5.06 ✅ |
| Uppercase micro-labels | 5.22 ✅ | 5.06 ✅ | 5.06 ✅ |
| Micro-label on a panel | 5.22 ✅ | 4.71 ✅ | 4.71 ✅ |
| Timed-mode labels | 4.80 ✅ | 4.71 ✅ | 4.71 ✅ |
| Setlist editor secondary | 5.93 ✅ | 4.71 ✅ | 4.71 ✅ |
| Segmented-control label | 4.98 ✅ | 4.71 ✅ | 4.71 ✅ |
| Played-song title | 7.05 ✅ | 4.71 ✅ | 4.71 ✅ |
| Nudge button label | 7.67 ✅ | 4.71 ✅ | 4.71 ✅ |
| Beat number in the circle | 5.34 ✅ | 4.71 ✅ | 4.71 ✅ |
| Next-line preview | 2.56 ❌ | 2.88 ❌ | 2.88 ❌ |
| Faint cue times | 2.84 ❌ | 2.68 ❌ | 2.68 ❌ |
| Paused-timer label | 8.85 ✅ | 11.89 ✅ | 7.57 ✅ |
| Record button label | 6.61 ✅ | 5.77 ✅ | 6.34 ✅ |
| Video-warning text | 6.14 ✅ | 5.06 ✅ | 7.57 ✅ |

#### Status indicators — floor ≥ 4.5:1

| element | today | variant A | variant B |
|---|---|---|---|
| Armed / live green — mark | 8.00 ✅ | 7.81 ✅ | 7.81 ✅ |
| Media-linked green | 6.28 ✅ | 7.81 ✅ | 7.81 ✅ |
| Prereq check OK | 5.38 ✅ | 5.08 ✅ | 5.08 ✅ |
| Prereq check FAIL | 3.68 ❌ | 6.86 ✅ | 6.86 ✅ |
| Drift warning | 8.14 ✅ | 7.91 ✅ | 7.91 ✅ |
| Drift alert | 4.45 ❌ | 6.38 ✅ | 6.38 ✅ |
| Manual-override badge | 8.28 ✅ | 8.51 ✅ | 8.51 ✅ |
| Beat accent (downbeat/pulse) | 11.06 ✅ | 7.81 ✅ | 7.81 ✅ |
| Beat off-pulse | 6.44 ✅ | 4.71 ✅ | 4.71 ✅ |
| Arm button border | 2.27 ❌ | 3.97 ❌ | 3.97 ❌ |

#### Status colours told apart by more than hue

Contrast *between* the three status colours. A ratio near 1.00 means two
marks are the same lightness and only hue separates them.

| pair | today | variants A and B |
|---|---|---|
| green vs amber | 1.20 | 1.01 |
| green vs red | 2.19 | 1.22 |
| amber vs red | 1.83 | 1.24 |

### What the tables say

**Both variants clear every floor that today's UI clears, and fix two it
doesn't.** The prereq-check FAIL mark goes 3.68 → 6.86, and the drift alert
goes 4.45 → 6.38. Both are currently under the 4.5 floor in shipped Pregonero
and neither was on anyone's list.

**Three fails, and none of them is new:**

- *Next-line preview* (2.88, today 2.56) and *faint cue times* (2.68, today
  2.84). These are deliberately recessive — the next line is meant to be
  available, not competing with the line being sung. They fail the floor
  today and they fail it in both variants. Preserved, not introduced. If you
  want the next-line preview to actually clear 4.5, that is one token
  (`--text-dim`) and it is a design change to today's app, not to the restyle.
- *Arm button border* (3.97, today 2.27). This is a 1px border, not a mark you
  read; the Arm button's state is carried by its fill and its label, which sit
  at 10.40. Listed for completeness — and note it is still 1.7× better than
  today.

**One real regression, and it is the honest bad news of this prototype.**
Bombista's `--review` and `--fail` are both light colours, close in luminance.
Today's Pregonero amber and red are further apart. So the three status colours
are told apart *less* by lightness in the variants than they are today:

- amber vs red: **1.24** in the variants, 1.83 today
- green vs red: **1.22** in the variants, 2.19 today
- green vs amber: 1.01 in the variants, 1.20 today — effectively hue-only in
  both, so no change in practice

This matters in exactly one place, but it is a place that matters: **the drift
readout swaps amber → red in the same slot, same size, same position.** That is
the one pairing in the whole UI where two status colours occupy the same pixels
at different times, so lightness is the only channel that can carry the change
without you having to look directly at it. Everywhere else the three colours
live in different widgets in different regions and never trade places.

I did not negotiate this floor down and I did not quietly fix it. The fix, if
you want it, is one token: `--state-alert` moved off `--fail #ef7a70` to a
deeper red. That buys separation and costs fidelity to Bombista's triad, which
is your call, not mine.

### Where `--high` had to be lifted, and why

Bombista's `--high #4f7d63` reaches only **3.97:1** on the ink ground. It is
muted there on purpose — the stylesheet's own comment says so: *18 of 19 rows
are HIGH and none of them need you*. In Pregonero, green means the show is
live, which is the one thing that does need you. So:

| use | value | on ink |
|---|---|---|
| fills and borders (Arm button ground) | `#4f7d63` — Bombista's literal | 3.97 |
| marks that must be read (checks, cue accent) | `#5b9074` | 5.08 |
| the beat indicator | `#7cbb97` | 8.40 |

Same hue, lifted until it clears the floor. This is a deviation from the source
palette and it is deliberate; constraint 2 outranks fidelity.

## Which elements must keep saturated status colour

These carry the same status colour in **both** variants, because each of them
answers a question the operator asks at a distance, under pressure, without
time to focus:

- **The Arm button** (`.ctrl-arm`) — is the show live? The single most
  consequential state in the app, and the one whose colour you read from
  peripheral vision while looking at the audience.
- **The beat indicator** (`.beat-circle`, `.beat-pulse`, the count-in dots) —
  it is a metronome you read rather than hear. It got the *highest* contrast
  of anything status-coloured (8.40) for that reason, and it is identical in
  A and B on purpose: it is not part of the experiment.
- **Drift warn / alert** (`.ctrl-timed-drift`) — the readout that tells you
  the timeline and the singing have come apart. Colour is the whole signal.
- **The prereq checks** (`.check-ok` / `.check-fail`) — setup-time, but they
  are the thing standing between you and being able to arm.
- **The manual-override badge** — it tells you the song has dropped out of
  video sync into manual. That is a live-state change you did not necessarily
  intend.
- **The live cue marker** in the video strip — which line is happening now.

What is *allowed* to lose saturated colour, and does in variant A: selection.
The active segment, the selected language, the queued song, the row being
edited. All of those are answers to "what did I choose", asked at the desk with
time to look — not "what is happening", asked on stage without it.

## What resisted the brutalist treatment

The honest list.

1. **The prototype cannot test the whole aesthetic, only palette, type and
   radii.** Shadows and transitions are not colour and mostly not tokenised.
   There is exactly one `box-shadow` in the file and three transitions, all of
   them on the beat indicator (80ms colour/transform feedback). Bombista says
   *"removed, not eased"* — but here they are functional: they are how the beat
   reads as a pulse rather than a blink. Left alone deliberately.
2. **Buttons and the sung lyric wanted different type, and shared one token.**
   Monospace is right for a control and wrong for a 2.6em line of lyrics. This
   forced a second token (`--font-control`) into commit 1 after the fact —
   which is the process working, but it is worth knowing that the first pass
   missed it.
3. **Clay is nearly homeless.** Bombista's signature accent marks "the active
   thing", but in Pregonero every active thing already carries a status colour
   that means something more specific. Clay ends up on the focus ring and, in
   variant A, the drag-and-drop target. If the restyle is supposed to *look*
   like Bombista, this is the biggest reason it doesn't quite: the one colour
   that gives Bombista its character has almost nothing to do here.
4. **The dark green disabled states are near-invisible either way.** Today's
   `.ctrl-arm:disabled` triad (#1e2e1e / #2a3a2a / #6a7a6a) is already
   extremely low contrast; the variants keep it low. Disabled has no floor, so
   nothing failed, but "you cannot arm yet" is arguably worth reading.
5. **Three inputs and the segmented control have their own font size from the
   UA stylesheet** (`select` computes to 13.33px regardless). Nothing here
   changed that, and nothing should — it is a font-size question and font sizes
   are frozen.
6. **Squaring the beat circle is the loudest single move in either variant.**
   `border-radius: 50%` → `0` turns the beat circle, the timer and the pulse
   dots into squares. It is the most brutalist thing in the prototype and the
   most likely thing to be wrong on stage. It is one token (`--radius-round`)
   if you want it back, in either variant, without touching anything else.

## The theme-switch chord

**`Ctrl` + `Shift` + `K`.**

What it was checked against — every key handler in the app, found by grepping
for `keydown`, `.key ===`, and the modifier properties across `src/`:

| where | keys | collides? |
|---|---|---|
| `App.tsx` control window | `ArrowRight`, `Space`, `ArrowLeft`, `r`, `a`, `s`, `l`, `b` | no |
| `App.tsx` single-screen projection | `ArrowRight`, `ArrowLeft` | no |
| `ManageSetlistsView.tsx` rename input | `Enter`, `Escape` | no |
| Electron menu accelerators | none — `main.cjs` installs no `Menu`, so only the default macOS menu is in play and it is entirely `Cmd`-based | no |

The important detail: **every one of those handlers matches a bare key with no
modifier guard.** Holding `Ctrl+Shift` would *not* have stopped `a` from
arming or `b` from blanking. So the chord had to avoid those keys outright
rather than rely on the modifier to disambiguate. With Shift held, `e.key` is
`'K'`, which none of them match — and the listener runs in the **capture
phase** with `stopPropagation`, so it is consumed before any of them sees it.
Two independent reasons it cannot fire a transport command mid-song.

State is plain React state plus one `document.documentElement.dataset` write,
seeded by reading the attribute back so the theme survives a route change. It
is deliberately **not** routed through the persisted-settings machinery, so
neither the storage-event nonce trap nor the stale-broadcast trap in
`CLAUDE.md` applies. No cross-window sync; the projection window is a separate
document and never sees the attribute.

Two files (`src/ThemeSwitcher.tsx`, five lines in `src/App.tsx`), one
`git revert`.

## Where commit 1 had to split one colour into two tokens

Seven places. Each is a case of one hex doing two unrelated jobs, where a theme
has to be able to move one without the other.

| old value | split into | why |
|---|---|---|
| `#2d4a2d` + siblings | `--state-armed-*` / `--state-selected-*` | **the important one.** One green dressed both "the show is live" and "you picked this". 21 occurrences moved. Without this split, variant A cannot exist — reserving status colour for liveness is the whole idea it is testing. |
| `#2c2c2e` | `--control-bg` / `--rule-strong` | a button fill and a top-bar hairline |
| `#3a3a3c` | `--surface-hover` / `--rule` / `--control-bg-raised` / `--control-border-disabled` | a hover fill, a container border, a resting fill one step forward, and a disabled outline |
| `#48484a` | `--control-border` / `--surface-hover-strong` / `--text-disabled` / `--beat-dot-idle` | a border, a stronger hover fill, disabled text, and an idle beat dot |
| `#636366` | `--control-border-focus` / `--text-faint` | a focus ring and faint text |
| `#1c1c1e` | `--app-bg` / `--panel-bg` / `--input-bg` / `--surface-inset` | the screen, panels, fields and wells |
| `#e5e5e5`, `#b0b0b2` | `--text-primary` / `--beat-accent`, `--text-secondary` / `--beat-pulse-off` | body text and the beat indicator's active marks happened to share a value. They are not the same thing, and the beat is the one element whose contrast I most wanted to raise independently. |

An eighth split was needed for type: `--font-ui` / `--font-control`, so the
buttons could go monospace without dragging the sung lyric with them.

## How this was verified

- **Commit 1 is a no-op:** mechanical `var()` expansion diffed against the
  previous file. Zero differing declarations.
- **Contrast:** arithmetic on the token hex values (WCAG 2.x relative
  luminance). No pixel sampling.
- **The theme mechanism works:** `control.css` loaded into a page with the
  control-screen markup, `data-theme` toggled across all three values, and
  `getComputedStyle` read back for background, colour, font-family and
  border-radius. Computed styles are reliable in an agent-driven pane;
  rendered-pixel sampling is not, and none was done. The reads confirmed
  `today` reproduces the original values exactly, and that A and B differ on
  the selection axis (`.ctrl-segment--active` background `#232320` in A,
  `#1d3129` in B). **This was read in a standalone Chromium, not in Electron —
  the app itself has not been launched.** That check is yours.
- **Tests:** 941 green on every commit. `tsc --noEmit` and `eslint` clean.

## Are A and B actually different?

Yes, and the difference is concentrated where you spend setup time rather than
performance time. In A the songs screen, the language grid and the segmented
controls are ink and paper with bright hairlines; in B they are green-tinted
the way they are today. The Unarm button and the paused timer go neutral in A
and amber in B. Recording and delete are outlined in A, filled in B.

During an actual performance — armed, mid-song, watching the beat and the
lyric — **A and B are nearly identical**, because everything that signals
liveness was deliberately held constant. That is by design, but it is worth
knowing before you test: if you flip the chord mid-song and see almost nothing
change, that is the experiment working, not a bug. Flip it on the songs screen
and on the setup screen to see the actual difference.

## One opinion, clearly labelled — the choice is yours

If I had to argue for one: **A**, on the grounds that it makes the green mean
something again. Today green does four different jobs — armed, selected,
played, linked — and a colour that means four things at a distance means
none of them. A reserves it for liveness, which is the only reading you have
to do without looking. B is the safer bet precisely because it is closer to
what your hands already know, and "I can operate this tonight" beats "this is
better designed" every time. That trade-off is the decision, and it is not
mine to make — you are the one who has to read this while singing.

## After you pick

A separate task, not this one: revert the switcher, drop the losing variant's
block, fold the winner's values into `:root`, and open the real PR off
commit 1.
