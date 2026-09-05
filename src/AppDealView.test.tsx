/**
 * **The app's deal is the first thing on screen, and then it is never seen again.**
 *
 * The requirement is positional as much as behavioural — reset, launch, and the deal is what is
 * there — so these tests render `App`, not the view, and assert what is and is not on screen. The
 * folders screen's own tests do the same, for the same reason.
 *
 * **The copy is asserted word for word.** Every clause was argued on 2026-09-04; a later reader who
 * wants to improve a sentence has to change the ruling first.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureStorage } from './testSupport/storage'
import { standbyState } from './testSupport/standbyState'
import {
  ARTIST_NAME_KEY,
  GIGS_FOLDER_KEY,
  SONGS_FOLDER_KEY,
  VISUALS_FOLDER_KEY,
} from './contentFolders'
import { DEAL_BLOCKS } from './AppDealView'

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasFolderPicker: () => true,
  chooseFolderPath: vi.fn(),
}))

const { default: App } = await import('./App')

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // **The artist's name is screen two of three since 2026-09-05**, and this file is about the
  // deal, which is screen one. Answering the name here puts the screen after the deal back to the
  // folders, which is the boundary every assertion below is drawn against.
  localStorage.setItem(ARTIST_NAME_KEY, 'Chango Pepper')
  vi.clearAllMocks()
  window.location.hash = '#/'
})

async function launch() {
  await act(async () => {
    render(<App initialHash="#/" />)
  })
}

/** Every key this machine currently holds. `Object.keys` sees the stand-in's own methods. */
const keys = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(
    (key): key is string => key !== null
  )

const css = () => readFileSync(resolve(__dirname, 'control.css'), 'utf8')
const rule = (selector: string, sheet: string) => {
  const found = sheet.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  )
  if (!found) throw new Error(`rule not found: ${selector}`)
  return found[1]
}

