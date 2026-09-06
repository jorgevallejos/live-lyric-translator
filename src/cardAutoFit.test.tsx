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
import { ShapeIntro } from './ShapeIntro'

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
    render: () =>
      render(
        <ShapeContact
          fields={{
            logo: 'logo.png',
            url: 'changopepper.com',
            handle: '@changopepper',
            message: "If one person here writes, that's the night.",
          }}
          boxWidth={1466}
          testId="card"
        />
      ),
  },
  {
    name: 'the intro card',
    blockClass: 'intro-block',
    render: () =>
      render(
        <ShapeIntro
          parts={{ title: 'Tragedia de cerdo asado', annotation: 'Roast pig tragedy', tagline: 'A song about a pig.' }}
          boxWidth={1466}
          testId="card"
        />
      ),
  },
] as const

describe.each(CARDS)('$name', ({ blockClass, render: renderCard }) => {
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
    // A non-zero pixel measure that is not a function of `--t`. `min-width: 0` is a zero, not a
    // measure; `max(1px, calc(var(--t) * 0.06))` names `--t` and is a floor on it.
    const hasFixedPixels = (value: string): boolean =>
      !value.includes('var(--t)') &&
      [...value.matchAll(/([\d.]+)px/g)].some((m) => parseFloat(m[1]!) > 0)
    const raw = declarationsIn(block).filter(
      (d) => d.property !== '--t' && hasFixedPixels(d.value)
    )
    expect(
      raw.map((d) => `${d.where}: ${d.property}: ${d.value}`),
      'these do not move when the fit moves, so the card cannot shrink as one thing'
    ).toEqual([])
  })
})
