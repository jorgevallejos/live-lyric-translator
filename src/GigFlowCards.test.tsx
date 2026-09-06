/** @vitest-environment jsdom */
/**
 * **The gig flow's cards step: what the wall says when no song is running** (Jorge, 2026-09-05).
 *
 * Deciding the two cards are not shapes answered *where they appear* and took away *where you set
 * them up*. This is the answer — one screen for both not-running states of the three-state gig.
 */
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
