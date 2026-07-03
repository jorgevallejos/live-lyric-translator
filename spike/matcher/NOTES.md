# Matcher notes (S2)

## Design as built

`LyricFollower` in `follower.py` — pure stdlib, no state outside the instance.

- **Normalization** (`normalize_token`): lowercase → NFKD → drop combining
  marks → keep alphanumerics only. So `¡QUÉ` ≡ `que`, `festín.` ≡ `festin`,
  `pa'` ≡ `pa`, `ñ` ≡ `n`. Matcher and ASR text meet on this common form.
- **Window**: the first `window_size` (default 5) normalized tokens of each
  line. Only lines `pointer+1 .. pointer+1+max_skip` (default lookahead 3
  lines total) are ever candidates — absolute line indices, which is what
  makes distant chorus repeats (lines 16/27 of the test song are identical)
  structurally unable to cause jumps.
- **Fuzzy match**: exact always; targets ≤ 3 chars exact-only (Spanish
  stopwords `de/la/y/en` would otherwise match everything); prefix match
  both directions at ≥ 4 chars; Levenshtein ≤ 1 (target ≥ 4) / ≤ 2
  (target ≥ 7).
- **Evidence**: per candidate, a *set* of matched window tokens. Set
  semantics = melisma/held-word immunity (the same word can't contribute
  twice) and duplicate-window-token dedupe. One incoming word claims at
  most one window token per candidate.
- **Thresholds**: next line advances at `min_evidence` (default 2) distinct
  matches; skip targets need `skip_evidence` (default 3). Both capped at
  the candidate's distinct-window-token count so 1–2-word lines can still
  advance. When several candidates qualify on the same word, the *nearest*
  wins (false jumps are the worst failure per the decision rule).
- **Advance**: emits events `pointer+1 .. target` in order, all stamped
  with the triggering word's `audio_time`; then *all* evidence is cleared.
  The reset is what prevents identical adjacent lines from double-advancing
  off a single batch of words.

## Known weaknesses (for the report)

1. **Trailing-repeat trap on identical adjacent lines.** If, right after an
   advance, the singer re-sings ≥ `min_evidence` *distinct* opening words of
   the just-advanced line and the next line is identical (adjacent chorus),
   the follower advances again early. Pure held-word repetition is safe
   (set dedupe); the trap needs two distinct words repeated. A refractory
   period (min time/words between advances) would fix it; not built.
2. **No evidence decay.** Evidence accumulates forever until an advance.
   Two matching words minutes apart (e.g. one early mishearing + one real
   word) can trigger an advance. A per-candidate sliding time window
   (e.g. forget matches older than ~4 s) is the obvious next step.
3. **Stall on very short / stopword-heavy lines.** A line like
   "de plata brillante." can stall if ASR drops the two content words
   (short words are exact-match-only and don't count for much). Catch-up
   then recovers 1–2 lines late, emitting the stalled lines as a burst —
   correct order, but late `audio_time` for the skipped lines. S3 metrics
   should count these as misses for the ±1.0 s criterion.
4. **Opening-window-only evidence.** Words from the *end* of a long line
   (beyond `window_size`) are invisible. Fine for these 4–7-word lines;
   longer material would want the window to slide within the line.
5. **Uniform fuzzy cost.** Levenshtein treats all substitutions equally;
   Spanish ASR confusions (b/v, s/z/c, ll/y) are cheaper in reality.

## Fancier ideas deliberately not built

- **DTW / global alignment** of the word stream against the full lyric
  token sequence — more robust offline, wrong shape for streaming.
- **Phoneme-level matching** (grapheme→phoneme, then align) — would absorb
  mishearings better than edit distance; heavy for a spike.
- **Beam over line hypotheses**: keep k weighted pointer hypotheses,
  advance the display on the MAP hypothesis — the right answer if the
  simple follower proves too brittle on real ASR output.
- **Tempo prior**: use the authored timeline/BPM as a prior on when the
  next line *should* start, gating advances that are wildly early. Blends
  into the "drift corrector for beat-clock Auto mode" CONDITIONAL outcome.
