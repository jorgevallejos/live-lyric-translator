/**
 * **First run, screen two of three: who the artist is.**
 *
 * The requirement is positional as much as behavioural — THE DEAL · WHO YOU ARE · YOUR FOLDERS —
 * so these tests render `App` and assert what is and is not on screen, the way
 * `FirstRunView.test.tsx` and `AppDealView.test.tsx` do for the screens either side of it.
 *
 * **The two rulings this file exists to keep** (Jorge, 2026-09-05):
 *
 * - **It is its own screen, not a third folder column.** *The folders screen answers where your
 *   things are, and a name is a different kind of question.* Six rounds bought that screen's
 *   clarity, and its premise is that its columns are the same kind of thing.
 * - **The name is never captured from anywhere else.** Cowork proposed harvesting it from
 *   Bombista's page 1; Jorge rejected it as *opportunistic and fishy*. **A value collected for one
 *   purpose is not silently promoted to another**, so nothing but this screen and Preferences may
 *   write it.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ensureStorage } from './testSupport/storage'
import {
  ARTIST_NAME_KEY,
  GIGS_FOLDER_KEY,
  SONGS_FOLDER_KEY,
  VISUALS_FOLDER_KEY,
} from './contentFolders'

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
  vi.clearAllMocks()
  window.location.hash = '#/'
})

/** Past the deal, which is screen one. Dismissed rather than suppressed: no stored flag exists. */
async function launch() {
  await act(async () => {
    render(<App initialHash="#/" />)
  })
  const begin = screen.queryByTestId('app-deal-begin')
  if (begin) {
    await act(async () => {
      fireEvent.click(begin)
    })
  }
}

const type = async (value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByTestId('artist-name-input'), { target: { value } })
  })
}

describe('the artist’s name at first run', () => {
  it('comes after the deal and before the folders', async () => {
    await launch()
    expect(screen.getByTestId('artist-name')).toBeTruthy()
    // The screen it replaces for now, and the one it must not have skipped past.
    expect(screen.queryByTestId('first-run')).toBeNull()
    expect(screen.queryByTestId('app-deal')).toBeNull()
    // Not behind the hydration screen and not behind the control view.
    expect(screen.queryByTestId('song-library-loading')).toBeNull()
  })

  it('hands over to the folders once it is answered', async () => {
    await launch()
    await type('Chango Pepper')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))
    })
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  /**
   * **There is no skip**, for the same reason first run has none: the whole point is that a setting
   * stops being something you discover at the moment it blocks you. The gate names the question
   * rather than saying *required*.
   */
  it('will not go on until it has an answer, and says which question is open', async () => {
    await launch()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))
    })
    expect(screen.getByTestId('artist-name')).toBeTruthy()
    expect(screen.getByTestId('artist-name-continue-reason').textContent).toBe(
      'Pregonero has not been told who the artist is yet.'
    )
  })

  /** Whitespace is not an answer. A name of spaces would pass a length check and be nothing. */
  it('does not accept spaces as a name', async () => {
    await launch()
    await type('   ')
    expect(localStorage.getItem(ARTIST_NAME_KEY)).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))
    })
    expect(screen.getByTestId('artist-name')).toBeTruthy()
  })

  /**
   * **The answer is written as it is typed and the button is about leaving** — the folders screen's
   * own rule, so a launch interrupted here comes back to a question already answered.
   */
  it('writes the answer before the button is pressed', async () => {
    await launch()
    await type('Chango Pepper')
    expect(localStorage.getItem(ARTIST_NAME_KEY)).toBe('Chango Pepper')
  })

  /** Read from the world, never from a stored dismissal. A machine that has said it is not asked. */
  it('is not shown again once the name is on the machine', async () => {
    localStorage.setItem(ARTIST_NAME_KEY, 'Chango Pepper')
    await launch()
    expect(screen.queryByTestId('artist-name')).toBeNull()
    expect(screen.getByTestId('first-run')).toBeTruthy()
  })

  /**
   * **It is asked even when the folders are already answered**, which is the upgrade case and the
   * principle behind it: *each artist-level fact is asked at the moment it is first needed.* A
   * machine that has been running since before the name existed has not been asked yet.
   */
  it('is asked on a machine whose folders are already set', async () => {
    localStorage.setItem(SONGS_FOLDER_KEY, '/vault/songs')
    localStorage.setItem(VISUALS_FOLDER_KEY, '/vault/visuals')
    localStorage.setItem(GIGS_FOLDER_KEY, '/vault/gigs')
    await launch()
    expect(screen.getByTestId('artist-name')).toBeTruthy()
  })

  /** The projection window has nothing to be asked. It is a second window with no preload. */
  it('never blocks the projection window', async () => {
    await act(async () => {
      render(<App initialHash="#/projection" />)
    })
    expect(screen.queryByTestId('artist-name')).toBeNull()
  })

  /**
   * **What the screen may promise.** The message home — the line, the URL, the QR — is decided and
   * is the first gig's work, not this round's. **A screen that announces a feature it does not have
   * is the class of claim this project has a rule about**, so the copy says the durable half: the
   * app stops asking, and the name is a preference rather than part of any song.
   */
  it('says what the name is for without promising the wall', async () => {
    await launch()
    const why = screen.getByTestId('artist-name-why').textContent ?? ''
    expect(why).toContain('so you are not asked again')
    expect(why).toContain('Preferences')
    expect(why).not.toMatch(/wall|projector|QR|scan/i)
  })
})
