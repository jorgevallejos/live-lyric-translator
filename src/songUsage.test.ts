/**
 * **Which gigs have a song in their setlist**, asked once, at the press of its bin.
 *
 * It never blocks the delete. A gig's setlist keeps its ids and reports what it cannot resolve, so
 * the record of the night stays truthful either way — and refusing would make the catalogue
 * hostage to its own history, where a song played once could never be tidied away.
 */
import { describe, it, expect } from 'vitest'
import { gigsUsingSong } from './songUsage'

function gig(over: Record<string, unknown> = {}) {
  return JSON.stringify({ gigVersion: 1, id: 'g', setlist: ['duelo'], ...over })
}

function reader(byPath: Record<string, string | null>) {
  return async (path: string) => ({ gigText: byPath[path] ?? null })
}

describe('the gigs a song is in', () => {
  it('names a gig by its venue when the file has one', async () => {
    const uses = await gigsUsingSong('duelo', {
      list: async () => ['/gigs/setup/k3f9x2abcd'],
      read: reader({ '/gigs/setup/k3f9x2abcd': gig({ venue: { name: 'Bar Eduard' } }) }),
    })
    expect(uses).toEqual([{ path: '/gigs/setup/k3f9x2abcd', name: 'Bar Eduard' }])
  })

  it('falls back to the folder, which is the only thing every gig has', async () => {
    const uses = await gigsUsingSong('duelo', {
      list: async () => ['/gigs/setup/k3f9x2abcd'],
      read: reader({ '/gigs/setup/k3f9x2abcd': gig() }),
    })
    expect(uses[0]!.name).toBe('k3f9x2abcd')
  })

  it('leaves out a gig whose setlist does not name the song', async () => {
    const uses = await gigsUsingSong('duelo', {
      list: async () => ['/gigs/a', '/gigs/b'],
      read: reader({ '/gigs/a': gig({ setlist: ['otro'] }), '/gigs/b': gig() }),
    })
    expect(uses.map((u) => u.path)).toEqual(['/gigs/b'])
  })

  it('does not claim a song is in a gig it could not read', async () => {
    // An unplugged drive is not evidence of anything. The wrong answer here would be to block the
    // delete; the second wrong answer would be to say the song is in a setlist nobody looked at.
    const uses = await gigsUsingSong('duelo', {
      list: async () => ['/gigs/gone', '/gigs/broken'],
      read: reader({ '/gigs/gone': null, '/gigs/broken': '{ not json' }),
    })
    expect(uses).toEqual([])
  })

  it('survives a reader that throws, rather than taking the dialog down with it', async () => {
    const uses = await gigsUsingSong('duelo', {
      list: async () => ['/gigs/a', '/gigs/b'],
      read: async (path: string) => {
        if (path === '/gigs/a') throw new Error('bridge is gone')
        return { gigText: gig() }
      },
    })
    expect(uses.map((u) => u.path)).toEqual(['/gigs/b'])
  })

  it('is empty when there are no gigs at all', async () => {
    expect(await gigsUsingSong('duelo', { list: async () => [], read: reader({}) })).toEqual([])
  })
})
