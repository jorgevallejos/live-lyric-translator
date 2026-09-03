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
 * ## The shape has dimensions, and the first pass proved why it must
 *
 * **The shape as first written named alignment and button style and nothing about size**
 * (2026-09-03). It was implemented exactly and the two dialogs still read as two apps on the walk.
 * Measured at 1280x900, before: Pregonero's box was **770px** against Bombista's **448**, its title
 * **24px** against **15.2**, its body **22.5px** against **13.44**, its buttons **56.25px** high
 * against **32**. *A shape that does not state its dimensions is not a shape.*
 *
 * **Bombista's compact box is the reference**, and `DIMENSIONS` below is `.ask`'s own table.
 * Bombista asserts the same numbers against its own stylesheet in `tests/test_pages.py`, so the two
 * cannot drift apart without one of them going red. **Neither test can see the other**, which is
 * why the numbers are written out on both sides rather than derived.
 *
 * The stylesheet is read as text and the `rem` resolved arithmetically, because jsdom computes no
 * layout. What went wrong was a rule saying the wrong thing, not a box measuring wrong — and the
 * rendered pixels above were taken from a real browser, once, to write this table.
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

/**
 * **Bombista's `.ask` box, in pixels, at a 16px root** — which both apps have. Every entry was
 * measured off a real render, not read off a design.
 *
 * `rem` and not `em` is the whole fix on this side: `.songs-screen` sets
 * `font-size: calc(16px * var(--control-ui-scale))` = 24px, so every `em` in this dialog was 1.5x
 * Bombista's, which is exactly and only why the box was 1.7x too wide.
 */
const DIMENSIONS = {
  boxMaxWidth: 448,
  boxPadTop: 17.6,
  boxPadSide: 19.2,
  boxPadBottom: 16,
  titleFontSize: 15.2,
  bodyFontSize: 13.44,
  buttonHeight: 32,
  buttonPadSide: 17.6,
  buttonMinWidth: 104,
  buttonFontSize: 13.12,
}

/** `1.1rem` -> 17.6. The root is 16px and nothing on this dialog is allowed to be `em` any more. */
function rem(declaration: string, property: string): number {
  const found = new RegExp(`${property}\\s*:\\s*([^;]+)`).exec(declaration)
  expect(found, `no ${property}`).toBeTruthy()
  const value = found![1]!.trim()
  expect(value, `${property} is not in rem: ${value}`).toMatch(/rem/)
  return Math.round(parseFloat(value) * 16 * 100) / 100
}

/** Every rem length in a shorthand, in order. */
function rems(declaration: string, property: string): number[] {
  const found = new RegExp(`${property}\\s*:\\s*([^;]+)`).exec(declaration)
  expect(found, `no ${property}`).toBeTruthy()
  return found![1]!
    .trim()
    .split(/\s+/)
    .map((part) => (part === '0' ? 0 : Math.round(parseFloat(part) * 16 * 100) / 100))
}

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

/**
 * **The dimensions, measured rather than described** (Jorge, 2026-09-03, second pass).
 *
 * These are the five things the ruling named — box max-width, box padding, title font size, body
 * font size, button height and padding — plus the two that had to move for the five to mean
 * anything: `box-sizing`, and `rem` in place of `em`.
 */
describe('the consent dialog’s dimensions', () => {
  const box = () => ruleFor('.leave-without-saving')
  const button = () => ruleFor('.leave-without-saving-actions .ctrl-btn')

  /**
   * **`max-width` did not mean the same thing on the two sides.** Bombista sets `border-box`
   * globally; this dialog was `content-box`, so `28em` capped the CONTENT at 672 and the padding
   * and border added 98 on top. Both apps agreed on `28` and rendered 448 against 770.
   */
  it('measures its box the way Bombista measures its own', () => {
    expect(box()).toMatch(/box-sizing:\s*border-box/)
    expect(rem(box(), 'max-width')).toBe(DIMENSIONS.boxMaxWidth)
  })

  it('has Bombista’s padding, to the tenth of a pixel', () => {
    expect(rems(box(), 'padding')).toEqual([
      DIMENSIONS.boxPadTop,
      DIMENSIONS.boxPadSide,
      DIMENSIONS.boxPadBottom,
    ])
  })

  it('sets the title and the body text at Bombista’s sizes', () => {
    const title = ruleFor('.leave-without-saving .ctrl-timeline-save-message')
    const body = ruleFor('.leave-without-saving .leave-without-saving-what')
    expect(rem(title, 'font-size')).toBe(DIMENSIONS.titleFontSize)
    expect(rem(body, 'font-size')).toBe(DIMENSIONS.bodyFontSize)
    // 700, because the reference box's title is bold and a 15.2px title at 400 is a different
    // dialog wearing the same measurements.
    expect(title).toMatch(/font-weight:\s*700/)
  })

  it('sets the buttons at Bombista’s height, width and padding', () => {
    expect(rem(button(), 'height')).toBe(DIMENSIONS.buttonHeight)
    // `.ctrl-btn`'s own `min-height: 2.5em` would win on specificity and grow the button back.
    expect(rem(button(), 'min-height')).toBe(DIMENSIONS.buttonHeight)
    expect(rem(button(), 'min-width')).toBe(DIMENSIONS.buttonMinWidth)
    expect(rems(button(), 'padding')).toEqual([0, DIMENSIONS.buttonPadSide])
    expect(rem(button(), 'font-size')).toBe(DIMENSIONS.buttonFontSize)
  })

  /**
   * **The regression guard for the actual defect.** Nothing sized in this dialog may be `em`:
   * `em` resolves against `.songs-screen`'s 24px and silently reintroduces the 1.5x.
   */
  it('sizes nothing in em, because em here is the stage scale', () => {
    for (const rule of [
      box(),
      button(),
      ruleFor('.leave-without-saving .ctrl-timeline-save-message'),
      ruleFor('.leave-without-saving .leave-without-saving-what'),
      ruleFor('.leave-without-saving-actions'),
    ]) {
      expect(rule).not.toMatch(/\d\s*em\b/)
      expect(rule).not.toMatch(/[\d.]em[;\s]/)
    }
  })

  /**
   * **Scoped, because the delete-song dialog is explicitly not in this round.** It still carries
   * the old centred shape off `.ctrl-timeline-save-dialog`, which is known. If a rule here ever
   * stops naming `leave-without-saving`, it has started moving a dialog nobody asked to move.
   */
  it('moves this dialog and no other', () => {
    const shared = ruleFor('.ctrl-timeline-save-dialog')
    expect(shared).toMatch(/text-align:\s*center/)
    expect(shared).not.toMatch(/box-sizing/)
    expect(shared).toMatch(/max-width:\s*28em/)
  })
})
