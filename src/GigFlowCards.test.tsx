/** @vitest-environment jsdom */
/**
 * **The gig flow's cards step: what the wall says when no song is running** (Jorge, 2026-09-05).
 *
 * Deciding the two cards are not shapes answered *where they appear* and took away *where you set
 * them up*. This is the answer — one screen for both not-running states of the three-state gig.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { ensureStorage } from './testSupport/storage'
import { installLibrary } from './testSupport/library'
import type { LibrarySong } from './setlistStore'

const chooseVisualInsideFolder = vi.fn()

vi.mock('./visualsPick', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  chooseVisualInsideFolder: (...a: unknown[]) => chooseVisualInsideFolder(...a),
}))

vi.mock('./mediaPathStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveMediaPath: (src: string) => (src === 'logo.png' ? '/visuals/logo.png' : null),
  absolutePathToMediaUrl: (path: string) => `media://local${path}`,
}))

const { ScreenCards, initialCardFields, toMessageHome, DEFAULT_MESSAGE } = await import('./GigFlowCards')
const {
  MESSAGE_HOME_HANDLE_KEY,
  MESSAGE_HOME_MESSAGE_KEY,
  rememberMessageHome,
} = await import('./messageHomePrefs')

beforeAll(() => {
  ensureStorage()
})

function song(id: string, title: string): LibrarySong {
  return { id, title, items: [{ languages: { es: 'línea' } }] } as LibrarySong
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  // The flow only ever renders inside an app that has hydrated the library, so the step reads the
  // running order straight. An empty one is the honest starting point for most of these.
  installLibrary([])
})

afterEach(cleanup)

const FIELDS = { logo: '', url: '', handle: '', message: '' }

async function renderStep(
  fields = FIELDS,
  onField = vi.fn(),
  onForward = vi.fn()
) {
  await act(async () => {
    render(<ScreenCards fields={fields} busy={false} onField={onField} onForward={onForward} />)
  })
  return { onField, onForward }
}

describe('what it starts from', () => {
  it('carries the line itself on a machine that has never answered', () => {
    // **Offered as a real value, not a placeholder** — a placeholder is not on the wall and this is
    // meant to be. It is his to edit or to clear.
    expect(initialCardFields().message).toBe(DEFAULT_MESSAGE)
  })

  it('prefills from this machine’s remembered answers once there are any', () => {
    // **Artist-level: asked at first need, edited in Preferences.** Later gigs arrive prefilled.
    rememberMessageHome({ handle: '@changopepper', message: 'Say hello.' })
    expect(initialCardFields()).toEqual({
      logo: '',
      url: '',
      handle: '@changopepper',
      message: 'Say hello.',
    })
  })

  it('does not put the line back once an answer has been given and cleared', () => {
    // A field cleared is remembered as cleared: the step is where the answer is given, so it is
    // also where it is taken back.
    localStorage.setItem(MESSAGE_HOME_HANDLE_KEY, '@changopepper')
    localStorage.removeItem(MESSAGE_HOME_MESSAGE_KEY)
    expect(initialCardFields().message).toBe('')
  })
})

describe('what it writes into the gig', () => {
  it('drops the blanks, so an unanswered field is absent rather than empty', () => {
    expect(toMessageHome({ logo: '', url: '  ', handle: '@x', message: 'y' })).toEqual({
      handle: '@x',
      message: 'y',
    })
  })

  it('is no block at all when nothing is answered', () => {
    // **All four empty means nothing is pointed at the shape**, and one representation of that
    // state is easier to reason about than two.
    expect(toMessageHome(FIELDS)).toEqual({})
  })
})

describe('the screen', () => {
  it('asks for four things, and none of the four is called a tagline', async () => {
    // **`Tagline` already means the intro card's third part**, and that card is previewed on this
    // same screen — so the word is used here, correctly, about the intro. What must not happen is
    // a *field* called that: two different things called tagline on one screen is the vocabulary
    // slippage that cost five contract mismatches in two days.
    await renderStep()
    expect(screen.getByTestId('gig-cards-logo-pick')).toBeTruthy()
    expect(screen.getByTestId('gig-cards-url')).toBeTruthy()
    expect(screen.getByTestId('gig-cards-handle')).toBeTruthy()
    expect(screen.getByTestId('gig-cards-message')).toBeTruthy()
    const labels = [...document.querySelectorAll('.setup-home-field > span:first-child')].map(
      (el) => el.textContent
    )
    expect(labels).toEqual(['Logo', 'Address', 'Instagram', 'Message'])
  })

  it('shows the card as it will look, and says when there is nothing to show', async () => {
    // **The preview earns its place twice**: it shows the card before the night, and it is how you
    // see what leaving a field blank does.
    await renderStep()
    expect(screen.getByTestId('gig-cards-empty-note').textContent).toMatch(/stays dark/)

    cleanup()
    await renderStep({ ...FIELDS, message: 'Write to me.' })
    expect(screen.getByTestId('gig-cards-message-card')).toBeTruthy()
    expect(screen.getByText('Write to me.')).toBeTruthy()
    expect(screen.getByTestId('gig-cards-empty-note').textContent).toMatch(/once the setlist has ended/)
  })

  it('previews the title card too, with a song selector for that half only', async () => {
    // **The intro's preview needs a song and the message home does not.** Nothing is filled in for
    // it — all three parts come from the song file.
    installLibrary([song('duelo', 'Duelo'), song('libertad', 'Libertad')])
    await renderStep()
    await waitFor(() => expect(screen.getByTestId('gig-cards-song')).toBeTruthy())
    expect(screen.getByTestId('gig-cards-intro-card').textContent).toContain('Duelo')
    await act(async () => {
      fireEvent.change(screen.getByTestId('gig-cards-song'), { target: { value: 'libertad' } })
    })
    expect(screen.getByTestId('gig-cards-intro-card').textContent).toContain('Libertad')
  })

  it('says there is no title card to look at when the running order is empty', async () => {
    await renderStep()
    expect(screen.getByTestId('gig-cards-no-songs')).toBeTruthy()
    expect(screen.queryByTestId('gig-cards-intro-preview')).toBeNull()
  })

  /**
   * **THE TWO PREVIEWS STACK, EACH AT THE FULL WIDTH OF THE APP** (Jorge, 2026-09-06). They shipped
   * side by side, in blocks capped at `20em`, each preview a fixed **320px** square — two small
   * squares on a wide screen, with the fields above them. **The step was cramped.**
   *
   * **Nothing else about the step moves**: the fields, the live preview and the song selector are
   * good as they are.
   *
   * **The preview's width stops being a number this file chose.** It is the container's, measured,
   * and the `UNIT_SIZE` box is scaled to it — so *full width* keeps meaning full width when the
   * window changes, which a constant cannot do. **jsdom does no layout and has no
   * `ResizeObserver`**, so the component falls back to a nominal width there and the shape is
   * asserted in the stylesheet, the same device the gig picker's rows use.
   */
  /**
   * **STACKED, AND MODEST** (Jorge, 2026-09-06). Stacking was right and stays; *don't make the
   * cards too big* is the correction. Full-bleed on a real screen made a preview taller than the
   * window, so reading the step meant scrolling past two of them to reach the fields.
   *
   * **The cap is on the preview, not on the block**, so the label and the note beneath still read
   * as part of a column rather than being trapped in a narrow gutter — which is what the `20em`
   * cap on the block did before it came off.
   */
  it('stacks the two previews, keeps them modest, and picks no width of its own', async () => {
    await renderStep()

    const preview = screen.getByTestId('gig-cards-message-preview')
    // No inline pixel width: the element takes the width the stylesheet gives it.
    expect(preview.getAttribute('style') ?? '').not.toMatch(/width:\s*\d+px/)

    const css = readFileSync(resolve(__dirname, 'control.css'), 'utf8')
    const rule = (selector: string): string => {
      const at = css.indexOf(selector + ' {')
      expect(at, `${selector} is not in control.css`).toBeGreaterThan(-1)
      return css.slice(at, css.indexOf('}', at))
    }

    const row = rule('.gig-cards-previews')
    expect(row).toMatch(/flex-direction:\s*column/)
    expect(row).not.toMatch(/flex-wrap/)

    const block = rule('.gig-cards-preview-block')
    // The 20em cap was half of what made the step cramped when they were side by side.
    expect(block).not.toMatch(/max-width/)

    const box = rule('.gig-cards-preview')
    // Still fluid, so a narrow window shrinks it rather than clipping it…
    expect(box).toMatch(/width:\s*100%/)
    expect(box).toMatch(/aspect-ratio:\s*1\s*\/\s*1/)
    // …and still square, because the unit box the compositor draws into is square.
    // **But capped**: a preview is for reading the card, not for filling the window.
    const cap = /max-width:\s*([\d.]+)em/.exec(box)
    expect(cap, `.gig-cards-preview has no max-width: ${box}`).toBeTruthy()
    expect(parseFloat(cap![1]!)).toBeLessThanOrEqual(34)
  })
})

