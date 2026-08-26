/** @vitest-environment jsdom */
/**
 * The panel. What matters most here is what it is *not*: not modal, not blocking, and not on the
 * projection.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { DebriefPanel } from './DebriefPanel'
import { EMPTY_ANSWERS, type DebriefFacts } from './debrief'

vi.mock('./mediaPathStore', () => ({
  getMediaPath: () => null,
  absolutePathToMediaUrl: (p: string) => p,
}))

afterEach(cleanup)

const FACTS: DebriefFacts = {
  date: '2026-09-12',
  venueName: 'Bar Eduard',
  venueCity: 'Ghent',
  performed: [
    { songId: 'libertad', title: 'Libertad', startedAt: null, endedAt: null },
    { songId: 'vidas', title: 'Vidas', startedAt: null, endedAt: null },
    { songId: 'libertad', title: 'Libertad', startedAt: null, endedAt: null },
  ],
  skipped: [{ songId: 'duelo', title: 'Duelo' }],
  problems: ['Duelo: no timeline'],
  elapsedSeconds: 3600,
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof DebriefPanel>> = {}) {
  const onAnswers = vi.fn()
  const onDismiss = vi.fn()
  const onSave = vi.fn().mockResolvedValue({ ok: true })
  render(
    <DebriefPanel
      facts={FACTS}
      answers={EMPTY_ANSWERS}
      onAnswers={onAnswers}
      onDismiss={onDismiss}
      onSave={onSave}
      {...overrides}
    />
  )
  return { onAnswers, onDismiss, onSave }
}

describe('DebriefPanel', () => {
  it('prefills the night without asking for any of it', () => {
    renderPanel()
    expect(screen.getByTestId('debrief-facts').textContent).toContain('Bar Eduard, Ghent')
    expect(screen.getByTestId('debrief-facts').textContent).toContain('1h 0m')
    expect(screen.getByTestId('debrief-played').textContent).toContain('Libertad')
    expect(screen.getByTestId('debrief-skipped').textContent).toContain('Duelo')
    expect(screen.getByTestId('debrief-problems').textContent).toContain('Duelo: no timeline')
  })

  it('marks the repeat, and offers each song once as an answer', () => {
    renderPanel()
    // Three performances, two songs: the list shows what happened, the choices show what to pick.
    expect(screen.getByTestId('debrief-played').querySelectorAll('li')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Libertad' })).toHaveLength(2) // best + worst
    expect(screen.getByTestId('debrief-played').textContent).toContain('repeat')
  })

  it('asks four things and only four', () => {
    renderPanel()
    const labels = [...document.querySelectorAll('.debrief-label')].map((el) => el.textContent)
    expect(labels).toEqual([
      'How full was the room?',
      'Best song tonight',
      'Worst song tonight',
      'What to change in this room next time',
    ])
  })

  it('takes the room in one tap', () => {
    const { onAnswers } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'decent' }))
    expect(onAnswers).toHaveBeenCalledWith({ ...EMPTY_ANSWERS, fullness: 'decent' })
  })

  it('takes one line of free text for the room note', () => {
    const { onAnswers } = renderPanel()
    fireEvent.change(screen.getByLabelText('What to change in this room next time'), {
      target: { value: 'Projector two metres back.' },
    })
    expect(onAnswers).toHaveBeenCalledWith({
      ...EMPTY_ANSWERS,
      changeNextTime: 'Projector two metres back.',
    })
  })

  it('is dismissable, and dismissing is not answering', () => {
    const { onDismiss, onAnswers } = renderPanel()
    fireEvent.click(screen.getByTestId('debrief-dismiss'))
    expect(onDismiss).toHaveBeenCalled()
    expect(onAnswers).not.toHaveBeenCalled()
  })

  it('is not a dialog and traps nothing — a repeat has to stay reachable behind it', () => {
    renderPanel()
    const panel = screen.getByTestId('debrief-panel')
    expect(panel.getAttribute('role')).toBeNull()
    expect(panel.getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('writes the file on save, and says so', async () => {
    const { onSave } = renderPanel()
    await act(async () => { fireEvent.click(screen.getByTestId('debrief-save')) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toContain('# Debrief — Bar Eduard, Ghent, 2026-09-12')
    expect(screen.getByTestId('debrief-saved')).toBeTruthy()
  })

  it('names the reason when the write fails, instead of claiming it saved', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: 'No gig folder is open.' })
    renderPanel({ onSave })
    await act(async () => { fireEvent.click(screen.getByTestId('debrief-save')) })
    expect(screen.getByTestId('debrief-error').textContent).toBe('No gig folder is open.')
    expect(screen.queryByTestId('debrief-saved')).toBeNull()
  })
})
