# R1 walk — for Jorge, not for Code

**Why this exists.** A round verified only by the thing that built it is how the setup design got
seven rounds deep without anyone noticing step 1 had no action on it. So: you run this, I don't.

**Delete this file when the walk is done.** It is an artefact of one round.

**Updated after the first walk, twice.** Step 4's two findings are fixed and re-walking it is the
check — including the songs list, which was a real defect. **Step 5 is now a skip**: you were right
to stop, and rebuilding that flow is its own round. Steps 6 and 7 are unchanged and unreached.

## Before you start

Build first. `npx electron .` serves the gitignored `dist/`, which goes stale silently.

```bash
cd "/Users/jorgevallejos/Chango Pepper/projects/pregonero" && git checkout r1/setup-home && npm run build && npm run pack
```

Then **launch the packaged app from Finder** — `/Applications` or wherever `electron-builder` put
it, by double-clicking. **Not `npm run dev`, not `npx electron .`.** The launch mode is the test:
an app started from a terminal inherits your shell's `PATH` and would hide the whole of step 2.

You will want a lyrics `.txt` and a recording to hand for step 5.

---

## 1 — The stage has one button

Open the app. On the control screen, look at the **GIG** column.

- **Expect:** one button, `Setup`. No `Folders`.
- **Fails if:** two buttons, or the Rig and Arm sections sit on top of Gig and Song again.

## 2 — Bombista is reachable, from Finder

`Setup` → `Preferences` → **Tools on this machine**.

- **Expect:** `bombista 1.1.0`, and under it a line naming a real path — most likely
  `/Users/jorgevallejos/.local/bin/bombista (a known install location)`.
- **Fails if:** `Not found`, or the line says `on PATH` — the second would mean you launched from a
  terminal after all, and this step has not been tested.

This is the step everything else is a door onto. If it fails, stop; nothing below will work and the
reason will not be what the screen says.

## 3 — Setup home, with real content

`Back` to Setup.

- **Expect:** two columns side by side — **Gigs** with `New gig`, **Songs** with `New song`. Both
  lists complete; no "show more", no scrolling *inside* a column. The page itself scrolls.
- **Expect:** gig rows carry **no readiness word at all**. Not "Ready", not "Not ready". That lands
  in R4 — the gig list — and a wrong verdict is worse than none.
- **Judge, and tell me:** with your thirteen songs and however many gigs, does this read, or is it
  a wall? I have my own answer at the bottom of this file — read it after you have yours.

## 4 — A song from nothing

**Re-walk this one; it is what stopped last time and it has changed.** Before setting anything,
open `New song` with **no songs folder set**.

- **Expect:** `Create` is **there and disabled**, with the reason under it and an `Open preferences`
  beside it. Not a paragraph where the button was.
- **Fails if:** the button is missing, or the reason only appears on hover.

Same check on the other two sites governed by the rule: `New gig` in a browser tab, and the visuals
door's `Open Muralista` when hosting is unavailable. Both used to vanish.

Then point the songs folder at an **empty directory** in Preferences, so the list starts empty.

`New song` → type `prueba` → `Create`.

- **Expect:** `prueba` appears in the Songs list, immediately.
- **Expect:** it carries **no status, no badge, no "created" label**. It is just there.
- **Expect:** `<empty folder>/prueba.json` exists on disk, written by `bombista new`, and you were
  never asked where to put it.
- **Fails if:** you are asked for a path; if anything says the song is ready or complete; or if the
  list does not change until you navigate away and back.

Then, with the songs folder pointed back at the real `songs/`:

- **Expect:** all thirteen songs are listed, without adding a single one by hand. This is the
  defect you found: the library was a list of individually chosen songs and could not see a folder.
- **Expect:** `libertad` among them, visibly broken, with its reason. Not hidden.
- **Expect, on the manage-setlists screen:** a library row has **one** action, and it is
  add-to-setlist. The trash can is gone. `Remove <song> from setlist` is still there and still
  works — that is the durable, gig-scoped act, and it is the one that must not have gone with it.

## 5 — SKIP. You were right to stop here.

You declined this because the subflow implements the previous design. It still does — rebuilding it
as one door is now **R3** in the queue, and `promote` being able to land a new song (**R2**, built
overnight on `r2/promote-creates`) is what it needs. Do not walk this until R3 exists.

## 5-as-written, kept only so the diagnosis is on record

Click a song row to open the flow, or `New song`. Try to get from a lyrics `.txt` plus a recording
to a finished song in the list.

**It will not complete, and that is a known result rather than a surprise.** Confirm it stops where
I say it does, because if it stops somewhere *else* I have the diagnosis wrong:

- `align` runs, transcribes, and writes into a staging directory.
- The review page opens, plays the audio, takes the tempo.
- **There is then no way to get the finished song into `songs/`.** `bombista promote` requires its
  target to already exist and merges only the timeline keys, so it can neither create the file nor
  carry the words into a skeleton; `back_up_and_replace` copies the original before replacing it,
  so it cannot write a file that is not there. Pregonero must not move it: it never writes a song
  file.

**Tell me where it actually stopped.** That sentence is the whole of what R1 could not close.

## 6 — Gig rows

`New gig`, pick any folder. Then, with the app open, **rename that folder in Finder** and come back
to Setup.

- **Expect:** the row is still there, still naming the old path, with `Locate…` and `Forget`.
- **Expect:** every other row still opens.
- **Does not yet:** say that the folder is gone. Pregonero cannot tell a moved folder from a fresh
  empty one — that is R4's third item. So the row looks ordinary and fails when you open it.

`Locate…` → pick the renamed folder.

- **Expect:** the row keeps its place in the list, now with the new path. Not a new row at the top
  with a dead one left behind.

## 7 — Nothing on the stage broke

Back to the control screen. Open a gig, arm a song, advance a line, unarm.

- **Expect:** exactly what it did yesterday. R1 touched no performance path.

---

## What I would change already, before the gig list builds on it

You asked me to judge the no-truncation decision. **Keep it** — but the pressure is not where I
expected.

At 1440×900 with thirteen songs and four gigs the page is about 1245px tall, so one scroll. The
**songs** column is fine: one line each, dense, scannable, and it would take a catalogue several
times this size to become a problem. The **gigs** column is the heavy one, and the weight is almost
entirely the **folder path** — three wrapped lines under a one-line name, on every row.

The path is diagnostic information, not identity: the gig id already identifies the row, and the
path only matters when something is wrong with it or when two gigs share a name. **In R4, when each
row also gains a delta, I would show the path only on a row that needs it.** That is a change to
R4's design rather than a retreat from no-truncation, and I would rather raise it now than have that
round inherit a row that is already the tallest thing on the screen. It is written into the queue.
