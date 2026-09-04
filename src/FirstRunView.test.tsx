/**
 * **First run replaces the main screen on launch.**
 *
 * The requirement is positional as much as behavioural: reset, launch, and the folder request is
 * what the deal hands you. If the hydration screen or the control view appears first, it is not
 * done — so these tests render `App`, not the view, and assert what is and is not there.
 *
 * **Every launch here answers one folder first**, which is what puts the folders screen up rather
 * than the deal (`AppDealView.test.tsx` owns that boundary). Where a test needs a genuinely empty
 * machine it presses `Begin →`.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureStorage } from './testSupport/storage'
import { GIGS_FOLDER_KEY, SONGS_FOLDER_KEY, VISUALS_FOLDER_KEY } from './contentFolders'

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
  // The app's deal comes one screen earlier on a machine that has answered nothing at all. It is
  // dismissed here rather than suppressed, because suppressing it would be a stored flag — the one
  // mechanism both screens are built to avoid.
  const begin = screen.queryByTestId('app-deal-begin')
  if (begin) {
    await act(async () => {
      fireEvent.click(begin)
    })
  }
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

  it('still asks when only the visuals folder is set', async () => {
    // The third folder, added 2026-09-04. It used to be reachable only from Preferences, which is
    // the shape first run exists to remove: a setting discovered at the moment it blocks you.
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  it('still asks when two of the three are set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-visuals-value').textContent).toBe('Not chosen yet')
  })

  it('never asks again once all three are set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
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
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
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

  it('stays put when the LAST folder is answered, whichever one that is', async () => {
    // Kept from the six rounds this screen cost: answering the last question does not throw you
    // onward. A third column does not change what the confirming press decides.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    chooseFolderPath.mockResolvedValue('/vault/visuals')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-visuals-choose'))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
    expect(screen.getByTestId('first-run-confirm').hasAttribute('disabled')).toBe(false)
  })

  it('holds the exit disabled, naming the questions still unanswered', async () => {
    // **The reason names what is open**, which is the whole of what a gated action owes. With
    // three questions, *one of these is missing* would be the wall the rule exists to prevent.
    chooseFolderPath.mockResolvedValue('/vault/songs')
    await launch()
    expect(screen.getByTestId('first-run-confirm').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('first-run-confirm-reason').textContent).toContain(
      'All three questions'
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-songs-choose'))
    })
    expect(screen.getByTestId('first-run-confirm').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('first-run-confirm-reason').textContent).toBe(
      'Where your visuals live and where your gigs live have not been answered yet.'
    )

    chooseFolderPath.mockResolvedValue('/vault/visuals')
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-visuals-choose'))
    })
    expect(screen.getByTestId('first-run-confirm-reason').textContent).toBe(
      'Where your gigs live has not been answered yet.'
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

  // ── Three questions, not one asked three times ───────────────────────────────────────────

  it('asks three different questions, named by what they find', async () => {
    // All of them were once phrased "choose a folder", which is exactly why the second read as
    // redundant. One finds a catalogue, one finds what goes on the wall, one finds a body of work.
    await launch()
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Where your songs live')
    expect(screen.getByTestId('first-run-songs').textContent).toContain('Your catalogue')
    expect(screen.getByTestId('first-run-visuals').textContent).toContain('Where your visuals live')
    expect(screen.getByTestId('first-run-visuals').textContent).toContain('What goes on the wall')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Where your gigs live')
    expect(screen.getByTestId('first-run-gigs').textContent).toContain('Your body of work')
  })

  it('asks them in the deal’s own order: songs, visuals, gigs', async () => {
    // The sentence the person has just read is *where your songs are, where your visuals are, and
    // where your gigs will live*. Asking in another order makes the screen a second thing to learn.
    await launch()
    const names = [...screen.getByTestId('first-run').querySelectorAll('.first-run-name')]
    expect(names.map((el) => el.textContent)).toEqual(['Songs', 'Visuals', 'Gigs'])
  })

  it('remembers the visuals folder where the store has always kept it', async () => {
    // The stored key still says `media` and is deliberately not migrated: a per-machine answer
    // already on disk is not wrong because the screen that asks for it found a better name.
    chooseFolderPath.mockResolvedValue('/vault/visuals')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-visuals-choose'))
    })
    expect(localStorage.getItem(VISUALS_FOLDER_KEY)).toBe('/vault/visuals')
    expect(chooseFolderPath).toHaveBeenCalledWith('Where your visuals live', 'media-folder')
  })

  // ── NO paragraphs at all, and no other prose ──────────────────────────────────────────────
  //
  // The lede and the folder-shape example were removed on 2026-09-02: the shape read as
  // prescriptive and the prose explained the app to someone who had not used it yet. **The two
  // paragraphs that replaced them went on 2026-09-04**: they existed because this screen was the
  // first thing you met and had to do the explaining, and the deal does that one screen earlier.
  // Three of them is also what would not have fitted beside a third column.

  it('argues for no folder in prose, because the deal argued for all three', async () => {
    await launch()
    for (const column of ['songs', 'visuals', 'gigs']) {
      expect(screen.getByTestId(`first-run-${column}`).querySelectorAll('p')).toHaveLength(0)
    }
    // The sentences themselves, asserted absent so a revert has to be deliberate.
    const text = screen.getByTestId('first-run').textContent!
    expect(text).not.toContain('The folder your recordings and lyrics are already in')
    expect(text).not.toContain('The folder where your gig data is stored')
  })

  it('has no prose at all once every question is answered', async () => {
    // With all three answered the gated reason is gone, and nothing else on the screen is a
    // paragraph. Counting is the only way "and no others" survives a later addition.
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
    chooseFolderPath.mockResolvedValue('/vault/gigs')
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-gigs-choose'))
    })
    expect(screen.getByTestId('first-run').querySelectorAll('p')).toHaveLength(0)
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

  it('is titled Start here, repeating neither the question nor the app name', async () => {
    // Three titles deep. `Two folders you already have` stated the question the columns already
    // ask (third walk); `Pregonero kickoff` named the moment but repeated the app's name, which
    // the window's own title bar carries two lines above it (sixth walk). The objection to `Start
    // here` was that it drops the app name; the chrome is what makes that objection void.
    await launch()
    expect(screen.getByTestId('first-run').textContent).toContain('Start here')
    expect(screen.getByTestId('first-run').textContent).not.toContain('Pregonero kickoff')
    expect(screen.getByTestId('first-run').textContent).not.toContain(
      'Two folders you already have'
    )
  })

  it('gives the title room above it, in the spacing this screen already uses', () => {
    // `.songs-title` is absolute and the bar's only child, so the bar has no content height —
    // 0.75em of padding with a 1.5em heading centred on it puts the heading against the window's
    // top edge. The bar lays the title out in the flow so the padding above is space you see.
    const sheet = css()
    const bar = rule('.first-run-screen .songs-top-bar', sheet)
    expect(bar).toMatch(/padding-top:\s*2em/)
    expect(rule('.first-run-screen .songs-title', sheet)).toMatch(/position:\s*static/)
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

  it('renders a chosen path in ordinary paper, and an unanswered one dimmed', () => {
    // The fifth walk took `--state-ok` back off the path: one green mark on the screen, and it is
    // `Confirm`. The path returns to the treatment it had before the fourth walk put colour on it.
    const sheet = css()
    expect(rule('.first-run-path', sheet)).toMatch(/color:\s*var\(--text-primary\)/)
    expect(rule('.first-run-path', sheet)).not.toMatch(/--state-ok/)
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
      sheet.indexOf('/* ---- First run: the three folders'),
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

  // ── The fifth walk: the name is loudest, and the green is only on Confirm ─────────────────
  //
  // Two decisions from the same day are reversed here. At rest both paths read `Not chosen yet`,
  // so the two columns opened looking identical — the reading the side-by-side layout exists to
  // prevent — and the green was spread over three marks when it means one thing.

  it('heads each column with its name, large, above the caps subtitle', async () => {
    await launch()
    expect(screen.getByTestId('first-run-songs-name').textContent).toBe('Songs')
    expect(screen.getByTestId('first-run-gigs-name').textContent).toBe('Gigs')
    // Rendered in caps by the stylesheet, the way the subtitle below it already was.
    const name = rule('.first-run-name', css())
    expect(name).toMatch(/text-transform:\s*uppercase/)
    // Loudest: bigger than the path, which is the element it takes the role from.
    const size = (block: string) => Number(block.match(/font-size:\s*([\d.]+)em/)![1])
    expect(size(name)).toBeGreaterThan(size(rule('.first-run-path', css())))
  })

  it('orders the column name, subtitle, button, path', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    await launch()
    const column = screen.getByTestId('first-run-songs')
    expect([...column.children].map((el) => el.className)).toEqual([
      'first-run-name',
      'first-run-label',
      'ctrl-btn ctrl-setup-link',
      'first-run-path',
    ])
  })

  it('lays the column out in four rows, so the four parts line up across all three', () => {
    // `subgrid` is what keeps a wrapped label in one column from pushing its own path out of step
    // with the others; it only holds if the row count matches the parts. The LABEL takes the slack
    // now that the paragraph is gone — it is the part that wraps unevenly in a narrower column.
    const sheet = css()
    expect(rule('.first-run-columns', sheet)).toMatch(/grid-template-rows:\s*auto 1fr auto auto/)
    expect(rule('.first-run-columns', sheet)).toMatch(/grid-template-columns:\s*1fr 1fr 1fr/)
    expect(rule('.first-run-column', sheet)).toMatch(/grid-row:\s*span 4/)
  })

  it('draws two rules for three columns, and none down the outside', () => {
    // The line is what makes them read as separate questions before any is read. A rule on the
    // first column would be a line down the edge of the screen.
    const sheet = css()
    expect(rule('.first-run-column', sheet)).toMatch(/border-left:\s*1px solid var\(--rule-strong\)/)
    expect(rule('.first-run-column:first-of-type', sheet)).toMatch(/border-left:\s*none/)
  })

  it('no longer styles a paragraph it no longer renders', () => {
    // A stylesheet holding a class nothing renders is a screen half-reverted.
    expect(css()).not.toMatch(/^\.first-run-paragraph\s*\{/m)
  })

  it('puts green in exactly one place on the screen', async () => {
    // The point of the reversal: one green mark, meaning you are ready.
    const sheet = css()
    const firstRun = sheet.slice(
      sheet.indexOf('/* ---- First run: the three folders'),
      sheet.indexOf('/* ---- Setup home: gigs and songs')
    )
    // Declarations only: the comments above still narrate what the green used to do and where.
    const declared = firstRun.replace(/\/\*[\s\S]*?\*\//g, '').match(/--state-ok/g) ?? []
    // `color` and `border-color` on the enabled button, plus its hover border. Nothing else.
    expect(declared).toHaveLength(3)
    const aboveConfirm = firstRun.slice(0, firstRun.indexOf('.first-run-confirm-row'))
    expect(aboveConfirm.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--state-ok/)
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
    // The TREE is what was removed, not the NAME: both paragraphs state their folder outright,
    // and `song-performance` appears in the songs one on purpose. What must not come back is the
    // shape — a path with a separator in it, drawn as a structure to arrange.
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
