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
const openProjection = vi.fn()
const closeProjection = vi.fn()

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
  // The projection window's own bridge: this step opens the projector and hands it back.
  ;(window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
    openProjection: (...a: unknown[]) => openProjection(...a),
    closeProjection: (...a: unknown[]) => closeProjection(...a),
  }
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

  /**
   * **THE TWO LARGE PREVIEWS BECAME A PICKER, AND THE WALL BECAME THE PREVIEW** (Jorge,
   * 2026-09-06). *The real thing at real size on the real wall is the preview* — the same move
   * that made Muralista's `2 OUTPUT` the photograph rather than a simulation.
   *
   * **The argument is evidence, not taste.** The intro card's translation line shipped too small
   * to read at wall distance, and **it would have been caught here** if the card had been on the
   * wall rather than drawn into a scaled square on this screen.
   *
   * **It does not contradict `v0.91.0`**, which took this window off the projector during the
   * visuals step: there the card was an intruder over Muralista's output, here it is the subject.
   */
  it('puts the message home on the wall, with its live fields, as soon as the step opens', async () => {
    await renderStep({ ...FIELDS, message: 'Write to me.' })
    const { getContactBroadcast } = await import('./cardBroadcast')
    const sent = getContactBroadcast()
    expect(sent.preview).toEqual({ kind: 'message-home' })
    // **The fields are this screen's live edits**, not the gig file's: what is on the wall is
    // what he is typing.
    expect(sent.fields.message).toBe('Write to me.')
    expect(openProjection).toHaveBeenCalled()
  })

  it('switches the wall to a chosen song\u2019s title card', async () => {
    installLibrary([song('duelo', 'Duelo'), song('libertad', 'Libertad')])
    await renderStep()
    await waitFor(() => expect(screen.getByTestId('gig-cards-show-intro')).toBeTruthy())

    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-show-intro'))
    })
    const { getContactBroadcast } = await import('./cardBroadcast')
    expect(getContactBroadcast().preview).toEqual({
      kind: 'intro',
      parts: { title: 'Duelo', annotation: undefined, tagline: undefined },
    })

    await act(async () => {
      fireEvent.change(screen.getByTestId('gig-cards-song'), { target: { value: 'libertad' } })
    })
    expect((getContactBroadcast().preview as { parts: { title: string } }).parts.title).toBe('Libertad')
  })

  it('says which card is on the wall, and what nothing at all means', async () => {
    await renderStep()
    expect(screen.getByTestId('gig-cards-empty-note').textContent).toMatch(/stays dark/)

    cleanup()
    await renderStep({ ...FIELDS, message: 'Write to me.' })
    expect(screen.getByTestId('gig-cards-empty-note').textContent).toMatch(/On the wall now/)
  })

  it('hands the projector back on leaving', async () => {
    await renderStep({ ...FIELDS, message: 'Write to me.' })
    cleanup()
    const { getContactBroadcast } = await import('./cardBroadcast')
    // The preview is cleared, so whatever the gig's state says takes the wall again…
    expect(getContactBroadcast().preview).toBeNull()
    // …and the window closes, because this step is what opened it.
    expect(closeProjection).toHaveBeenCalled()
  })

  it('says there is no title card to look at when the running order is empty', async () => {
    await renderStep()
    expect(screen.getByTestId('gig-cards-no-songs')).toBeTruthy()
    expect((screen.getByTestId('gig-cards-show-intro') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the song picker narrow, because it holds one song title', async () => {
    installLibrary([song('duelo', 'Duelo')])
    await renderStep()
    await act(async () => {
      fireEvent.click(screen.getByTestId('gig-cards-show-intro'))
    })
    const field = screen.getByTestId('gig-cards-song').closest('label') as HTMLElement
    expect(field.className.split(/\s+/)).toContain('gig-cards-song-field')

    const css = readFileSync(resolve(__dirname, 'control.css'), 'utf8')
    const at = css.indexOf('.gig-cards-song-field {')
    expect(at, '.gig-cards-song-field is not in control.css').toBeGreaterThan(-1)
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/max-width:\s*[\d.]+em/)
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
