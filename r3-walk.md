# R3 walk — the song half of Friday's E2E

Ten minutes. Delete this file when it is done.

## Read this first — I ran the pipeline and the answer has a fork in it

Your question was: *can a lyrics `.txt` plus a recording become a song that passes
`validate --for-performance`?* I ran the real thing on the real material before writing this, and
the honest answer is **no from a `.txt` alone, yes from a song `.json`** — and that is the design
working, not a defect.

| Words handed over | Result |
|---|---|
| `libertad.txt` | Song **created**, 24 lines, 24 timeline entries. `validate` then **refuses**: `artist`, `notes` and `title_translations` are required and a text file carries none of them. |
| `songs/libertad.json` | Timeline **merged**. `validate --for-performance` → **ok**. |

A `.txt` carries words and nothing else. The missing three come from `bombista new`'s skeleton or
from the **Translations** step outside the suite — which is exactly the gap the door names. So the
`.txt` route ends at *a song in the library that still needs its metadata*, which is honest.

**One more thing I hit, and it is the guard doing its job:** promoting a `.txt`-derived candidate
onto a **complete** song is refused, because it would narrow a full song to a thinner source. It
tells you to re-run against the complete song JSON. That is step 1 below.

**And the payoff you did not ask for:** the route that passes the gate is the one that **fixes
`libertad`** — the standing 24-lines-against-20-entries failure. Its real file is untouched on disk;
this walk is what repairs it.

## Before

```bash
cd "/Users/jorgevallejos/Chango Pepper/projects/pregonero" && git checkout r3/one-door && npm run build && npm run pack
```

Launch the packaged app **from Finder**. Preferences → songs folder → `~/Chango Pepper/songs`.

## The walk — Setup → Songs → click the `libertad` row

Same door either way; that is the point of the round.

1. **Choose the words** → `songs/libertad.json` *(the song file, not the `.txt` — see above)*
2. **Choose the recording** → `songs/audio/test/libertad/Libertad-both-channels…mp3`
3. **Align** — about **55 seconds**. Expect `HIGH 21 / REVIEW 3 / FAIL 0`.
4. **Review and tempo** — Bombista's page opens. `libertad` already carries **66.67, 6/8, 1 bar**,
   so there is nothing to type; look at the three REVIEW lines and hear them. **Done.**
5. **Add to the library** — expect `backup: …/libertad.json.backup-<stamp>` and four new lines
   (20 → 24).

Then:

```bash
bombista validate --for-performance "/Users/jorgevallejos/Chango Pepper/songs/libertad.json" && echo "SONG HALF PROVEN"
```

## Expect, and what counts as failing

- **No question about whether the song exists.** Two pickers, three moves. If you are asked *does a
  song file exist yet?*, you are on the old build.
- **One picker for the words**, offering `.txt` and `.json` together.
- **You are never asked where the song goes.** It shows `…/songs/libertad.json` before you press Add.
- **After Add, `libertad` is in the Songs list, no longer broken** — and with no status, no badge,
  no "created" label.

**Fails if:** you are asked a question about the pipeline; you are asked for a path; the song lands
anywhere but `songs/libertad.json`; or `validate` refuses.

## Optional, two minutes, if you want the create path seen too

Choose `songs/audio/test/libertad/libertad.txt` as the words against an **empty** songs folder. The
song is created and appears in the list; `validate` will name the three missing fields. That is the
`.txt` route's honest ending, and worth seeing once.

## Not a failure

The recording has the guitar 15 dB under the voice. Irrelevant here — this proves the flow, not the
take.

## Not in this build, on purpose

First run, the gig list's readiness, the four-step gig flow, `<gig>/setup/`, Bombista's first
screen. Setup home lists gigs, Preferences works, the six-step gig flow works — none of them blocks
Friday.
