/**
 * **The contract between Muralista's boundary and Pregonero's rendering.**
 *
 * *Muralista tunes against the worst case and emits a boundary; Pregonero renders the real lyrics
 * inside that boundary* (Jorge, 2026-08-27). Muralista never reads song content — it previews with
 * a deliberately nasty stand-in and writes down a `maxSize` that is safe — and Pregonero executes
 * within those guidelines. **The relationship is not replication, so `shapeTextLayout.ts` is not
 * debt**, and this is deliberately a test rather than an extracted module.
 *
 * **What must agree is narrow, and it is exactly these two things:**
 *
 * 1. **The meaning of a size fraction.** `maxSize` is a fraction of the unit box, and the two sides
 *    have to turn it into the same number of pixels, or a `maxSize` tuned at the wall means
 *    something else on the night.
 * 2. **The quad-stretch correction.** Mapping a square box onto a wide quad fattens every letter;
 *    both sides take the same factor back out, or the text Muralista fitted is not the text
 *    Pregonero fits.
 *
 * The expectations below are Muralista's own numbers, read from `projects/muralista/mapper/mapper.js`
 * at `v1.4.0` — `TEXT_INSET`, `TEXT_MAX_SIZE_MIN/MAX`, `TEXT_ASPECT_MIN/MAX`,
 * `TEXT_WIDTH_FACTOR_MIN/MAX`, `quadEdgeLength`, `quadStretch`, `textLayoutBoxWidth`,
 * `textLayoutInsetX`, and `fitTextLayer`'s `maxPx = maxSize * UNIT_SIZE`. **A failure here means
 * the two have drifted, and the fix goes into whichever one moved away from the written rule.**
 */
import { describe, it, expect } from 'vitest'
import { UNIT_SIZE } from './vendor/warp.js'
import {
  ASPECT_MAX,
  ASPECT_MIN,
  MAX_SIZE_MAX,
  MAX_SIZE_MIN,
  quadStretch,
  readTextFields,
  TEXT_DEFAULTS,
  TEXT_INSET,
  TEXT_INSET_Y,
  textLayoutBoxWidth,
  textLayoutInsetX,
  TEXT_FONT_FAMILY,
  TEXT_FONT_WEIGHT,
  TEXT_LINE_HEIGHT,
  TEXT_OVERFLOW_WRAP,
} from './shapeTextLayout'
import type { Point } from './visualsFile'

/** Muralista's constants, transcribed. These are the values the boundary is expressed in. */
const MURALISTA = {
  TEXT_INSET: 0.06,
  TEXT_MAX_SIZE_MIN: 0.02,
  TEXT_MAX_SIZE_MAX: 0.6,
  TEXT_ASPECT_MIN: 0.5,
  TEXT_ASPECT_MAX: 2,
  TEXT_WIDTH_FACTOR_MIN: 0.05,
  TEXT_WIDTH_FACTOR_MAX: 20,
  DEFAULT_MAX_SIZE: 0.2,
  DEFAULT_ASPECT: 1,
  UNIT_SIZE: 1000,
}

/**
 * **`.layer-text-inner`, from `projects/muralista/mapper/mapper.css` at `v1.21.0`** — the element
 * Muralista fits its stand-in in, and therefore the rendering every `maxSize` on the wall was
 * measured against.
 */
const MURALISTA_FACE = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontWeight: 700,
  lineHeight: 1.15,
  overflowWrap: 'normal',
}

/** Muralista's own arithmetic, written out, so the comparison is against the rule and not the code. */
function muralistaBoxWidth(corners: Point[] | null, aspect: number, w: number, h: number): number {
  const edge = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot((bx - ax) * w, (by - ay) * h)
  let stretch = 1
  if (corners && corners.length === 4) {
    const [tl, tr, br, bl] = corners as [Point, Point, Point, Point]
    const horizontal = (edge(tl, tr) + edge(bl, br)) / 2
    const vertical = (edge(tl, bl) + edge(tr, br)) / 2
    stretch = horizontal > 0 && vertical > 0 ? horizontal / vertical : 1
  }
  const raw = stretch / aspect
  const k =
    !isFinite(raw) || raw <= 0
      ? 1
      : Math.min(MURALISTA.TEXT_WIDTH_FACTOR_MAX, Math.max(MURALISTA.TEXT_WIDTH_FACTOR_MIN, raw))
  return Math.max(1, Math.round(MURALISTA.UNIT_SIZE * k))
}

