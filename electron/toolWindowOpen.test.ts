/**
 * **THE TEST THAT WOULD HAVE CAUGHT IT, AND THE ONE THAT DID NOT EXIST TWICE.**
 *
 * Muralista's `Open output window` reported a refusal on two separate walks. The second time,
 * `v0.55.0`'s fix was already in: the handler recognised the tool server's URL and opened a window
 * for it — **and returned `deny` anyway**, so `window.open()` handed the frame `null` and the page
 * said it had been refused while the window sat behind it.
 *
 * **Every existing test passed both times**, because they render a button. The fact that decides
 * what a person sees is the ACTION the handler returns, so that is what is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { toolWindowOpenDecision, isToolServerUrl } = require_('./toolWindowOpen.cjs')

const PORT = 54321
const TOOL = `http://127.0.0.1:${PORT}/muralista/mapper.html?output&v=7`

describe('what happens to a hosted tool’s window.open', () => {
  /**
   * **`allow`, and the whole regression is in this one word.** `deny` opens nothing the opener can
   * see: the frame gets `null`, reports a refusal, and holds no handle — which is also why
   * *entering `2 OUTPUT` closes the output window* never worked.
   */
  it('ALLOWS a window on the page the tool server is already serving', () => {
    expect(toolWindowOpenDecision(TOOL, PORT).action).toBe('allow')
  })

  it('overrides the new window’s options rather than inheriting them', () => {
    const decision = toolWindowOpenDecision(TOOL, PORT)
    expect(decision.overrideBrowserWindowOptions?.webPreferences).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
    })
  })

  /** Pregonero's own projection window is built here, by rules the opener knows nothing about. */
  it('denies the projection URL, and marks it as the one it builds itself', () => {
    const decision = toolWindowOpenDecision('file:///app/index.html#/projection', PORT)
    expect(decision.action).toBe('deny')
    expect(decision.projection).toBe(true)
  })

  /** **Everything else is denied, and that is the default rather than a branch.** */
  it.each([
    ['a different port', 'http://127.0.0.1:9999/muralista/mapper.html'],
    ['a different host', 'http://example.com/muralista/mapper.html'],
    ['https on the right port', `https://127.0.0.1:${PORT}/muralista/mapper.html`],
    ['localhost by name, not by number', `http://localhost:${PORT}/muralista/mapper.html`],
    ['not a URL at all', 'javascript:alert(1)'],
  ])('denies %s', (_why, url) => {
    expect(toolWindowOpenDecision(url, PORT).action).toBe('deny')
  })

  /** With no server bound there is no port to match, so nothing is a tool URL. */
  it('denies everything while the tool server is not listening', () => {
    expect(toolWindowOpenDecision(TOOL, null).action).toBe('deny')
    expect(isToolServerUrl(TOOL, null)).toBe(false)
  })
})
