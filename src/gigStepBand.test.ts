/**
 * **The pinned step band, and the two things a Bombista round learned the hard way** (2026-09-02).
 *
 * The rule is in `tramoya-integration/project-context.md`: **in an embedded subflow the step bar is
 * fixed and everything else scrolls.** The gig flow's own bar follows it, and the setlist screen is
 * where it bites — two long lists, and *where am I* would otherwise depend on scroll position.
 *
 * Two things that round paid for, both asserted here because both fail silently:
 *
 * - **Pin a full-width band, not the bar itself.** `.gig-steps` is `width: max-content`, so pinning
 *   it directly leaves the page scrolling through the gap beside it. That half-works, and
 *   half-working is worse than not doing it.
 * - **A second sticky surface is offset below the band, and the offset is derived from the band's
 *   own declarations, never measured.** A guess there was nine pixels out and invisible except on a
 *   scrolled page.
 *
 * These read the stylesheet as text rather than through a layout engine: jsdom computes no layout,
 * so what is checkable is that the rules say what they must say — and what the round lost was in
 * exactly that, a number typed rather than derived.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'control.css'), 'utf8')
/** The same stylesheet with its comments gone, for counting declarations rather than prose. */
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The declaration block of the first rule whose selector list contains `selector`. */
function ruleFor(selector: string): string {
  const at = css.indexOf(selector)
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('the gig flow’s step band', () => {
  it('pins the band, and the band is full width', () => {
    const band = ruleFor('.gig-stepband {')
    expect(band).toMatch(/position:\s*sticky/)
    expect(band).toMatch(/top:\s*0/)
    // Opaque, or the page scrolls through it.
    expect(band).toMatch(/background:\s*var\(--app-bg\)/)
    // The screen's own 1.5rem inline padding cancelled and re-added, so it reaches both edges.
    expect(band).toMatch(/margin-inline:\s*-1\.5rem/)
    expect(band).toMatch(/padding:[^;]*1\.5rem/)
  })

  it('does not pin the bar itself, which is max-content and would leave a gap', () => {
    const bar = ruleFor('.gig-steps {')
    expect(bar).toMatch(/width:\s*max-content/)
    expect(bar).not.toMatch(/position:\s*sticky/)
  })

  /**
   * **The band's height is the sum of the band's own declarations.** Every term below is the same
   * custom property a rule further down uses, so changing any of them moves the offset with it; a
   * copied number would not.
   */
  it('derives its height from the declarations that produce it, never from a measurement', () => {
    const screen = ruleFor('.gig-flow-screen {')
    const band = ruleFor('.gig-stepband {')
    const seg = ruleFor('.gig-step-seg,\n.gig-step-later {')

    // The four terms, declared once.
    for (const name of ['--gig-band-pad-top', '--gig-band-pad-bottom', '--gig-seg-pad-block', '--gig-seg-text']) {
      expect(screen).toContain(`${name}:`)
    }
    // The band's padding IS the two band terms.
    expect(band).toMatch(/padding:\s*var\(--gig-band-pad-top\)[^;]*var\(--gig-band-pad-bottom\)/)
    // The segment's block padding and its text size ARE the other two, with `line-height: 1` so the
    // text box is exactly the font size and the sum is exact.
    expect(seg).toMatch(/padding:\s*var\(--gig-seg-pad-block\)/)
    expect(seg).toMatch(/font-size:\s*var\(--gig-seg-text\)/)
    expect(seg).toMatch(/line-height:\s*1\b/)

    // And the sum itself: both band paddings, the segment's padding twice, its text, and the bar's
    // two 1px borders. Nothing in it is a bare number that somebody typed.
    const sum = /--gig-stepband:\s*calc\(([\s\S]*?)\);/.exec(screen)?.[1]
    expect(sum, 'no --gig-stepband calc').toBeTruthy()
    const terms = sum!.split('+').map((t) => t.trim())
    expect(terms.sort()).toEqual(
      [
        '2px',
        'var(--gig-band-pad-bottom)',
        'var(--gig-band-pad-top)',
        'var(--gig-seg-pad-block)',
        'var(--gig-seg-pad-block)',
        'var(--gig-seg-text)',
      ].sort()
    )
  })

  /**
   * **`rem` and the UI scale, never `em`.** A custom property substitutes its text at the point of
   * USE, so an `em` in the sum would resolve against whichever element reads it — and the element
   * that reads it is a heading with its own font size.
   */
  it('states the terms in units that mean the same thing wherever they are read', () => {
    const screen = ruleFor('.gig-flow-screen {')
    const terms = screen.match(/--gig-(band|seg|stepband)[^;]*;/g) ?? []
    expect(terms.length).toBeGreaterThan(0)
    for (const term of terms) {
      expect(term, `${term} must not use em`).not.toMatch(/\dem\b/)
    }
    expect(screen).toMatch(/var\(--control-ui-scale\)/)
  })

  /**
   * **The second sticky surface is offset below the band rather than refused.** Two sticky things
   * at `top: 0` overlap, and the one that loses is the one that says where you are.
   */
  it('offsets the list headings below the band, by the band’s own variable', () => {
    const name = ruleFor('.gig-flow-list-name {')
    expect(name).toMatch(/position:\s*sticky/)
    expect(name).toMatch(/top:\s*var\(--gig-stepband\)/)
    // Opaque too, or the rows scroll through it.
    expect(name).toMatch(/background:\s*var\(--app-bg\)/)
    // And under the band, not over it.
    const band = ruleFor('.gig-stepband {')
    const bandZ = Number(/z-index:\s*(\d+)/.exec(band)?.[1])
    const nameZ = Number(/z-index:\s*(\d+)/.exec(name)?.[1])
    expect(nameZ).toBeLessThan(bandZ)
  })

  /** **Nothing else is pinned.** Not the top bar: two permanent bands where Bombista has one. */
  it('pins nothing else on the screen', () => {
    const sticky = declarations.match(/position:\s*sticky/g) ?? []
    expect(sticky.length).toBe(2)
  })
})
