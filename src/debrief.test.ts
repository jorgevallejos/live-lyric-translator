/**
 * The debrief file. **Everything factual is prefilled; he is asked only what only he knows** —
 * which is why most of this file is about the facts and only a little of it about the four
 * questions.
 */
import { describe, it, expect } from 'vitest'
import {
  buildDebriefMarkdown,
  clockTime,
  duration,
  endedAtOf,
  performedFrom,
  startedAtOf,
  EMPTY_ANSWERS,
  ROOM_FULLNESS,
  type DebriefFacts,
} from './debrief'
import type { PlayedSongEntry } from './playedSongsState'

function at(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(2026, 8, 12, h!, m!, 0)
  return d.toISOString()
}

const FACTS: DebriefFacts = {
  date: '2026-09-12',
  venueName: 'Bar Eduard',
  venueCity: 'Ghent',
  performed: [
    { songId: 'libertad', title: 'Libertad', startedAt: at('21:00'), endedAt: at('21:05') },
    { songId: 'vidas', title: 'Vidas', startedAt: at('21:06'), endedAt: at('21:11') },
    { songId: 'libertad', title: 'Libertad', startedAt: at('21:20'), endedAt: at('21:25') },
  ],
  skipped: [{ songId: 'duelo', title: 'Duelo' }],
  problems: ['Duelo: has a video shape but no timeline to bind subtitles to'],
  elapsedSeconds: 75 * 60,
}

describe('clockTime and duration', () => {
  it('prints a wall-clock time', () => {
    expect(clockTime(at('21:03'))).toBe('21:03')
  })

  it('admits an unknown time rather than inventing one', () => {
    expect(clockTime(null)).toBe('—')
    expect(clockTime('not a date')).toBe('—')
  })

  it('prints hours and minutes, because nobody debriefs to the second', () => {
    expect(duration(75 * 60)).toBe('1h 15m')
    expect(duration(20 * 60)).toBe('20m')
    expect(duration(null)).toBe('—')
  })
})

describe('the night’s edges', () => {
  it('starts at the first moment a song was known to be loaded', () => {
    expect(startedAtOf(FACTS.performed)).toBe(at('21:00'))
  })

  it('ends at the last moment a song was known to have finished', () => {
    expect(endedAtOf(FACTS.performed)).toBe(at('21:25'))
  })

  it('falls back to the first end time when no start time was ever known', () => {
    expect(
      startedAtOf([{ songId: 'a', title: 'A', startedAt: null, endedAt: at('20:00') }])
    ).toBe(at('20:00'))
  })
})

describe('performedFrom', () => {
  it('keeps the order and every repeat, because that is what happened', () => {
    const played: PlayedSongEntry[] = [
      { songId: 'a', startedAt: null, endedAt: at('21:00') },
      { songId: 'b', startedAt: null, endedAt: at('21:10') },
      { songId: 'a', startedAt: null, endedAt: at('21:20') },
    ]
    expect(performedFrom(played, (id) => id.toUpperCase()).map((p) => p.title)).toEqual([
      'A',
      'B',
      'A',
    ])
  })
})

describe('buildDebriefMarkdown', () => {
  const md = buildDebriefMarkdown(FACTS, {
    fullness: 'decent',
    bestSongId: 'vidas',
    worstSongId: 'libertad',
    changeNextTime: 'Move the projector two metres back.',
  })

  it('names the night in its heading', () => {
    expect(md.split('\n')[0]).toBe('# Debrief — Bar Eduard, Ghent, 2026-09-12')
  })

  it('prefills date, venue, start, end and total', () => {
    expect(md).toContain('- **Started:** 21:00')
    expect(md).toContain('- **Ended:** 21:25')
    expect(md).toContain('- **Total:** 1h 15m')
  })

  it('lists the setlist as performed, in order, with times', () => {
    expect(md).toContain('1. Libertad — 21:00–21:05')
    expect(md).toContain('2. Vidas — 21:06–21:11')
  })

  it('marks a repeat as one, which a deduplicated set could never say', () => {
    expect(md).toContain('3. Libertad — 21:20–21:25 _(repeat)_')
    // And the first playing is not marked.
    expect(md).not.toContain('1. Libertad — 21:00–21:05 _(repeat)_')
  })

  it('names what was not played', () => {
    expect(md).toContain('## Not played')
    expect(md).toContain('- Duelo')
  })

  it('records what the app noticed going wrong', () => {
    expect(md).toContain('## What the app noticed')
    expect(md).toContain('- Duelo: has a video shape but no timeline to bind subtitles to')
  })

  it('writes the four answers by name, and no fifth', () => {
    expect(md).toContain('- **Room:** decent')
    expect(md).toContain('- **Best song:** Vidas')
    expect(md).toContain('- **Worst song:** Libertad')
    expect(md).toContain('- **Change in this room next time:** Move the projector two metres back.')
    const answered = md.slice(md.indexOf('## How it went'))
    expect(answered.split('\n').filter((l) => l.startsWith('- **'))).toHaveLength(4)
  })

  it('writes an unanswered question as unanswered rather than leaving it out', () => {
    // A debrief that silently omits the question it did not ask cannot be told apart later from
    // one that was answered blank.
    const blank = buildDebriefMarkdown(FACTS, EMPTY_ANSWERS)
    expect(blank).toContain('- **Room:** —')
    expect(blank).toContain('- **Best song:** —')
  })

  it('offers exactly four answers for the room and no more', () => {
    expect([...ROOM_FULLNESS]).toEqual(['empty', 'thin', 'decent', 'full'])
  })

  it('says so plainly when nothing was played', () => {
    const nothing = buildDebriefMarkdown(
      { ...FACTS, performed: [], elapsedSeconds: null },
      EMPTY_ANSWERS
    )
    expect(nothing).toContain('Nothing was played.')
    expect(nothing).toContain('- **Total:** —')
  })
})
