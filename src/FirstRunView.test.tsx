/**
 * **First run replaces the main screen on launch.**
 *
 * The requirement is positional as much as behavioural: reset, launch, and the first thing on
 * screen is the folder request. If the hydration screen or the control view appears first, it is
 * not done — so these tests render `App`, not the view, and assert what is and is not there.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureStorage } from './testSupport/storage'
import { GIGS_FOLDER_KEY, SONGS_FOLDER_KEY } from './contentFolders'

const chooseFolderPath = vi.fn()

vi.mock('./platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasFolderPicker: () => true,
  chooseFolderPath: (...a: unknown[]) => chooseFolderPath(...a),
}))

const { default: App } = await import('./App')

beforeAll(ensureStorage)
afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  window.location.hash = '#/'
})

async function launch() {
  await act(async () => {
    render(<App initialHash="#/" />)
  })
}

describe('first run', () => {
  it('is the first thing on screen when neither folder is set', async () => {
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
    // Not behind the hydration screen, and not behind the control view.
    expect(screen.queryByTestId('song-library-loading')).toBeNull()
    expect(screen.queryByTestId('performance-state-label')).toBeNull()
  })

  it('still asks when only the songs folder is set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/vault/songs')
  })

  it('still asks when only the gigs folder is set', async () => {
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  it('never asks again once both are set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.queryByTestId('first-run')).toBeNull()
  })

  // ── It waits to be dismissed (reversing #83) ───────────────────────────────────────────────
  //
  // Answering the second file dialog is not being finished, and the walk that found this was
  // thrown to the control view mid-thought. What the confirming click decides is *when the person
  // is done*, which is not nothing.

  it('stays put when the second folder is chosen, with both answers on screen', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(localStorage.getItem(GIGS_FOLDER_KEY)).toBe('/vault/gigs')
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/vault/songs')
    expect(screen.getByTestId('first-run-gigs-value').textContent).toBe('/vault/gigs')
  })

  it('leaves when the person says so, and not before', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-confirm'))
    })
    await waitFor(() => expect(screen.queryByTestId('first-run')).toBeNull())
  })

  it('holds the exit disabled, naming the question still unanswered', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run-confirm').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('first-run-confirm-reason').textContent).toContain('Both questions')

    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run-confirm').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('first-run-confirm-reason').textContent).toContain(
      'Where your gigs live'
    )
  })

  it('lets the first answer be re-checked after the second has landed', async () => {
    // The whole point of waiting: having seen where the gigs go, you may want the catalogue to be
    // a different folder. Being ejected on the second answer is what made that impossible.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    chooseFolderPath.mockResolvedValue('/elsewhere/songs')
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/elsewhere/songs')
    expect(localStorage.getItem(SONGS_FOLDER_KEY)).toBe('/elsewhere/songs')
  })

  it('stays while only one has been chosen', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-songs-value').textContent).toBe('/vault/songs')
  })

  it('remembers a cancelled picker as no choice at all', async () => {
    chooseFolderPath.mockResolvedValue(null)
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(localStorage.getItem(SONGS_FOLDER_KEY)).toBeNull()
  })

  // ── Two questions, not one asked twice ────────────────────────────────────────────────────

  it('asks two different questions, named by what they find', async () => {
    // Both were phrased "choose a folder", which is exactly why the second read as redundant. One
    // finds a catalogue; the other finds a body of work.
    await launch()
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Where your songs live')
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Your catalogue')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Where your gigs live')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Your body of work')
  })

  // ── Exactly two paragraphs, and no other prose ────────────────────────────────────────────
  //
  // The lede and the folder-shape example were removed on 2026-09-02: the shape read as
  // prescriptive and the prose explained the app to someone who had not used it yet. What is
  // asserted here is the copy itself, because the copy is the design.

  it('carries the agreed paragraph in each column, word for word', async () => {
    await launch()
    expect(screen.getByTestId('first-run-songs').textContent).toContain(
      'The folder your recordings and lyrics are already in. Pregonero reads your songs from ' +
        'here and writes the song performance data back into it.'
    )
    expect(screen.getByTestId('first-run-gigs').textContent).toContain(
      'The folder where your gig data is stored. Pregonero makes a new folder here for each ' +
        'gig, and keeps its setup inside it.'
    )
  })

  it('has no third paragraph once both questions are answered', async () => {
    // With both answered the gated reason is gone, so every remaining paragraph on the screen is
    // one of the two. Counting is the only way "and no others" survives a later addition.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    expect(screen.getByTestId('first-run').querySelectorAll('p')).toHaveLength(2)
  })

  it('no longer says nothing is created, because the lede is gone', async () => {
    await launch()
    expect(screen.queryByTestId('first-run-lede')).toBeNull()
  })

  it('leaves by a button called Confirm', async () => {
    // It replaces `Use these folders`. The reason first given for the word — that it matches the
    // end of the gig flow — was false: that button reads `Confirm setup and go to the control
    // view` (`GigView.tsx`). `Confirm` stands on its own; making the two rhyme is a later decision
    // that has not been taken.
    await launch()
    expect(screen.getByTestId('first-run-confirm').textContent).toBe('Confirm')
  })

  // ── The third walk, v0.26.0: the title names the moment, the pickers say Choose ────────────

  it('is titled by the moment, not by the question the columns already ask', async () => {
    await launch()
    expect(screen.getByTestId('first-run').textContent).toContain('Pregonero kickoff')
    expect(screen.getByTestId('first-run').textContent).not.toContain(
      'Two folders you already have'
    )
  })

  it('offers Choose in each unanswered column, and Choose another folder once answered', async () => {
    // `Find it…` asked for a search; the button opens a picker.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run-gigs-choose').textContent).toBe('Choose')
    expect(screen.getByTestId('first-run-songs-choose').textContent).toBe('Choose another folder')
    expect(screen.getByTestId('first-run').textContent).not.toContain('Find it')
  })

  // ── The fourth walk: colour marks what has been answered ──────────────────────────────────
  //
  // The screen was legible and monochrome, so nothing on it said which half was done. These read
  // the stylesheet, the way the control view's layout rules are asserted — this round is colour,
  // and colour is invisible to a render assertion in jsdom. What the DOM can carry is the *state*
  // the colour hangs off, so that is asserted against the rendered tree.

  const css = () => readFileSync(resolve(__dirname, 'control.css'), 'utf8')
  const rule = (selector: string, sheet: string) => {
    const found = sheet.match(
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
    )
    if (!found) throw new Error(`rule not found: ${selector}`)
    return found[1]
  }

  it('draws no line under the title, because there is no navigation to separate', async () => {
    await launch()
    expect(rule('.first-run-screen .songs-top-bar', css())).toMatch(/border-bottom:\s*none/)
  })

  it('renders a chosen path in the app’s green, and an unanswered one still dimmed', () => {
    const sheet = css()
    expect(rule('.first-run-path', sheet)).toMatch(/color:\s*var\(--state-ok\)/)
    // The dimmed treatment is what makes the green mean *answered* rather than just mean *path*.
    expect(rule(".first-run-path[data-unset='true']", sheet)).toMatch(/color:\s*var\(--text-dim\)/)
  })

  it('turns Confirm green once it can be pressed, and leaves it alone while it cannot', () => {
    const sheet = css()
    const enabled = rule('.first-run-confirm-row .ctrl-btn.ctrl-setup-link:not(:disabled)', sheet)
    expect(enabled).toMatch(/color:\s*var\(--state-ok\)/)
    expect(enabled).toMatch(/border-color:\s*var\(--state-ok\)/)
    // Nothing claims the disabled state: it keeps the generic treatment, which is what makes the
    // turn legible when it happens.
    expect(sheet).not.toMatch(/\.first-run-confirm-row .ctrl-btn\.ctrl-setup-link:disabled\s*\{/)
  })

  it('draws an unanswered Choose in the app’s yellow, and lets an answered one go dark', () => {
    const unanswered = rule(
      ".first-run-column .ctrl-btn.ctrl-setup-link[data-unset='true']:not(:disabled)",
      css()
    )
    expect(unanswered).toMatch(/color:\s*var\(--state-warn\)/)
    expect(unanswered).toMatch(/border-color:\s*var\(--state-warn\)/)
  })

  it('takes its colours from the tokens already in the palette, not from new hex', () => {
    // The one rule the walk set for this round: no new colour enters for this screen.
    const sheet = css()
    const block = sheet.slice(
      sheet.indexOf('/* ---- First run: the two folders'),
      sheet.indexOf('/* ---- Setup home: gigs and songs')
    )
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('marks an unanswered column on its picker as well as on its path slot', async () => {
    // The DOM half of the colour: one flag per column, which both marks read off.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run-gigs-choose').getAttribute('data-unset')).toBe('true')
    expect(screen.getByTestId('first-run-gigs-value').getAttribute('data-unset')).toBe('true')
    expect(screen.getByTestId('first-run-songs-choose').hasAttribute('data-unset')).toBe(false)
    expect(screen.getByTestId('first-run-songs-value').hasAttribute('data-unset')).toBe(false)
  })

  it('drops the unanswered mark from the picker the moment the folder is chosen', async () => {
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run-songs-choose').getAttribute('data-unset')).toBe('true')
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run-songs-choose').hasAttribute('data-unset')).toBe(false)
  })

  it('never says tramoya — that word is the repo’s, not a user’s', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run').textContent!.toLowerCase()).not.toContain('tramoya')
  })

  // ── The folder-shape example is removed ──────────────────────────────────────────────────
  //
  // It read as prescriptive — a structure being required rather than a folder being found — and
  // was judged cosmetic on 2026-09-02. This reverses *it shows the shape rather than explaining
  // it*, and the shape is reconsidered if the screen turns out to need it.

  it('never draws a folder shape, whichever answers are in', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    expect(screen.queryByTestId('first-run-shape')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    expect(screen.queryByTestId('first-run-shape')).toBeNull()
    const screenText = screen.getByTestId('first-run').textContent!
    expect(screenText).not.toContain('song-performance/')
    expect(screenText).not.toContain('gig.json and visuals.json')
  })

  it('never blocks the projection window, which has nothing to ask for', async () => {
    await act(async () => {
      render(<App initialHash="#/projection" />)
    })
    expect(screen.queryByTestId('first-run')).toBeNull()
  })
})
