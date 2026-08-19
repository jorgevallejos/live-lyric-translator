# Pregonero's visual language

_The control window's skin, and the reasoning behind it. Adopted 2026-08-19.
The projection window is **not** covered here — see the note at the end._

Pregonero's control UI is a **Tramoya instrument**, and it looks like one. The
palette, the type and the shape rules come from Bombista's `STYLESHEET`
(`projects/bombista/bombista/pages.py`), which is the suite's house style:
ink ground, paper text, hairline rules, one clay accent, monospace for
anything you operate or read as data. Read the rationale there; it is not
re-derived here.

## The rules

**Ink ground, paper text.** `--app-bg #121211`, `--text-primary #e6dfd1`. One
palette — there is no light mode and there will not be one.

**Contrast is a budget.** It is spent on the line being sung and the control
the hand is going to. Everything else — structure, provenance, labels — sits
below that on purpose.

**Hairlines, not slabs.** Rules are 1px in `--rule` / `--rule-strong`. A
border you notice is a border spending contrast it has not earned.

**No radii, no gradients, no decorative motion.** The beat circle, the timer
and the pulse dots are squares. The three surviving transitions are all on the
beat indicator (80ms colour/transform) and are functional: they are how the
beat reads as a pulse rather than a blink.

**Status colour marks liveness, and nothing else.** This is the rule that
does the most work, and the one most easily lost. Before this change green
meant four different things at once — armed, selected, played, media-linked —
and a colour that means four things at a distance means none of them. Now:

| carries status colour | reads as ink and paper |
|---|---|
| the Arm button | the active segment |
| the beat indicator | the selected language |
| drift warn / alert | the song queued in the setlist |
| the prereq checks | the row being edited |
| the manual-override badge | recording and delete (outlined, not filled) |
| the live cue in the video strip | the paused concert timer |

The test for which side of that table something belongs on: *is this a
question I ask on stage without time to look, or at the desk with time?*
Liveness is the first kind. Selection is the second.

**Clay is used once.** `--accent #d98b7a` is Bombista's signature and it marks
the active thing — but in Pregonero everything active already carries a status
colour that means something more specific. So clay ends up on exactly two
things: the focus ring, and the suite's name in the masthead. That is a real
limit of transplanting this aesthetic, not an oversight.

**Type: a monospace instrument voice, except for the singing.** Controls,
micro-labels and numerics are monospace. The sung line stays sans, because
monospace at 2.6em is harder to read, not easier, and this is read on stage.
Chromium does not let form controls inherit `font-family`, so `--font-control`
exists purely to reach buttons and inputs at all. No webfont is loaded.

**Font sizes did not change and must not.** Pregonero is read in low light,
mid-song, at a glance. Where the aesthetic and legibility disagree, legibility
wins. Every ratio below is arithmetic on the token values, not sampled pixels.

## Legibility

#### Primary and body text — floor ≥ 7:1

| element | before | now |
|---|---|---|
| Current lyric line | 15.20 ✅ | 14.14 ✅ |
| Body / primary text | 13.51 ✅ | 14.14 ✅ |
| Primary text on a control | 11.06 ✅ | 13.15 ✅ |
| Numeric readout (cue time) | 11.05 ✅ | 13.15 ✅ |
| Arm button label | 8.48 ✅ | 10.40 ✅ |
| Selected-item label | 8.48 ✅ | 11.89 ✅ |

#### Micro-labels and secondary text — floor ≥ 4.5:1

| element | before | now |
|---|---|---|
| Top-bar summary | 7.86 ✅ | 5.06 ✅ |
| Setup column status | 6.54 ✅ | 5.06 ✅ |
| Muted text (position, hints) | 5.22 ✅ | 5.06 ✅ |
| Uppercase micro-labels | 5.22 ✅ | 5.06 ✅ |
| Micro-label on a panel | 5.22 ✅ | 4.71 ✅ |
| Timed-mode labels | 4.80 ✅ | 4.71 ✅ |
| Setlist editor secondary | 5.93 ✅ | 4.71 ✅ |
| Segmented-control label | 4.98 ✅ | 4.71 ✅ |
| Played-song title | 7.05 ✅ | 4.71 ✅ |
| Nudge button label | 7.67 ✅ | 4.71 ✅ |
| Beat number in the circle | 5.34 ✅ | 4.71 ✅ |
| Next-line preview | 2.56 ❌ | 2.88 ❌ |
| Faint cue times | 2.84 ❌ | 2.68 ❌ |
| Paused-timer label | 8.85 ✅ | 11.89 ✅ |
| Record button label | 6.61 ✅ | 5.77 ✅ |
| Video-warning text | 6.14 ✅ | 5.06 ✅ |

