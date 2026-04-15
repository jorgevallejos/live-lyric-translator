/**
 * Closes the given projection window. If fullscreen, exits fullscreen first, then closes.
 * Does not clear any external ref; the window's 'closed' handler should set projectionWindow = null.
 * Uses a short fallback timeout so the window still closes if 'leave-full-screen' never fires.
 *
 * @param {import('electron').BrowserWindow | null} win
 */
const closingProjectionWindows = new WeakSet()

function closeProjectionWindow(win) {
  if (win == null || win.isDestroyed()) return
  if (closingProjectionWindows.has(win)) return

  closingProjectionWindows.add(win)
  win.once('closed', () => {
    closingProjectionWindows.delete(win)
  })

  if (win.isFullScreen()) {
    let closeCalled = false
    let fallbackId = null

    const closeOnce = () => {
      if (closeCalled) return
      closeCalled = true
      if (fallbackId != null) {
        clearTimeout(fallbackId)
        fallbackId = null
      }
      if (!win.isDestroyed()) win.close()
    }

    if (win.isDestroyed()) {
      closingProjectionWindows.delete(win)
      return
    }

    win.once('leave-full-screen', () => {
      closeOnce()
    })
    win.setFullScreen(false)
    const fallbackMs = 500
    fallbackId = setTimeout(closeOnce, fallbackMs)
  } else {
    win.close()
  }
}

module.exports = { closeProjectionWindow }
