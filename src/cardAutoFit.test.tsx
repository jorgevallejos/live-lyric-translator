/** @vitest-environment jsdom */
/**
 * **THE TWO LOCKED CARDS SHRINK AS ONE THING, AND THE FIT HAS TO BE ABLE TO MOVE THEM**
 * (found on the wall, 2026-09-06).
 *
 * `ShapeIntro` and `ShapeContact` are the suite's two locked templates: no formatting controls,
 * every measure a multiple of one number `t`, so the whole card shrinks together and the
 * proportions survive at any size the shape lands on. `fitInBox` searches over `t` by calling
 * `apply(px)`, and **both cards passed an `apply` that set a custom property `--t` which nothing
 * read** — every size was written from the React state instead.
 *
 * **So the search measured one unchanging layout.** `fits()` was evaluated fourteen times against
 * the card as it stood at the maximum; if it did not fit there it did not fit anywhere, and the
 * search returned `TEXT_MIN_PX`. **The message home came out at 8px on a 590px-tall wall shape —
 * 3% of it** — while a lyric in the shape beside it fitted at 96% of its own maximum. The intro
 * card survived only because its content fits at the maximum, where `fitInBox` returns before the
 * search begins: **the same defect, one long title away from showing.**
 *
 * `fitInBox`'s own doc warned about exactly this shape of failure — *content that is simply tiny
 * is a silent, plausible-looking failure* — for the zero-width box. This is the other way in.
 *
 * **The rule, and it is what this file holds:** inside a card's block, **no measure is a raw
 * pixel**; every one is a function of `var(--t)`, which is the one thing the fit can move. The box
 * around the block is not covered — its width, height and padding are the shape, not the content.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ShapeContact } from './ShapeContact'
import { ShapeIntro, INTRO_INSET } from './ShapeIntro'
import { CARD_ASPECT } from './cardBox'
import { UNIT_SIZE } from './vendor/warp.js'

vi.mock('./mediaPathStore', () => ({
  resolveMediaPath: (src: string) => (src === 'logo.png' ? '/media/logo.png' : null),
  absolutePathToMediaUrl: (path: string) => `media://local${path}`,
}))

afterEach(cleanup)

/** Every inline declaration in the block and everything under it, element by element. */
function declarationsIn(block: HTMLElement): { where: string; property: string; value: string }[] {
  const found: { where: string; property: string; value: string }[] = []
  const walk = (el: HTMLElement) => {
    for (let i = 0; i < el.style.length; i++) {
      const property = el.style.item(i)
      found.push({
        where: el.className || el.tagName.toLowerCase(),
        property,
        value: el.style.getPropertyValue(property),
      })
    }
    for (const child of Array.from(el.children)) walk(child as HTMLElement)
  }
  walk(block)
  return found
}

const CARDS = [
  {
    name: 'the message home',
    blockClass: 'contact-block',
    renderAt: (boxWidth: number) =>
      render(
        <ShapeContact
          fields={{
            logo: 'logo.png',
            url: 'changopepper.com',
            handle: '@changopepper',
            message: "If one person here writes, that's the night.",
          }}
          boxWidth={boxWidth}
          testId="card"
        />
      ),
  },
  {
    name: 'the intro card',
    blockClass: 'intro-block',
    renderAt: (boxWidth: number) =>
      render(
        <ShapeIntro
          parts={{ title: 'Tragedia de cerdo asado', annotation: 'Roast pig tragedy', tagline: 'A song about a pig.' }}
          boxWidth={boxWidth}
          testId="card"
        />
      ),
  },
] as const

describe.each(CARDS)('$name', ({ blockClass, renderAt }) => {
  const renderCard = () => renderAt(1466)
  it('carries the number the fit searches over, on the element the fit measures', () => {
    // `fitInBox` is handed the block as `measured` and an `apply` that writes `--t`. **The same
    // element has to be the one the card is sized from**, or the search moves nothing.
    renderCard()
    const block = screen.getByTestId('card').querySelector(`.${blockClass}`) as HTMLElement
    expect(block, 'the block is missing').toBeTruthy()
    expect(block.style.getPropertyValue('--t')).toMatch(/^\d+(\.\d+)?px$/)
  })

  it('writes no measure as a raw pixel, so every part moves when the fit moves', () => {
    renderCard()
    const block = screen.getByTestId('card').querySelector(`.${blockClass}`) as HTMLElement
    // **Three properties, and everything inside is a function of one of them.** `--t` is the type
    // size, which the fit moves; `--card-w` and `--card-h` are the design box, which the shape
    // moves. A non-zero pixel measure naming none of them is a number that answers to nothing:
    // `min-width: 0` is a zero, not a measure, and `max(1px, calc(var(--card-w) * 0.006))` names
    // the box and is a floor on it.
    const hasFixedPixels = (value: string): boolean =>
      !/var\(--(t|card-w|card-h)\)/.test(value) &&
      [...value.matchAll(/([\d.]+)px/g)].some((m) => parseFloat(m[1]!) > 0)
    const raw = declarationsIn(block).filter(
      (d) => !['--t', '--card-w', '--card-h'].includes(d.property) && hasFixedPixels(d.value)
    )
    expect(
      raw.map((d) => `${d.where}: ${d.property}: ${d.value}`),
      'these do not move when the fit moves, so the card cannot shrink as one thing'
    ).toEqual([])
  })
})