describe('the app’s deal', () => {
  it('is the first thing on screen on a machine that has answered nothing', async () => {
    await launch()
    expect(screen.getByTestId('app-deal')).toBeTruthy()
    // Before the folders, before the hydration screen, before the control view.
    expect(screen.queryByTestId('first-run')).toBeNull()
    expect(screen.queryByTestId('song-library-loading')).toBeNull()
    expect(standbyState()).toBeNull()
  })

  it('carries three blocks and no more', async () => {
    await launch()
    expect(DEAL_BLOCKS).toHaveLength(3)
    expect(screen.getByTestId('app-deal').querySelectorAll('.app-deal-block')).toHaveLength(3)
    // Every paragraph on the screen is one of the three: the deal has no other prose at all.
    expect(screen.getByTestId('app-deal').querySelectorAll('p')).toHaveLength(3)
  })

  it('says what you get, in the words that were argued', async () => {
    await launch()
    expect(screen.getByTestId('app-deal-what-you-get').textContent).toBe(
      'What you get' +
        'Your lyrics and visuals on the wall, in the language of the room, changing with the music ' +
        'while you play. An audience that doesn’t speak your language follows the song instead of ' +
        'waiting for it to end.'
    )
  })

  it('says what it costs, naming each folder’s purpose', async () => {
    // *Three folders* alone is a demand; naming them is an answer. And *where your gigs WILL live*
    // carries in one word that this one may not exist yet, where songs and visuals do.
    await launch()
    expect(screen.getByTestId('app-deal-what-it-costs').textContent).toBe(
      'What it costs' +
        'Three folders, answered once: where your songs are, where your visuals are, and where ' +
        'your gigs will live. Then a sitting per song to time the lyrics, and a sitting per room ' +
        'to decide where they land.'
    )
  })

  it('says what it does not do, as a promise rather than a rule', async () => {
    await launch()
    expect(screen.getByTestId('app-deal-what-it-does-not-do').textContent).toBe(
      'What it does not do' +
        'Nothing you already have is moved, renamed or changed. It reads your folders, and keeps ' +
        'what it makes in two folders of its own.'
    )
  })

  it('leaves translations and the wall out, because they are other tools’ deals', async () => {
    // Translations are Bombista's deal and would be the said-twice drift caught on 03/09; walls
    // and projectors are Muralista's, and front-loading them costs the person a worry met later.
    await launch()
    const text = screen.getByTestId('app-deal').textContent!.toLowerCase()
    expect(text).not.toContain('translat')
    expect(text).not.toContain('projector')
    expect(text).not.toContain('tramoya')
  })

  it('carries one control, reading Begin, and nothing else', async () => {
    await launch()
    const buttons = screen.getByTestId('app-deal').querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toBe('Begin →')
  })

  it('has no step bar, because this is two screens and not a flow', async () => {
    await launch()
    expect(screen.queryByTestId('gig-flow-steps')).toBeNull()
    expect(screen.getByTestId('app-deal').querySelector('nav')).toBeNull()
    // And no masthead either: the window's own title bar carries the app's name.
    expect(screen.getByTestId('app-deal').querySelector('header')).toBeNull()
  })

  it('is dismissed with one press, landing on the folders', async () => {
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('app-deal-begin'))
    })
    expect(screen.queryByTestId('app-deal')).toBeNull()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  it('remembers nothing when it is dismissed', async () => {
    // **The whole rule: read from the world, never from a stored flag.** A remembered "do not show
    // again" was rejected in this suite already — it is remembered state in a project whose test
    // discipline is starting from nothing, so after one walk nobody sees the screen again.
    await launch()
    const before = keys()
    await act(async () => {
      fireEvent.click(screen.getByTestId('app-deal-begin'))
    })
    // Nothing is written by the press, and in particular nothing about the deal: the keys are the
    // ones the app had already put there for its own reasons, and no folder has been answered.
    expect(keys()).toEqual(before)
    expect(keys().some((key) => /deal/i.test(key))).toBe(false)
    expect(localStorage.getItem(SONGS_FOLDER_KEY)).toBeNull()
    expect(localStorage.getItem(VISUALS_FOLDER_KEY)).toBeNull()
    expect(localStorage.getItem(GIGS_FOLDER_KEY)).toBeNull()
  })

  it('is offered again on a launch that answered nothing', async () => {
    // Pressing `Begin →` is a transition, not a dismissal: quitting on the folders screen without
    // answering anything means the offer was never taken.
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('app-deal-begin'))
    })
    cleanup()
    await launch()
    expect(screen.getByTestId('app-deal')).toBeTruthy()
  })

  it.each([
    ['songs', SONGS_FOLDER_KEY],
    ['visuals', VISUALS_FOLDER_KEY],
    ['gigs', GIGS_FOLDER_KEY],
  ])('is not shown once the %s folder has been answered', async (_name, key) => {
    localStorage.setItem(key, '/vault/anything')
    await launch()
    expect(screen.queryByTestId('app-deal')).toBeNull()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  it('is gone for good once all three are answered', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.queryByTestId('app-deal')).toBeNull()
    expect(screen.queryByTestId('first-run')).toBeNull()
  })

  it('never blocks the projection window, which has nothing to be offered', async () => {
    await act(async () => {
      render(<App initialHash="#/projection" />)
    })
    expect(screen.queryByTestId('app-deal')).toBeNull()
  })

  // ── The body text is the loudest thing on the screen ──────────────────────────────────────
  //
  // The inversion of every other screen in this app, where a caps label heads a block and the
  // prose under it is a note in the muted register. Here the prose IS the content. Colour and size
  // are invisible to a render assertion in jsdom, so the stylesheet is read — the device the
  // first-run colour rounds already use.

  it('sets the body louder than its own label, and in the brightest paper', () => {
    const sheet = css()
    const size = (block: string) => Number(block.match(/font-size:\s*([\d.]+)em/)![1])
    const body = rule('.app-deal-body-text', sheet)
    expect(size(body)).toBeGreaterThan(size(rule('.app-deal-label', sheet)))
    expect(body).toMatch(/color:\s*var\(--text-primary\)/)
    expect(rule('.app-deal-label', sheet)).toMatch(/color:\s*var\(--text-dim\)/)
  })

  it('puts no state colour on Begin, because nothing here is answered', () => {
    // Green on this app means *you are ready*. The deal is the offer, not readiness.
    const sheet = css()
    const block = sheet.slice(
      sheet.indexOf("/* ---- The app's deal"),
      sheet.indexOf('/* ---- First run:')
    )
    expect(block.length).toBeGreaterThan(0)
    const declared = block.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declared).not.toMatch(/--state-ok/)
    expect(declared).not.toMatch(/--state-warn/)
    // And no new colour enters the palette for this screen, the rule first run already holds.
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