#### Status indicators — floor ≥ 4.5:1

| element | before | now |
|---|---|---|
| Armed / live green — mark | 8.00 ✅ | 7.81 ✅ |
| Media-linked green | 6.28 ✅ | 7.81 ✅ |
| Prereq check OK | 5.38 ✅ | 5.08 ✅ |
| Prereq check FAIL | 3.68 ❌ | 6.86 ✅ |
| Drift warning | 8.14 ✅ | 7.91 ✅ |
| Drift alert | 4.45 ❌ | 6.38 ✅ |
| Manual-override badge | 8.28 ✅ | 8.51 ✅ |
| Beat accent (downbeat/pulse) | 11.06 ✅ | 7.81 ✅ |
| Beat off-pulse | 6.44 ✅ | 4.71 ✅ |
| Arm button border | 2.27 ❌ | 3.97 ❌ |

#### Status colours told apart by more than hue

| pair | before | now |
|---|---|---|
| green vs amber | 1.20 | 1.01 |
| green vs red | 2.19 | 1.22 |
| amber vs red | 1.83 | 1.24 |

### Reading the tables

**Two failures in the old palette are fixed:** the prereq-check FAIL mark
(3.68 → 6.86) and the drift alert (4.45 → 6.38). Both were under the floor
and neither was on anyone's list.

**Three cells still fail, and none of them is new:**

- *Next-line preview* (2.88, was 2.56) and *faint cue times* (2.68, was 2.84)
  are deliberately recessive. The next line is meant to be available, not
  competing with the line being sung. Changing that is a design decision about
  the app, not about the skin; it is one token (`--text-dim`).
- *Arm button border* (3.97, was 2.27) is a 1px border, not a mark you read.
  The Arm button's state is carried by its fill and its label, at 10.40.

**One real regression.** Bombista's `--review` and `--fail` are close in
luminance, so amber and red are told apart less by lightness than they were
(1.24 vs 1.83). This matters in exactly one place: **the drift readout swaps
amber → red in the same slot, same size, same position** — the only pairing in
the UI where two status colours occupy the same pixels at different times.
Everywhere else the three live in different widgets in different regions and
never trade places. If it turns out to matter on stage, the fix is one token:
`--state-alert` off `--fail #ef7a70` onto a deeper red, trading fidelity to
Bombista's triad for separation.

### Where `--high` is not Bombista's literal value

`--high #4f7d63` reaches only **3.97:1** on ink. Bombista mutes it on purpose —
its own comment says *18 of 19 rows are HIGH and none of them need you*. Here
green means the show is live, which is the one thing that does.

| use | value | on ink |
|---|---|---|
| fills and borders (the Arm button ground) | `#4f7d63`, Bombista's literal | 3.97 |
| marks that must be read (checks, cue accent) | `#5b9074` | 5.08 |
| the beat indicator | `#7cbb97` | 8.40 |

Same hue, lifted until it clears the floor. The beat is lifted furthest
because it is the thing read fastest and least directly.

## How the token layer is organised

`src/control.css` has a single `:root` block, grouped: type, shape, grounds,
rules, accent, text, selection, armed/live, paused, warn, fail, beat, scrims.
**Names say what a value does, never what it is** — `--state-armed-bg`, not
`--green-1` — because that is what makes a re-skin a value edit instead of a
search-and-replace.

Two splits in there are load-bearing and easy to undo by accident:

- **`--state-armed-*` vs `--state-selected-*`** hold the same kind of value but
  answer different questions. Merging them back re-creates the four-meanings
  green this change exists to remove.
- **`--beat-accent` / `--beat-pulse-off`** are state marks that happen to sit
  near body text in value. They are not text and must stay independently
  adjustable — the beat is the element whose contrast matters most.

## The projection window is out of scope

`.projection-*` colours are **deliberately left as literals** in
`control.css` — six of them. That is not an oversight and it is not laziness:
the projection window is audience-facing, read from the back of a dark room,
where "contrast is a budget" is the wrong logic entirely. Keeping its colours
out of the token layer means no future theme edit can reach it by accident.

If the projection window is ever restyled, it is its own problem with its own
reasoning, and it should get its own token layer rather than borrowing this one.
