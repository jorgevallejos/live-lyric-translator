/**
 * **An action with an unmet precondition renders disabled, with the reason attached. Never absent.**
 *
 * The rule and why it is a rule are in `GatedAction.tsx`. These tests are the part that keeps it:
 * the component's own behaviour, and **a count of the sites it governs**, for the same reason
 * `SONG_DOORS` is counted — a site quietly dropped from the list is a control that has gone back
 * to vanishing, and nothing else would notice.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GatedAction, GATED_SITES } from './GatedAction'
import { ensureStorage } from './testSupport/storage'

beforeAll(ensureStorage)
afterEach(cleanup)

describe('a gated action', () => {
  it('is present and live when nothing blocks it', () => {
    const onClick = vi.fn()
    render(
      <GatedAction site="setup-new-gig" label="New gig" blockedBy={null} onClick={onClick} />
    )
    const button = screen.getByTestId('setup-new-gig') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it('is still present when blocked — this is the whole rule', () => {
    // The failure it prevents: a person concluding the app cannot do something it can. A vanished
    // control gives no evidence the capability exists at all.
    render(
      <GatedAction
        site="setup-new-gig"
        label="New gig"
        blockedBy="A gig folder can only be opened from the desktop app."
        onClick={vi.fn()}
      />
    )
    expect(screen.getByTestId('setup-new-gig')).toBeTruthy()
  })

  it('is genuinely disabled, not merely styled as though it were', () => {
    // Not an argument for enabling everything and failing on click. It does nothing; it is there.
    const onClick = vi.fn()
    render(
      <GatedAction site="setup-new-gig" label="New gig" blockedBy="Not here." onClick={onClick} />
    )
    const button = screen.getByTestId('setup-new-gig') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('says why, in text, and not only in a tooltip', () => {
    // A `title` alone is a reason nobody on a touch screen ever sees, and this app is driven from
    // an iPad.
    render(
      <GatedAction
        site="setup-new-gig"
        label="New gig"
        blockedBy="There is no songs folder yet."
        onClick={vi.fn()}
      />
    )
    expect(screen.getByTestId('setup-new-gig-reason').textContent).toContain('no songs folder')
  })

  it('points a screen reader at the reason', () => {
    render(
      <GatedAction site="setup-new-gig" label="New gig" blockedBy="Nope." onClick={vi.fn()} />
    )
    const button = screen.getByTestId('setup-new-gig')
    expect(button.getAttribute('aria-describedby')).toBe('setup-new-gig-reason')
    expect(screen.getByTestId('setup-new-gig-reason').id).toBe('setup-new-gig-reason')
  })

  it('says nothing when nothing is wrong', () => {
    render(<GatedAction site="setup-new-gig" label="New gig" blockedBy={null} onClick={vi.fn()} />)
    expect(screen.queryByTestId('setup-new-gig-reason')).toBeNull()
  })

  it('offers a way to satisfy the precondition when there is one', () => {
    render(
      <GatedAction
        site="setup-new-song"
        label="New"
        blockedBy="There is no songs folder yet."
        onClick={vi.fn()}
        remedy={<button type="button">Open preferences</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Open preferences' })).toBeTruthy()
  })

  it('is held by busy without pretending a precondition is unmet', () => {
    // Busy is not a blocked precondition, so it disables without inventing a reason to show.
    render(
      <GatedAction
        site="setup-new-gig"
        label="New gig"
        blockedBy={null}
        busy
        onClick={vi.fn()}
      />
    )
    expect((screen.getByTestId('setup-new-gig') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('setup-new-gig-reason')).toBeNull()
  })

  it('governs exactly these sites, and counting them is how the rule survives', () => {
    // Same device as SONG_DOORS. Removing a site from this list without changing its screen is a
    // control that has gone back to vanishing; that is a deliberate act with a test to change.
    expect([...GATED_SITES]).toEqual([
      'setup-new-song',
      'setup-new-gig',
      'setup-import-gig',
      'setup-create-gig',
      'muralista-open',
      'muralista-open-gig',
      'gig-flow-muralista',
      'first-run-confirm',
    ])
  })
})