/** The unit square, and four quads with real geometry in them. */
const QUADS: { name: string; corners: Point[]; w: number; h: number }[] = [
  {
    name: 'the unit square on a 1920x1080 projector',
    corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
    w: 1920,
    h: 1080,
  },
  {
    name: 'a wide band across a back wall',
    corners: [[0.05, 0.6], [0.95, 0.6], [0.95, 0.8], [0.05, 0.8]],
    w: 1920,
    h: 1080,
  },
  {
    name: 'a tall panel beside a doorway',
    corners: [[0.1, 0.1], [0.28, 0.1], [0.28, 0.9], [0.1, 0.9]],
    w: 1920,
    h: 1080,
  },
  {
    name: 'a keystoned trapezoid, which is what an angled projector actually gives',
    corners: [[0.12, 0.2], [0.88, 0.14], [0.93, 0.82], [0.07, 0.76]],
    w: 1920,
    h: 1080,
  },
  {
    name: 'the same corners at a different output size — the venue is not the studio',
    corners: [[0.12, 0.2], [0.88, 0.14], [0.93, 0.82], [0.07, 0.76]],
    w: 1280,
    h: 800,
  },
]

describe('the meaning of a size fraction', () => {
  it('is a fraction of the unit box, and the unit box is 1000 on both sides', () => {
    expect(UNIT_SIZE).toBe(MURALISTA.UNIT_SIZE)
  })

  it('turns into the same pixels on both sides, across the whole range', () => {
    for (const maxSize of [0.02, 0.05, 0.1, 0.2, 0.35, 0.6]) {
      // Pregonero: `ShapeText`'s maxPx. Muralista: `fitTextLayer`'s maxPx.
      expect(maxSize * UNIT_SIZE).toBe(maxSize * MURALISTA.UNIT_SIZE)
    }
  })

  it('has the same default, so a shape that says nothing means the same thing on both sides', () => {
    expect(TEXT_DEFAULTS.maxSize).toBe(MURALISTA.DEFAULT_MAX_SIZE)
    expect(TEXT_DEFAULTS.aspect).toBe(MURALISTA.DEFAULT_ASPECT)
  })

  it('is clamped to the same range, so a hand-edited file cannot ask for a size that is not one', () => {
    expect(MAX_SIZE_MIN).toBe(MURALISTA.TEXT_MAX_SIZE_MIN)
    expect(MAX_SIZE_MAX).toBe(MURALISTA.TEXT_MAX_SIZE_MAX)
    expect(ASPECT_MIN).toBe(MURALISTA.TEXT_ASPECT_MIN)
    expect(ASPECT_MAX).toBe(MURALISTA.TEXT_ASPECT_MAX)
    expect(readTextFields({ maxSize: 99 }).maxSize).toBe(MURALISTA.TEXT_MAX_SIZE_MAX)
    expect(readTextFields({ maxSize: 0 }).maxSize).toBe(MURALISTA.TEXT_MAX_SIZE_MIN)
    expect(readTextFields({ aspect: 99 }).aspect).toBe(MURALISTA.TEXT_ASPECT_MAX)
  })

  it('measures its inset the same way, which is what makes the fitted box the same box', () => {
    expect(TEXT_INSET).toBe(MURALISTA.TEXT_INSET)
    expect(TEXT_INSET_Y).toBe(MURALISTA.TEXT_INSET * MURALISTA.UNIT_SIZE)
    for (const boxWidth of [1000, 1477, 613, 20000]) {
      expect(textLayoutInsetX(boxWidth)).toBe(Math.round(MURALISTA.TEXT_INSET * boxWidth))
    }
  })
})

