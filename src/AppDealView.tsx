/**
 * **The app's deal — the first thing on screen on a machine that has never answered the folders.**
 *
 * **It is a screen, not a popup, and there are two screens here rather than one flow** (Jorge,
 * 2026-09-04). The deal, then the folders. **No step bar**: a step bar would say this is the first
 * of a numbered sequence you are inside, and it is not — it is the offer, and step 2 is the first
 * thing asked of you.
 *
 * **Why it exists, and why here.** The rule is that words earn their place only where effort
 * precedes reward. **This is the strongest instance of it in the whole suite**: you have just
 * installed the thing and it asks for three folders of your own work before it has done anything
 * for you at all. **This supersedes the 03/09 ruling that step 2 needs nothing** — that ruling said
 * each column argues its own worth, which is true and is an argument for *a folder*; **nothing ever
 * said what the app itself gives you.** A third column would have made it worse: three small
 * arguments and still no overall one. **The right reason step 2 carries no deal is that the app's
 * deal covers it one screen earlier.**
 *
 * **Shown when no folders have been answered, dismissed with one press, never seen again** — the
 * same first-time behaviour as Bombista's deal and Muralista's, and **read from the world, never
 * from a stored flag.** `hasAnsweredAnyFolder()` is the whole rule: a machine that has said nothing
 * has not been offered anything yet, and a machine that answered one folder and quit comes back to
 * the folders. **The alternative, a remembered "do not show again", was rejected** in this suite
 * already: it is remembered state in a project whose test discipline is starting from nothing, so
 * after one walk nobody sees the screen again and it rots unwatched.
 *
 * **Three blocks, and no more.** What you get, what it costs, what it does not do. The body text is
 * **the loudest thing on the screen** rather than the muted register the app uses for notes,
 * because here the prose is the content and not something beside it; the caps labels are the quiet
 * ones. That inversion is the whole typographic decision.
 *
 * **Why each block is what it is** (Jorge, 2026-09-04). The first names the founding problem —
 * words an audience cannot follow — rather than describing software; *your language* rather than
 * *Spanish* keeps it concrete while making the tool describable to someone else. The second is
 * honest about the whole cost rather than the next click, and **names each folder's purpose,
 * because *three folders* alone is a demand while naming them is an answer.** *Where your gigs
 * **will** live* carries in one word that this one may not exist yet, where songs and visuals do.
 * The third answers the exact anxiety the second creates, and states the `song-performance` and
 * `setup` ruling as a promise instead of a rule.
 *
 * **Deliberately absent:** translations, which are Bombista's deal and would be the said-twice
 * drift caught on 03/09; and anything about walls or projectors, which is Muralista's and should
 * not front-load a cost met later.
 *
 * **Orientation, not persuasion.** The person already chose this tool; the gap is not belief but
 * not knowing what they will get at the moment they decide whether to keep going. **If a sentence
 * could appear on a landing page it is wrong**, and that is the standard this copy is held to.
 */

import { hasAnsweredAnyFolder } from './contentFolders'

/**
 * The three blocks, as data, **because counting them is the only way *three and no more* survives**
 * — the same reason `GATED_SITES` is a list a test counts.
 *
 * **The copy is the design.** Every clause was argued; it is asserted word for word in the tests,
 * so a later reader who wants to improve a sentence has to change the ruling first.
 */
export const DEAL_BLOCKS = [
  {
    label: 'What you get',
    body:
      'Your lyrics and visuals on the wall, in the language of the room, changing with the music ' +
      'while you play. An audience that doesn’t speak your language follows the song instead of ' +
      'waiting for it to end.',
  },
  {
    label: 'What it costs',
    body:
      'Three folders, answered once: where your songs are, where your visuals are, and where your ' +
      'gigs will live. Then a sitting per song to time the lyrics, and a sitting per room to ' +
      'decide where they land.',
  },
  {
    label: 'What it does not do',
    body:
      'Nothing you already have is moved, renamed or changed. It reads your folders, and keeps ' +
      'what it makes in two folders of its own.',
  },
] as const

/**
 * **Whether the app's deal is what this machine sees first.** The world is the only source: no
 * folder answered means nothing has been offered yet.
 *
 * Read once into state by the caller rather than on every render, so pressing `Begin →` moves the
 * screen on without a folder having been answered — **the press is a transition, not a flag.** A
 * launch that ends here without answering anything is offered the deal again, which is correct: the
 * offer was never taken.
 */
export function isDealDue(): boolean {
  return !hasAnsweredAnyFolder()
}

export function AppDealView({ onBegin }: { onBegin: () => void }) {
  // **No state of its own.** Nothing on this screen is stored, nothing is asked, and the one press
  // hands the screen over to `App`, which is what holds which of the two screens is up.
  return (
    <div className="songs-screen app-deal-screen" data-testid="app-deal">
      {/* No masthead. The window's own title bar carries the app's name two lines above — the same
          reason `Start here` dropped `Pregonero kickoff` — and there is nowhere to go back to. */}
      <main className="songs-body app-deal-body">
        {DEAL_BLOCKS.map((block) => (
          <section
            className="app-deal-block"
            key={block.label}
            data-testid={`app-deal-${block.label.toLowerCase().replace(/ /g, '-')}`}
          >
            <span className="app-deal-label">{block.label}</span>
            <p className="app-deal-body-text">{block.body}</p>
          </section>
        ))}

        <div className="app-deal-foot">
          {/* **One control, and it is the skip too.** The folders are empty exactly once, so the
              screen is met once and dismissed with one press. A separate skip link would be
              redundant and would invite back the stored flag that was already rejected. */}
          <button
            type="button"
            className="ctrl-btn ctrl-setup-link"
            data-testid="app-deal-begin"
            onClick={onBegin}
          >
            Begin →
          </button>
        </div>
      </main>
    </div>
  )
}
