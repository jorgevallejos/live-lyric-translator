/**
 * **WHAT THE WALL SAYS WHEN NO SONG IS RUNNING — the gig flow's own step for it.**
 *
 * **Deciding the two cards are not shapes answered *where they appear* and took away *where you
 * set them up*** (Jorge, 2026-09-05). A shape had geometry and a position on the wall; borrowing an
 * existing shape leaves neither card a surface of its own at setup. **The answer is a step in the
 * gig flow**, and it does three things: collects the message home's content, carries the line
 * itself, and **shows the card as it will look on the wall — which is the reason the step exists at
 * all.**
 *
 * **The intro is previewed on the same step.** Nothing is filled in for it — all three of its parts
 * come from the song file — but it is seen before the night rather than at it. **Its preview needs
 * a song and the message home does not**, so this half carries a song selector and the other does
 * not.
 *
 * **Why one step and not two, and it is the same idea twice.** The intro is what the wall shows
 * before a song runs; the message home is what it shows after the setlist ends. **Both are the
 * not-running states of the three-state gig**, so one screen answers *what does the wall say when
 * no song is playing* and there is nothing else on it.
 *
 * ## The four fields, and every one of them is optional
 *
 * A **logo**, the **url**, the **Instagram handle**, and the **line**. **All artist-level** — asked
 * at the first gig, edited in Preferences after — so later gigs arrive prefilled. **The values are
 * written into `gig.json`** as well as remembered, because the player reads only the gig folder and
 * cannot reach the shell's Preferences.
 *
 * **`Message`, never `Tagline`.** *Tagline* already means the intro card's third part, and two
 * different things called tagline on two cards previewed on one screen is the vocabulary slippage
 * that cost five contract mismatches in two days.
 *
 * ## The preview is the same renderer, and that is not an implementation detail
 *
 * `ShapeContact` and `ShapeIntro` are the wall's own components, drawn here into a box instead of
 * into a quad. **A second implementation of either card would be a preview that can disagree with
 * the wall**, which is the failure the whole vocabulary exists to prevent. It is why those two
 * templates are shared between the shell and the player rather than being the player's.
 *
 * **The geometry is not previewed and is not this screen's** — where the card lands and how big it
 * is are Muralista's, decided at the wall on the visuals step. This shows what is in the card.
 */
import { useEffect, useRef, useState } from 'react'
import { type IntroParts } from './ShapeIntro'
import { getRememberedMessageHome, rememberMessageHome } from './messageHomePrefs'
import { getOrderedSongsForActiveSetlist, type LibrarySong } from './setlistStore'
import { chooseVisualInsideFolder } from './visualsPick'
import type { MessageHome } from './gigFile'
import {
  getContactBroadcast,
  setContactLitBroadcast,
  type CardPreview,
} from './cardBroadcast'

/**
 * **The line, carried by the step** (Jorge, 2026-09-05). Offered as a real value on a machine that
 * has never answered — not as a placeholder, because a placeholder is not on the wall and this is
 * meant to be. It is his to edit or to clear.
 */
export const DEFAULT_MESSAGE = "If one person here writes, that's the night."

/** The four fields as the screen holds them: strings, blank for absent. */
export type CardFields = { logo: string; url: string; handle: string; message: string }

/** What a first gig starts from: this machine's remembered answers, and the line. */
export function initialCardFields(): CardFields {
  const remembered = getRememberedMessageHome()
  const answeredBefore = Object.keys(remembered).length > 0
  return {
    logo: remembered.logo ?? '',
    url: remembered.url ?? '',
    handle: remembered.handle ?? '',
    message: remembered.message ?? (answeredBefore ? '' : DEFAULT_MESSAGE),
  }
}

/** The block as it goes into `gig.json`. Blank fields are absent, and all blank is no block. */
export function toMessageHome(fields: CardFields): MessageHome {
  const out: MessageHome = {}
  if (fields.logo.trim()) out.logo = fields.logo.trim()
  if (fields.url.trim()) out.url = fields.url.trim()
  if (fields.handle.trim()) out.handle = fields.handle.trim()
  if (fields.message.trim()) out.message = fields.message.trim()
  return out
}

/**
 * **THERE IS NO IN-PAGE PREVIEW ANY MORE** (Jorge, 2026-09-06), and `CardPreview`,
 * `useMeasuredWidth` and their nominal width went with it.
 *
 * They drew the card into a scaled `UNIT_SIZE` box on this screen. **The card is on the projector
 * while this step is open instead** — *the real thing at real size on the real wall is the
 * preview* — which is the same move that made Muralista's `2 OUTPUT` the photograph rather than a
 * simulation. **Two scaled-down simulations of a wall, on a screen, is what let the intro card's
 * translation line ship too small to read from the back of a room.**
 */

