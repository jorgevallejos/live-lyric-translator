/**
 * Closes the given projection window. If fullscreen, exits fullscreen first, then closes.
 * Does not clear any external ref; the window's 'closed' handler should set projectionWindow = null.
 * Uses a short fallback timeout so the window still closes if 'leave-full-screen' never fires.
 *
 * @param {import('electron').BrowserWindow | null} win
 */
function closeProjectionWindow(win) {
  if (win == null || win.isDestroyed()) return
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => {
      if (!win.isDestroyed()) win.close()
    })
    win.setFullScreen(false)
    const fallbackMs = 500
    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
    }, fallbackMs)
  } else {
    win.close()
  }
}

module.exports = { closeProjectionWindow }