/**
 * **THE CARDS SCALE, THEY NEVER STRETCH** (Jorge, 2026-09-06).
 *
 * *Both cards adjust to the size of the video frame or the song-lyrics shape, keep their
 * proportions, and never stretch.*
 *
 * **What they did instead.** The block was `width: 100%` of whatever box the shape gave it, and
 * `fitInBox` grew the type until the content filled that box's height. So the card took the quad's
 * proportions rather than its own: wide on a wide quad, tall on a tall one, and different in every
 * room. **The fit had no proportional lock** — one number searched against two independent
 * dimensions.
 *
 * **The lock is a design box.** The card is laid out in a box of its own fixed aspect, sized to the
 * largest that fits inside the shape's insets, and everything within is a fraction of it. The
 * layout is then *identical* at every shape size and only its scale changes — which is also what
 * makes *nothing crosses the rule* hold everywhere rather than at the sizes someone happened to
 * look at.
 *
 * **jsdom can see this and cannot see the boxes.** The design box is arithmetic on `boxWidth`, so
 * the aspect lock is checkable here; where the rendered boxes actually land is measured headless
 * against the real components at the real quad.
 */
describe.each(CARDS)('$name scales rather than stretching', ({ blockClass, renderAt }) => {
  const BOXES = [400, 700, 1000, 1466, 2400, 4000]

  it('lays the card out in a box of its own aspect, whatever shape it is given', () => {
    const ratios = BOXES.map((boxWidth) => {
      cleanup()
      renderAt(boxWidth)
      const block = screen.getByTestId('card').querySelector(`.${blockClass}`) as HTMLElement
      const w = parseFloat(block.style.getPropertyValue('--card-w'))
      const h = parseFloat(block.style.getPropertyValue('--card-h'))
      expect(w, `--card-w at boxWidth ${boxWidth}`).toBeGreaterThan(0)
      expect(h, `--card-h at boxWidth ${boxWidth}`).toBeGreaterThan(0)
      return Math.round((w / h) * 1000) / 1000
    })
    // One aspect, every shape. That is the whole of "keeps its proportions".
    expect(new Set(ratios).size, `ratios were ${ratios.join(', ')}`).toBe(1)
    expect(ratios[0]).toBe(CARD_ASPECT)
  })

  it('never lets the card exceed the room the shape gives it', () => {
    for (const boxWidth of BOXES) {
      cleanup()
      renderAt(boxWidth)
      const block = screen.getByTestId('card').querySelector(`.${blockClass}`) as HTMLElement
      const w = parseFloat(block.style.getPropertyValue('--card-w'))
      const h = parseFloat(block.style.getPropertyValue('--card-h'))
      const availW = boxWidth - 2 * Math.round(INTRO_INSET * boxWidth)
      const availH = UNIT_SIZE - 2 * Math.round(INTRO_INSET * UNIT_SIZE)
      expect(w, `--card-w at boxWidth ${boxWidth}`).toBeLessThanOrEqual(availW + 0.5)
      expect(h, `--card-h at boxWidth ${boxWidth}`).toBeLessThanOrEqual(availH + 0.5)
      // And it is the largest such box: one of the two dimensions is against its stop.
      expect(
        Math.abs(w - availW) < 0.5 || Math.abs(h - availH) < 0.5,
        `at boxWidth ${boxWidth} the card is ${w}x${h} in ${availW}x${availH} — neither axis is full`
      ).toBe(true)
    }
  })

  it('grows with the shape, so a bigger shape is a bigger card and not a roomier one', () => {
    const widths = [700, 1466, 2400].map((boxWidth) => {
      cleanup()
      renderAt(boxWidth)
      const block = screen.getByTestId('card').querySelector(`.${blockClass}`) as HTMLElement
      return parseFloat(block.style.getPropertyValue('--card-w'))
    })
    expect(widths[1]!).toBeGreaterThan(widths[0]!)
    expect(widths[2]!).toBeGreaterThanOrEqual(widths[1]!)
  })
})
