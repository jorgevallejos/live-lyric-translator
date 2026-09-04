/**
 * **WHAT TO DO WITH A `window.open` FROM A HOSTED TOOL, AS A DECISION RATHER THAN A SIDE EFFECT.**
 *
 * ## Why this is its own file with its own test
 *
 * Muralista's `Open output window` reported a refusal **twice**. The first time (`v0.55.0`) the
 * refusal was Chrome's fault in the copy and Pregonero's in fact: the main window's
 * `setWindowOpenHandler` denied everything but the projection window. That round taught the handler
 * to recognise the tool server's own URL and open a window for it — **and still returned
 * `{ action: 'deny' }`.**
 *
 * **So Pregonero opened the window and told the frame it had refused, in the same breath.**
 * `window.open()` returns `null` on a denied request, Muralista's `if (win)` failed, and it alerted.
 * Measured in Electron 41 before the fix: two BrowserWindows existed, one of them the output, and
 * the page still said it had been refused.
 *
 * **And a second symptom nobody connected to it**: with `null` back, Muralista held no reference, so
 * `closeOutputWindow` had nothing to close and *entering `2 OUTPUT` closes the output window* — a
 * shipped, tested ruling — never once worked.
 *
 * ## What the test has to be about
 *
 * A unit test that renders the button passes in both worlds. **The fact that decides the outcome is
 * the ACTION**, so that is what this returns and what is asserted. The window still has to be
 * looked at in a real Electron once — `CLAUDE.md`'s rule about main-process code — but the
 * regression this has now had twice is a decision, and a decision can be tested.
 */

/**
 * Whether a URL is one this process is serving, compared against the port the tool server actually
 * bound to. Never a loose match: the frame may ask for a window on the page it is already showing,
 * and for nothing else on the machine.
 */
function isToolServerUrl(candidate, port) {
  if (!port) return false
  try {
    const u = new URL(candidate)
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.port === String(port)
  } catch {
    return false
  }
}

/**
 * The decision for one `window.open`.
 *
 * - The projection window is **denied and built here**, because it is Pregonero's own window on
 *   Pregonero's own renderer and it goes on the projector by rules the opener knows nothing about.
 * - A hosted tool's window is **allowed**, so Chromium creates it *and hands the opener a handle*.
 *   Options are overridden rather than inherited: no preload, no Node, a black ground because what
 *   lands in it paints a wall.
 * - Everything else is denied, and that is the default rather than a branch.
 */
function toolWindowOpenDecision(url, port) {
  if (typeof url === 'string' && url.includes('#/projection')) {
    return { action: 'deny', projection: true }
  }
  if (isToolServerUrl(url, port)) {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1280,
        height: 720,
        backgroundColor: '#000000',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      },
    }
  }
  return { action: 'deny' }
}

module.exports = { toolWindowOpenDecision, isToolServerUrl }
