/** @vitest-environment jsdom */
/**
 * **One consent-dialog shape across the suite** (Jorge, 2026-09-03, walking Pregonero `v0.38.0`
 * with Bombista `v1.8.0`).
 *
 * `Leave without saving?` here and `No recording` in Bombista are the same category of thing — a
 * destructive or leaving action asking for consent — on either side of a seam the person cannot see
 * anywhere else in the flow. They were in two visual languages: this one centred with centred text,
 * that one left-aligned with a filled button.
 *
 * **The shape: left-aligned title and text, two outlined buttons, the leaving action on the right.**
 *
 * **It cannot be a shared component.** The other implementation is rendered by a Python process in
 * another repository, so the shape lives in `tramoya-integration/journey-setup.md` and is built
 * twice. These assertions are this side's half of that contract; `tests/test_pages.py` is the other.
 *
 * The alignment is read out of the stylesheet as text, because jsdom computes no layout and what
 * went wrong was a rule saying the wrong thing, not a box measuring wrong.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LeaveWithoutSaving } from './LeaveWithoutSaving'

const css = readFileSync(resolve(__dirname, 'control.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declaration block of the rule whose selector is exactly `selector`. */
function ruleFor(selector: string): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
    ([, sel]) => sel!.trim() === selector
  )
  expect(match, `no rule for ${selector}`).toBeTruthy()
  return match![2]!
}

afterEach(cleanup)

describe('the consent dialog’s shape', () => {
  it('is left-aligned, title and text', () => {
    const dialog = ruleFor('.leave-without-saving')
    expect(dialog).toMatch(/text-align:\s*left/)
    // The box is a centring column by default — `.ctrl-timeline-save-dialog` — so the override has
    // to undo the cross-axis centring too, or the title sits in the middle of a left-aligned box.
    expect(dialog).toMatch(/align-items:\s*stretch/)
  })

  it('pushes the two buttons to the right', () => {
    expect(ruleFor('.leave-without-saving-actions')).toMatch(/justify-content:\s*flex-end/)
  })

  /** Two of the same button, and the one that leaves is second — so it is the one on the right. */
  it('offers two outlined buttons, with the leaving action last', () => {
    render(<LeaveWithoutSaving site="test" what="Nothing is saved." onStay={() => {}} onLeave={() => {}} />)
    const stay = screen.getByTestId('test-leave-stay')
    const leave = screen.getByTestId('test-leave-confirm')
    expect(stay.className).toContain('ctrl-btn')
    expect(leave.className).toContain('ctrl-btn')
    // Neither is filled: the difference between them is the fail colour on the border and the
    // text, which is the mark `Delete` already carries.
    expect(ruleFor('.leave-without-saving-confirm:not(:disabled)')).not.toMatch(/background/)
    expect(stay.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