describe('the logo picker inherits the visuals-folder guard', () => {
  it('takes the name when the file is inside the folder', async () => {
    chooseVisualInsideFolder.mockResolvedValue({ outcome: 'picked', name: 'logo.png' })
    const { onField } = await renderStep()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-logo-pick'))
    })
    expect(onField).toHaveBeenCalledWith('logo', 'logo.png')
  })

  it('refuses a file outside it in a popup, and leaves the field empty', async () => {
    // **One rule, both places** — the same function the shape picker uses, so it cannot drift.
    // Nothing is left behind: no name crossed, so the card stays without one.
    chooseVisualInsideFolder.mockResolvedValue({ outcome: 'refused', folder: '/vault/visuals' })
    const { onField } = await renderStep()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-logo-pick'))
    })
    expect(screen.getByTestId('gig-cards-outside-popup').textContent).toContain('/vault/visuals')
    expect(onField).not.toHaveBeenCalled()
  })

  it('says so when there is no visuals folder at all', async () => {
    chooseVisualInsideFolder.mockResolvedValue({ outcome: 'no-folder' })
    await renderStep()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-logo-pick'))
    })
    expect(screen.getByTestId('gig-cards-outside-popup').textContent).toMatch(/no visuals folder/i)
  })

  it('changes nothing when the dialog is dismissed', async () => {
    chooseVisualInsideFolder.mockResolvedValue({ outcome: 'dismissed' })
    const { onField } = await renderStep()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-logo-pick'))
    })
    expect(screen.queryByTestId('gig-cards-outside-popup')).toBeNull()
    expect(onField).not.toHaveBeenCalled()
  })
})
