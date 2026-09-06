/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function getSetlistGridRule(css: string): string {
  const match = css.match(/\.songs-screen:not\(\.languages-screen\)\s+\.songs-body\s*\{[\s\S]*?\}/)
  if (!match) {
    throw new Error('Setlist grid rule not found')
  }
  return match[0]
}

/**
 * **The setlist tile's own rule, anchored to the start of a line.**
 *
 * It used to match the first `.songs-song-btn {` anywhere in the file, which is a substring and
 * not a selector: on 2026-09-06 the performing view gave the same element a
 * `.performing-next-song-tile-wrap .songs-song-btn` rule and this helper started reading that one
 * instead. **A selector that is matched as a substring reads whichever rule is nearest the top.**
 */
function getSongTileRule(css: string): string {
  const match = css.match(/(?:^|\n)\.songs-song-btn\s*\{[\s\S]*?\}/)
  if (!match) {
    throw new Error('Song tile rule not found')
  }
  return match[0]
}

function getSongTileTitleRule(css: string): string {
  const match = css.match(/(?:^|\n)\.songs-song-title\s*\{[\s\S]*?\}/)
  if (!match) {
    throw new Error('Song tile title rule not found')
  }
  return match[0]
}

function getSetlistScreenRule(css: string): string {
  const match = css.match(/\.songs-screen:not\(\.languages-screen\)\s*\{[\s\S]*?\}/)
  if (!match) {
    throw new Error('Setlist screen rule not found')
  }
  return match[0]
}

describe('Setlist layout CSS', () => {
  it('uses full available width without centered max-width constraint', () => {
    const cssPath = resolve(__dirname, 'control.css')
    const css = readFileSync(cssPath, 'utf8')
    const gridRule = getSetlistGridRule(css)

    expect(gridRule).toContain('width: 100%')
    expect(gridRule).not.toMatch(/max-width\s*:\s*900px/)
    expect(gridRule).toContain('grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));')
  })

  it('keeps symmetric screen padding while grid still fills available width', () => {
    const cssPath = resolve(__dirname, 'control.css')
    const css = readFileSync(cssPath, 'utf8')
    const screenRule = getSetlistScreenRule(css)
    const gridRule = getSetlistGridRule(css)

    expect(screenRule).toContain('padding-inline: 1.5rem')
    expect(screenRule).toContain('box-sizing: border-box')
    expect(gridRule).toContain('width: 100%')
    expect(gridRule).toContain('box-sizing: border-box')
  })

  it('uses fixed song tile height with tighter explicit row/column spacing', () => {
    const cssPath = resolve(__dirname, 'control.css')
    const css = readFileSync(cssPath, 'utf8')
    const gridRule = getSetlistGridRule(css)
    const songTileRule = getSongTileRule(css)

    expect(gridRule).toContain('row-gap: 24px')
    expect(gridRule).toContain('column-gap: 32px')
    expect(songTileRule).toContain('height: 130px')
    expect(songTileRule).toContain('align-items: center')
    expect(songTileRule).toContain('justify-content: center')
    expect(songTileRule).toContain('white-space: normal')
  })

  it('clamps song tile titles to three lines with ellipsis overflow', () => {
    const cssPath = resolve(__dirname, 'control.css')
    const css = readFileSync(cssPath, 'utf8')
    const songTileTitleRule = getSongTileTitleRule(css)

    expect(songTileTitleRule).toContain('display: -webkit-box')
    expect(songTileTitleRule).toContain('-webkit-line-clamp: 3')
    expect(songTileTitleRule).toContain('-webkit-box-orient: vertical')
    expect(songTileTitleRule).toContain('overflow: hidden')
    expect(songTileTitleRule).toContain('text-align: center')
  })
})
