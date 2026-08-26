/**
 * The debrief: what actually happened, and what he thought of it.
 *
 * **Everything factual is prefilled; he is asked only what only he knows.** That is the whole
 * design, and it is why the played log became an ordered, timestamped list in round D — a
 * deduplicated set of ids could say neither the order nor the times, and a repeat was invisible
 * in it.
 *
 * **Four taps and one line, and there is no fifth field.** Every one of the four earns its place
 * by being something that exists nowhere else; a field a future self would have to be disciplined
 * to fill is a field that stays empty. Adding one is the way this stops being fillable while
 * packing up.
 *
 * This module is pure. Where the file is written is `platform.ts`, and when it is offered is the
 * control window's business — **never the projection's**.
 */

import type { PlayedSongEntry } from './playedSongsState'

export const DEBRIEF_FILE_NAME = 'debrief.md'

export const ROOM_FULLNESS = ['empty', 'thin', 'decent', 'full'] as const
export type RoomFullness = (typeof ROOM_FULLNESS)[number]

/** The four, and only the four. */
export type DebriefAnswers = {
  fullness: RoomFullness | null
  bestSongId: string | null
  worstSongId: string | null
  changeNextTime: string
}

export const EMPTY_ANSWERS: DebriefAnswers = {
  fullness: null,
  bestSongId: null,
  worstSongId: null,
  changeNextTime: '',
}

/** One performance, as it goes on the page: the played entry plus the title to call it by. */
export type PerformedSong = {
  songId: string
  title: string
  startedAt: string | null
  endedAt: string | null
}

export type DebriefFacts = {
  /** `YYYY-MM-DD`, from `gig.json`. */
  date: string | null
  venueName: string | null
  venueCity: string | null
  /** The setlist as performed, in order, duplicates preserved. */
  performed: PerformedSong[]
  /** Authored setlist songs that were never played. Named, because a skip is a fact about a night. */
  skipped: { songId: string; title: string }[]
  /** What the app noticed going wrong — readiness refusals, songs it could not carry, unread files. */
  problems: string[]
  /** The concert timer's own number, which excludes the time it was paused. */
  elapsedSeconds: number | null
}

/** `2026-09-12T21:03:00.000Z` → `21:03`, in the machine's own timezone, or `—`. */
export function clockTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** `4520` → `1h 15m`. Whole minutes: nobody debriefs to the second. */
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds / 60)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** The night's start: the first moment a song was known to be loaded. */
export function startedAtOf(performed: readonly PerformedSong[]): string | null {
  for (const p of performed) {
    if (p.startedAt) return p.startedAt
  }
  return performed[0]?.endedAt ?? null
}

/** The night's end: the last moment a song was known to have finished. */
export function endedAtOf(performed: readonly PerformedSong[]): string | null {
  for (let i = performed.length - 1; i >= 0; i--) {
    const at = performed[i]!.endedAt
    if (at) return at
  }
  return null
}

/** The performances, in order, with the titles to call them by. Repeats appear once per playing. */
export function performedFrom(
  played: readonly PlayedSongEntry[],
  titleOf: (songId: string) => string
): PerformedSong[] {
  return played.map((entry) => ({
    songId: entry.songId,
    title: titleOf(entry.songId),
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
  }))
}

function answerLine(label: string, value: string | null): string {
  return `- **${label}:** ${value && value.trim() !== '' ? value : '—'}`
}

/**
 * The file. Markdown, because `concerts/<gig>/debrief.md` is an existing convention and the person
 * who reads this next is a person.
 *
 * Unanswered questions are written as `—` rather than left out: a debrief that silently omits the
 * question it did not ask cannot be told apart later from one that was answered blank.
 */
export function buildDebriefMarkdown(facts: DebriefFacts, answers: DebriefAnswers): string {
  const venue = [facts.venueName, facts.venueCity].filter(Boolean).join(', ')
  const titleOf = (songId: string | null) =>
    songId === null ? null : (facts.performed.find((p) => p.songId === songId)?.title ?? songId)

  const lines: string[] = []
  lines.push(`# Debrief — ${venue || 'unnamed venue'}, ${facts.date ?? 'undated'}`)
  lines.push('')
  lines.push(`- **Date:** ${facts.date ?? '—'}`)
  lines.push(`- **Venue:** ${venue || '—'}`)
  lines.push(`- **Started:** ${clockTime(startedAtOf(facts.performed))}`)
  lines.push(`- **Ended:** ${clockTime(endedAtOf(facts.performed))}`)
  lines.push(`- **Total:** ${duration(facts.elapsedSeconds)}`)
  lines.push('')

  lines.push('## Played')
  lines.push('')
  if (facts.performed.length === 0) {
    lines.push('Nothing was played.')
  } else {
    facts.performed.forEach((p, i) => {
      const repeat = facts.performed.findIndex((q) => q.songId === p.songId) !== i
      lines.push(
        `${i + 1}. ${p.title} — ${clockTime(p.startedAt)}–${clockTime(p.endedAt)}${repeat ? ' _(repeat)_' : ''}`
      )
    })
  }
  lines.push('')

  if (facts.skipped.length > 0) {
    lines.push('## Not played')
    lines.push('')
    for (const s of facts.skipped) lines.push(`- ${s.title}`)
    lines.push('')
  }

  if (facts.problems.length > 0) {
    lines.push('## What the app noticed')
    lines.push('')
    for (const problem of facts.problems) lines.push(`- ${problem}`)
    lines.push('')
  }

  lines.push('## How it went')
  lines.push('')
  lines.push(answerLine('Room', answers.fullness))
  lines.push(answerLine('Best song', titleOf(answers.bestSongId)))
  lines.push(answerLine('Worst song', titleOf(answers.worstSongId)))
  lines.push(answerLine('Change in this room next time', answers.changeNextTime))
  lines.push('')

  return lines.join('\n')
}
