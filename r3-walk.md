# R3 walk — the song half of Friday's E2E

**One question:** can a lyrics `.txt` plus a recording become a song in the library that passes
`validate --for-performance`? If yes, the song half is proven and never needs proving again.

Ten minutes. Delete this file when it is done.

## Before

```bash
cd "/Users/jorgevallejos/Chango Pepper/projects/pregonero" && git checkout r3/one-door && npm run build && npm run pack
```

Launch the packaged app **from Finder**. Preferences → songs folder → `~/Chango Pepper/songs`.

## The walk

**Setup → Songs → click any song row** (or `New song` → name it → Create, then click its row).
Either way you land in the same door — that is the point of the round.

1. **Choose the words** → `songs/audio/test/libertad/libertad.txt`
2. **Choose the recording** → `songs/audio/test/libertad/Libertad-both-channels…mp3`
3. **Align** — about a minute. It transcribes.
4. **Review and tempo** — Bombista's page opens. **Type the tempo: 66.67, 6/8, 1 count-in bar.**
   Then **Done**.
5. **Add to the library**

**Then check the one thing that matters:**

```bash
bombista validate --for-performance "/Users/jorgevallejos/Chango Pepper/songs/libertad.json" && echo "SONG HALF PROVEN"
```

## What to expect, and what counts as failing

- **No question about whether the song exists.** Two pickers, three moves. If you are asked *does a
  song file exist yet?* you are on the old build.
- **The words picker takes `.txt` and `.json` alike.** One picker, no fork.
- **You are never asked where the song goes.** It says `…/songs/libertad.json` before you press Add.
- **After Add, `libertad` is in the Songs list** — with no status, no badge, no "created" label.
  That is the whole ending.
- **`libertad.json` on disk has no `_bombista` block.** It should look like any hand-made song.

**Fails if:** you are asked a question about the pipeline; you are asked for a path; the song lands
anywhere but `songs/libertad.json`; or `validate` refuses.

## Two things that are not failures

- **The recording has the guitar 15 dB under the voice.** Irrelevant here — this proves the flow,
  not the take.
- **`songs/libertad.json` already exists and is the broken one** (24 lines against a 20-entry
  timeline). Promoting over it **merges** and backs it up as `libertad.json.backup-<stamp>`, which
  is the *other* half of the same door working. If you would rather see the **create** path, move
  the existing file out of `songs/` first — then `validate` is proving a song that did not exist
  ten minutes ago, which is the stronger result.

## Not in this build, on purpose

First run, the gig list's readiness, the four-step gig flow, `<gig>/setup/`, Bombista's first
screen. Setup home lists gigs, Preferences works, and the six-step gig flow works — none of them
blocks Friday.
