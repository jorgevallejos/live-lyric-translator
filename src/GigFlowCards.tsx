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
import { useEffect, useState } from 'react'
import { ShapeContact } from './ShapeContact'
import { ShapeIntro, type IntroParts } from './ShapeIntro'
import { UNIT_SIZE } from './vendor/warp.js'
import { getRememberedMessageHome, rememberMessageHome } from './messageHomePrefs'
import { getOrderedSongsForActiveSetlist, type LibrarySong } from './setlistStore'
import { chooseVisualInsideFolder } from './visualsPick'
import type { MessageHome } from './gigFile'

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
 * One card, drawn at wall proportions and scaled into the page.
 *
 * **The unit box is the whole of the preview's geometry.** Content is laid out in a `UNIT_SIZE`
 * square exactly as the compositor lays it out, and the square is scaled down — so what changes
 * between here and the wall is the quad, which is Muralista's and is not this screen's question.
 */
function CardPreview({
  width,
  testId,
  children,
}: {
  width: number
  testId: string
  children: React.ReactNode
}) {
  const scale = width / UNIT_SIZE
  return (
    <div
      className="gig-cards-preview"
      data-testid={testId}
      style={{ width: `${width}px`, height: `${width}px`, position: 'relative', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${UNIT_SIZE}px`,
          height: `${UNIT_SIZE}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  )
}

const PREVIEW_WIDTH = 320

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

      <div className="gig-cards-previews">
        <div className="gig-cards-preview-block">
          <span className="control-setup-label">Message home</span>
          <CardPreview width={PREVIEW_WIDTH} testId="gig-cards-message-preview">
            <ShapeContact
              fields={toMessageHome(fields)}
              boxWidth={UNIT_SIZE}
              testId="gig-cards-message-card"
            />
          </CardPreview>
          {/* **The preview earns its place twice**: it shows the card before the night, and with
              every field optional it is also how you see what leaving one blank does — a rule
              nobody has to read, on the screen where the question arises. */}
          <p className="gig-hint" data-testid="gig-cards-empty-note">
            {Object.keys(toMessageHome(fields)).length === 0
              ? 'Nothing here yet, so the wall stays dark after the last song.'
              : 'This is what the wall shows once the setlist has ended.'}
          </p>
        </div>

        <div className="gig-cards-preview-block">
          <span className="control-setup-label">Title card</span>
          {songs.length > 0 ? (
            <label className="setup-home-field">
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
          ) : (
            <p className="gig-hint" data-testid="gig-cards-no-songs">
              No songs in the running order yet, so there is no title card to look at.
            </p>
          )}
          {introParts && (
            <CardPreview width={PREVIEW_WIDTH} testId="gig-cards-intro-preview">
              <ShapeIntro parts={introParts} boxWidth={UNIT_SIZE} testId="gig-cards-intro-card" />
            </CardPreview>
          )}
          {/* **Nothing is filled in for this one.** All three parts come from the song file, and
              the tagline and the translated title exist only for a song that has been hand-edited
              — so a song straight out of Bombista shows a title and nothing else. */}
          <p className="gig-hint">
            Filled from the song file. A song that has not been hand-edited has a title and no
            tagline yet.
          </p>
        </div>
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