export function ScreenCards({
  fields,
  busy,
  onField,
  onForward,
}: {
  fields: CardFields
  busy: boolean
  onField: (field: keyof CardFields, value: string) => void
  onForward: () => void
}) {
  const [songs, setSongs] = useState<LibrarySong[]>([])
  const [songId, setSongId] = useState<string>('')
  const [outsideFolder, setOutsideFolder] = useState<string | null>(null)
  /** Which card is on the wall. **The picker is the whole of this screen's preview.** */
  const [showing, setShowing] = useState<'message-home' | 'intro'>('message-home')

  useEffect(() => {
    const ordered = getOrderedSongsForActiveSetlist()
    setSongs(ordered)
    setSongId((current) => (current === '' ? (ordered[0]?.id ?? '') : current))
  }, [])

  const song = songs.find((s) => s.id === songId)
  const introParts: IntroParts | null = song
    ? {
        title: song.title,
        annotation: undefined,
        tagline: undefined,
      }
    : null

  /**
   * **THE CARD GOES ON THE PROJECTOR WHILE THIS STEP IS OPEN** (Jorge, 2026-09-06).
   *
   * **The real thing at real size on the real wall is the preview** — the same move that made
   * Muralista's `2 OUTPUT` the photograph rather than a simulation. **The argument is evidence,
   * not taste:** the intro card's translation line turned out to be too small to read at wall
   * distance, and that would have been caught here rather than at moment 6 if the card had been on
   * the wall.
   *
   * **It does not contradict `v0.91.0`**, which took this window OFF the projector during the
   * visuals step. There the card was an intruder over Muralista's output; **here it is the
   * subject.**
   *
   * **The projector is handed back on leaving**: the preview is cleared, so whatever the gig's
   * state says takes the wall again, and the window closes because this step is what opened it.
   */
  useEffect(() => {
    window.electronAPI?.openProjection?.()
    return () => {
      setContactLitBroadcast(getContactBroadcast().lit, toMessageHome(fieldsRef.current), null)
      window.electronAPI?.closeProjection?.()
    }
  }, [])

  // The fields are read in the cleanup above, which must not re-run when they change.
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const previewJson = JSON.stringify(
    showing === 'intro' && introParts ? { kind: 'intro', parts: introParts } : { kind: 'message-home' }
  )
  const messageHomeJson = JSON.stringify(toMessageHome(fields))
  useEffect(() => {
    // **The card and its content cross together**, on the channel that already carries both — see
    // `cardBroadcast.CardPreview`. The fields are this screen's live edits, not the gig file's:
    // what he is looking at on the wall is what he is typing.
    setContactLitBroadcast(
      true,
      JSON.parse(messageHomeJson) as MessageHome,
      JSON.parse(previewJson) as CardPreview
    )
  }, [previewJson, messageHomeJson])

  /**
   * **The logo picker inherits the guard of the same day** (Jorge, 2026-09-05): a file chosen
   * outside the visuals folder is refused in a popup and **the field is left empty**, exactly as
   * for a shape's image. One rule, both places — and the same function, so it cannot drift.
   */
  const pickLogo = async () => {
    const pick = await chooseVisualInsideFolder('image')
    if (pick.outcome === 'picked') onField('logo', pick.name)
    else if (pick.outcome === 'refused') setOutsideFolder(pick.folder)
    else if (pick.outcome === 'no-folder') setOutsideFolder('')
  }

  return (
    <section className="gig-flow-page" data-testid="gig-flow-screen-cards">
      <p className="gig-flow-lede">
        The wall is not always showing a song. Before the first one and after the last, it shows
        these two cards — the song&rsquo;s own title card, and the one that says how to reach you.
        Everything here is optional; leave a field blank and the card simply does without it.
      </p>

      <div className="gig-flow-fields">
        <div className="setup-home-field">
          <span>Logo</span>
          <div className="control-setup-button-row">
            <button
              type="button"
              className="ctrl-btn"
              data-testid="gig-cards-logo-pick"
              disabled={busy}
              onClick={() => void pickLogo()}
            >
              {fields.logo ? 'Change…' : 'Choose…'}
            </button>
            {fields.logo !== '' && (
              <button
                type="button"
                className="ctrl-btn"
                data-testid="gig-cards-logo-clear"
                disabled={busy}
                onClick={() => onField('logo', '')}
              >
                Clear
              </button>
            )}
          </div>
          <span className="folders-source-path" data-testid="gig-cards-logo-name">
            {fields.logo === '' ? 'No logo' : fields.logo}
          </span>
        </div>
        <label className="setup-home-field">
          <span>Address</span>
          <input
            type="text"
            value={fields.url}
            data-testid="gig-cards-url"
            disabled={busy}
            onChange={(e) => onField('url', e.target.value)}
          />
        </label>
        <label className="setup-home-field">
          <span>Instagram</span>
          <input
            type="text"
            value={fields.handle}
            data-testid="gig-cards-handle"
            disabled={busy}
            onChange={(e) => onField('handle', e.target.value)}
          />
        </label>
        {/* **Not `Tagline`.** That word is the intro card's third part, and it is on this screen. */}
        <label className="setup-home-field">
          <span>Message</span>
          <input
            type="text"
            value={fields.message}
            data-testid="gig-cards-message"
            disabled={busy}
            onChange={(e) => onField('message', e.target.value)}
          />
        </label>
      </div>

      {/* **THE TWO LARGE PREVIEWS BECAME A PICKER** (Jorge, 2026-09-06). The card is on the
          projector while this step is open — *the real thing at real size on the real wall is the
          preview* — so what is left here is the choice of which one, and the fields above that
          fill it. Two scaled-down simulations of a wall, on a screen, is what let the intro card's
          translation line ship too small to read from the back of a room. */}
      <div className="gig-cards-showing">
        <span className="control-setup-label">On the wall</span>
        <div className="ctrl-icon-choices gig-cards-showing-choices" role="group" aria-label="On the wall">
          <button
            type="button"
            className={`ctrl-btn${showing === 'message-home' ? ' ctrl-arm' : ''}`}
            aria-pressed={showing === 'message-home'}
            data-testid="gig-cards-show-message"
            disabled={busy}
            onClick={() => setShowing('message-home')}
          >
            Message home
          </button>
          <button
            type="button"
            className={`ctrl-btn${showing === 'intro' ? ' ctrl-arm' : ''}`}
            aria-pressed={showing === 'intro'}
            data-testid="gig-cards-show-intro"
            disabled={busy || songs.length === 0}
            onClick={() => setShowing('intro')}
          >
            Title card
          </button>
        </div>

        {showing === 'intro' && songs.length > 0 && (
          /* **Narrow, because it holds one song title** (Jorge, 2026-09-06). It was the full
             width of the step, which is a field sized by its container rather than by what goes
             in it. */
          <label className="setup-home-field gig-cards-song-field">
            <span>Song</span>
            <select
              value={songId}
              data-testid="gig-cards-song"
              disabled={busy}
              onChange={(e) => setSongId(e.target.value)}
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {songs.length === 0 && (
          <p className="gig-hint" data-testid="gig-cards-no-songs">
            No songs in the running order yet, so there is no title card to look at.
          </p>
        )}

        {/* **The one sentence that says a fact about right now**, which is the rule for what stays
            on a screen after the prose came off. The empty case is the one that needs saying: with
            every field optional, nothing here means a dark wall after the last song. */}
        <p className="gig-hint" data-testid="gig-cards-empty-note">
          {showing === 'message-home'
            ? Object.keys(toMessageHome(fields)).length === 0
              ? 'Nothing here yet, so the wall stays dark after the last song.'
              : 'On the wall now. This is what it shows once the setlist has ended.'
            : 'On the wall now. Filled from the song file — a song that has not been hand-edited has a title and no tagline yet.'}
        </p>
      </div>

      <div className="gig-actions gig-flow-footer">
        <button
          type="button"
          className="ctrl-btn ctrl-arm"
          data-testid="gig-cards-forward"
          disabled={busy}
          onClick={onForward}
        >
          To the sign-off →
        </button>
      </div>

      {outsideFolder !== null && (
        <div className="ctrl-timeline-save-overlay" data-testid="gig-cards-outside-popup">
          <div
            className="ctrl-timeline-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="That file is outside the visuals folder"
          >
            <p className="ctrl-timeline-save-message">
              {outsideFolder === ''
                ? 'There is no visuals folder yet'
                : 'That file is outside the visuals folder'}
            </p>
            {outsideFolder !== '' && (
              <p className="folders-source-path">{outsideFolder}</p>
            )}
            <p className="ctrl-timeline-save-message">
              {outsideFolder === ''
                ? 'Set it in Preferences, then pick the file again. A card can only hold a file that lives inside it.'
                : 'A card can only hold a file that lives inside it. Move the file in there and pick it again — nothing has been changed.'}
            </p>
            <div className="ctrl-timeline-save-actions">
              <button type="button" className="ctrl-btn" onClick={() => setOutsideFolder(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export { rememberMessageHome }