describe('the quad-stretch correction, over known quads', () => {
  it.each(QUADS)('agrees with Muralista on $name', ({ corners, w, h }) => {
    for (const aspect of [0.5, 1, 1.5, 2]) {
      expect(textLayoutBoxWidth(corners, aspect, w, h)).toBe(
        muralistaBoxWidth(corners, aspect, w, h)
      )
    }
  })

  it('agrees on the values themselves, not only with itself', () => {
    // A band 0.9 wide by 0.2 tall on 1920x1080: 1728 px against 216 px, a stretch of 8.
    const band = QUADS[1]!
    expect(quadStretch(band.corners, band.w, band.h)).toBeCloseTo(8, 10)
    expect(textLayoutBoxWidth(band.corners, 1, band.w, band.h)).toBe(8000)
    // Aspect 2 halves the box, which counter-scaled back out paints letters twice as wide.
    expect(textLayoutBoxWidth(band.corners, 2, band.w, band.h)).toBe(4000)
  })

  it('agrees that a square quad on a 16:9 output is not square in pixels', () => {
    const square = QUADS[0]!
    // 1920 across, 1080 down: the unit square is stretched by 16/9, and text must not inherit it.
    expect(quadStretch(square.corners, square.w, square.h)).toBeCloseTo(1920 / 1080, 10)
    expect(textLayoutBoxWidth(square.corners, 1, square.w, square.h)).toBe(
      Math.round(UNIT_SIZE * (1920 / 1080))
    )
  })

  it('agrees on the clamps, at both ends', () => {
    const sliver: Point[] = [[0, 0], [0.001, 0], [0.001, 1], [0, 1]]
    expect(textLayoutBoxWidth(sliver, 1, 1920, 1080)).toBe(
      muralistaBoxWidth(sliver, 1, 1920, 1080)
    )
    expect(textLayoutBoxWidth(sliver, 1, 1920, 1080)).toBe(
      Math.round(UNIT_SIZE * MURALISTA.TEXT_WIDTH_FACTOR_MIN)
    )
    const ribbon: Point[] = [[0, 0], [1, 0], [1, 0.002], [0, 0.002]]
    expect(textLayoutBoxWidth(ribbon, 1, 1920, 1080)).toBe(
      Math.round(UNIT_SIZE * MURALISTA.TEXT_WIDTH_FACTOR_MAX)
    )
  })

  it('agrees that a degenerate quad corrects nothing rather than guessing', () => {
    const collapsed: Point[] = [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]]
    expect(quadStretch(collapsed, 1920, 1080)).toBe(1)
    expect(textLayoutBoxWidth(null, 1, 1920, 1080)).toBe(UNIT_SIZE)
  })
})

/**
 * **A third thing that must agree, and it was not agreeing** (found on the wall, 2026-09-06).
 *
 * *On the wall the lyrics are in the wrong face.* Pregonero set no face on the lyric at all, so it
 * inherited `.projection-screen`'s `'EB Garamond', Georgia, serif` at weight 600 from
 * `control.css` — **a serif at a lighter weight, rendering inside a boundary Muralista measured
 * for a bold sans.**
 *
 * **It belongs in this file rather than beside the other two by accident.** A boundary is a promise
 * about how much room a string needs, and two faces do not need the same room: a `maxSize` tuned at
 * the wall means something else on the night, and `worstCase.ts` measures the catalogue against the
 * stand-in on the same assumption. It is exactly the class of thing this contract exists for.
 *
 * **`overflow-wrap` is in here for a harder reason: it changes behaviour.** Muralista wraps on word
 * boundaries and lets the auto-fit shrink a word that cannot wrap. Pregonero had `break-word`,
 * which breaks the word — so `scrollWidth` never exceeded the box, the fit never shrank, and the
 * single long word `fitInBox` documents as *the case wrapping cannot help* was silently broken
 * across two lines instead.
 */
describe('the face the boundary was tuned in', () => {
  it('is the face Muralista fits in, not whatever the projection window inherits', () => {
    expect(TEXT_FONT_FAMILY).toBe(MURALISTA_FACE.fontFamily)
    expect(TEXT_FONT_WEIGHT).toBe(MURALISTA_FACE.fontWeight)
  })

  it('sets the line height the fit counts lines at', () => {
    expect(TEXT_LINE_HEIGHT).toBe(MURALISTA_FACE.lineHeight)
  })

  it('wraps on word boundaries, so a word that cannot wrap shrinks the line instead of breaking', () => {
    expect(TEXT_OVERFLOW_WRAP).toBe(MURALISTA_FACE.overflowWrap)
  })
})
