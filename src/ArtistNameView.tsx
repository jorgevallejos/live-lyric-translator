/**
 * **First run, screen two of three: who the artist is.**
 *
 * **The order is THE DEAL · WHO YOU ARE · YOUR FOLDERS** (Jorge, 2026-09-05). The deal is the offer,
 * the name is who the offer is for, and the folders are where the work is. Asking the name after
 * the folders would make it a postscript to a settled screen; asking it before the deal would ask
 * for something before anything had been offered.
 *
 * **Why its own screen and not a third column on the folders screen.** *The folders screen answers
 * where your things are, and a name is a different kind of question.* **Six rounds bought that
 * screen's clarity** — equal columns with a hard rule between them, so they read as separate
 * questions before any is read — and its whole premise is that the columns are the same kind of
 * thing. A name column would break the thing that makes it work. **The earlier objection was to the
 * folders screen, not to first run**, and Cowork over-corrected from one to the other.
 *
 * **And it is NOT captured from Bombista's page 1.** That was Cowork's proposal and Jorge rejected
 * it: *opportunistic and fishy — you capture something for a purpose different from the one I had
 * in mind when I filled it in.* **A value collected for one purpose is not silently promoted to
 * another.** Bombista prefills from this; it does not feed it.
 *
 * ## The copy, and what it may promise
 *
 * **It says what the name is for, and only what is true today.** The message home — the line, the
 * URL, the QR — is decided and is the first gig's work, not this round's, so this screen does not
 * announce it. What it says instead is the durable half: **this is the name on the work, and the
 * app will fill it in for you rather than ask again.** *If a sentence could appear on a landing
 * page it is wrong* is the standard the deal's copy is held to, and it holds here.
 *
 * ## The one control
 *
 * **`Continue →` and nothing else, and it is gated on an answer.** There is no skip, for the same
 * reason first run has none: **the whole point is that a setting stops being something you discover
 * at the moment it blocks you.** The gate's reason names the question rather than saying *required*,
 * which is what `GatedAction` is for.
 *
 * **The answer is written as it is typed, and the button is about leaving** — the folders screen's
 * own rule, so a launch interrupted here comes back to a question already answered rather than to
 * nothing.
 */
import { useState } from 'react'
import { getArtistName, hasArtistName, setArtistName } from './contentFolders'
import { GatedAction } from './GatedAction'

/** **Whether this machine has said who the artist is.** Read from the world, never from a flag. */
export function isArtistNameDue(): boolean {
  return !hasArtistName()
}

export function ArtistNameView({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState<string>(() => getArtistName() ?? '')

  const commit = (value: string) => {
    setName(value)
    setArtistName(value)
  }

  const answered = name.trim().length > 0

  return (
    <div className="songs-screen artist-name-screen" data-testid="artist-name">
      <header className="songs-top-bar">
        <h1 className="songs-title">Who is this for?</h1>
      </header>

      <main className="songs-body artist-name-body">
        <label className="artist-name-label" htmlFor="artist-name-input">
          The name the work goes out under
        </label>
        <input
          id="artist-name-input"
          className="artist-name-input"
          data-testid="artist-name-input"
          type="text"
          value={name}
          autoComplete="off"
          spellCheck={false}
          placeholder="Your name, or the name you play under"
          onChange={(e) => commit(e.target.value)}
        />

        {/* **What it is for, in one sentence, and it is the true one.** Not *it goes on the wall*:
            the message home is the first gig's work and is not built yet, and a screen that
            announces a feature it does not have is the class of claim this project has a rule
            about. What IS true today is that the app stops asking. */}
        <p className="artist-name-why" data-testid="artist-name-why">
          Pregonero fills this in for you when a new song is made, so you are not asked again. It is
          a preference, not part of any song — change it in Preferences whenever you like.
        </p>

        <div className="artist-name-foot">
          <GatedAction
            site="artist-name-continue"
            label="Continue →"
            busy={false}
            blockedBy={answered ? null : 'Pregonero has not been told who the artist is yet.'}
            onClick={onDone}
          />
        </div>
      </main>
    </div>
  )
}
