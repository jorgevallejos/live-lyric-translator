import { useState } from 'react'
import {
  buildDebriefMarkdown,
  clockTime,
  duration,
  endedAtOf,
  startedAtOf,
  ROOM_FULLNESS,
  type DebriefAnswers,
  type DebriefFacts,
  type RoomFullness,
} from './debrief'

/**
 * The debrief, in the control window and **never on the projection**.
 *
 * **Not modal, and that is a requirement rather than a preference.** A repeat happens *after* the
 * setlist ends, so a blocking debrief would land exactly on the moment Jorge needs the app to
 * honour a request. It sits inline, it can be dismissed, and it can be reopened.
 *
 * **Everything factual is above the fold and none of it is typed.** He is asked four things and
 * only four: the room, the best song, the worst song, and the one sentence about this room. Four
 * taps and a line, fillable while packing up. **There is no fifth field** — every one of these
 * earns its place by existing nowhere else, and a field a future self would have to be disciplined
 * to fill is a field that stays empty.
 */

type Props = {
  facts: DebriefFacts
  answers: DebriefAnswers
  onAnswers: (next: DebriefAnswers) => void
  onDismiss: () => void
  onSave: (markdown: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

export function DebriefPanel({ facts, answers, onAnswers, onDismiss, onSave }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const performed = facts.performed
  const venue = [facts.venueName, facts.venueCity].filter(Boolean).join(', ')

  const save = async () => {
    setSaving(true)
    setError(null)
    const result = await onSave(buildDebriefMarkdown(facts, answers))
    setSaving(false)
    if (result.ok) setSaved(new Date().toISOString())
    else setError(result.error)
  }

  /** One tap from the setlist as performed. The list is already there, so it costs one tap. */
  const songChoices = performed.filter(
    (p, i) => performed.findIndex((q) => q.songId === p.songId) === i
  )

  return (
    <section className="debrief-panel" data-testid="debrief-panel" aria-label="Debrief">
      <header className="debrief-head">
        <h2 className="debrief-title">Debrief</h2>
        <button
          type="button"
          className="ctrl-btn debrief-dismiss"
          data-testid="debrief-dismiss"
          onClick={onDismiss}
        >
          Later
        </button>
      </header>

      <p className="debrief-facts" data-testid="debrief-facts">
        {venue || 'Unnamed venue'} · {facts.date ?? 'undated'} ·{' '}
        {clockTime(startedAtOf(performed))}–{clockTime(endedAtOf(performed))} ·{' '}
        {duration(facts.elapsedSeconds)}
      </p>

      <ol className="debrief-played" data-testid="debrief-played">
        {performed.length === 0 && <li className="debrief-empty">Nothing played yet.</li>}
        {performed.map((p, i) => (
          <li key={`${p.songId}-${i}`}>
            {p.title}
            <span className="debrief-times">
              {' '}
              {clockTime(p.startedAt)}–{clockTime(p.endedAt)}
            </span>
            {performed.findIndex((q) => q.songId === p.songId) !== i && (
              <span className="debrief-repeat"> repeat</span>
            )}
          </li>
        ))}
      </ol>

      {facts.skipped.length > 0 && (
        <p className="debrief-skipped" data-testid="debrief-skipped">
          Not played: {facts.skipped.map((s) => s.title).join(', ')}
        </p>
      )}

      {facts.problems.length > 0 && (
        <ul className="debrief-problems" data-testid="debrief-problems">
          {facts.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="debrief-question">
        <span className="debrief-label">How full was the room?</span>
        <div className="debrief-choices">
          {ROOM_FULLNESS.map((value: RoomFullness) => (
            <button
              key={value}
              type="button"
              className={`ctrl-btn debrief-choice${answers.fullness === value ? ' is-chosen' : ''}`}
              aria-pressed={answers.fullness === value}
              onClick={() => onAnswers({ ...answers, fullness: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="debrief-question">
        <span className="debrief-label">Best song tonight</span>
        <div className="debrief-choices">
          {songChoices.map((p) => (
            <button
              key={p.songId}
              type="button"
              className={`ctrl-btn debrief-choice${answers.bestSongId === p.songId ? ' is-chosen' : ''}`}
              aria-pressed={answers.bestSongId === p.songId}
              onClick={() => onAnswers({ ...answers, bestSongId: p.songId })}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="debrief-question">
        <span className="debrief-label">Worst song tonight</span>
        <div className="debrief-choices">
          {songChoices.map((p) => (
            <button
              key={p.songId}
              type="button"
              className={`ctrl-btn debrief-choice${answers.worstSongId === p.songId ? ' is-chosen' : ''}`}
              aria-pressed={answers.worstSongId === p.songId}
              onClick={() => onAnswers({ ...answers, worstSongId: p.songId })}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="debrief-question">
        <label className="debrief-label" htmlFor="debrief-change">
          What to change in this room next time
        </label>
        <input
          id="debrief-change"
          className="debrief-input"
          type="text"
          value={answers.changeNextTime}
          onChange={(e) => onAnswers({ ...answers, changeNextTime: e.target.value })}
        />
      </div>

      <div className="debrief-actions">
        <button
          type="button"
          className="ctrl-btn debrief-save"
          data-testid="debrief-save"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save debrief'}
        </button>
        {saved && !error && (
          <span className="debrief-saved" data-testid="debrief-saved">
            Saved to debrief.md
          </span>
        )}
        {error && (
          <span className="debrief-error" data-testid="debrief-error">
            {error}
          </span>
        )}
      </div>
    </section>
  )
}
