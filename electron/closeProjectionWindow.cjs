/**
 * Projection close lifecycle states.
 * idle -> exiting-fullscreen -> closing -> closed
 */
const ProjectionCloseState = {
  IDLE: 'idle',
  EXITING_FULLSCREEN: 'exiting-fullscreen',
  CLOSING: 'closing',
  CLOSED: 'closed',
}

const LEAVE_FULLSCREEN_CLOSE_DELAY_MS = 400
const projectionCloseStates = new WeakMap()

function ensureCloseState(win) {
  const existing = projectionCloseStates.get(win)
  if (existing) return existing

  const state = {
    phase: ProjectionCloseState.IDLE,
    closeDelayTimer: null,
  }

  win.once('closed', () => {
    state.phase = ProjectionCloseState.CLOSED
    if (state.closeDelayTimer != null) {
      clearTimeout(state.closeDelayTimer)
      state.closeDelayTimer = null
    }
  })

  projectionCloseStates.set(win, state)
  return state
}

function requestNativeClose(win, state, options) {
  if (win.isDestroyed()) return
  state.phase = ProjectionCloseState.CLOSING
  if (options && typeof options.beforeNativeClose === 'function') {
    options.beforeNativeClose(win)
  }
  win.close()
}

function scheduleCloseAfterLeaveFullscreen(win, state, options) {
  if (state.phase !== ProjectionCloseState.EXITING_FULLSCREEN) return
  if (state.closeDelayTimer != null) clearTimeout(state.closeDelayTimer)

  state.closeDelayTimer = setTimeout(() => {
    state.closeDelayTimer = null
    requestNativeClose(win, state, options)
  }, LEAVE_FULLSCREEN_CLOSE_DELAY_MS)
}

/**
 * Single public path for projection window teardown.
 * @param {import('electron').BrowserWindow | null} win
 * @param {{ beforeNativeClose?: (win: import('electron').BrowserWindow) => void }} [options]
 */
function safeCloseProjectionWindow(win, options) {
  if (win == null || win.isDestroyed()) return

  const state = ensureCloseState(win)
  if (
    state.phase === ProjectionCloseState.EXITING_FULLSCREEN ||
    state.phase === ProjectionCloseState.CLOSING ||
    state.phase === ProjectionCloseState.CLOSED
  ) {
    return
  }

  if (win.isFullScreen()) {
    state.phase = ProjectionCloseState.EXITING_FULLSCREEN
    win.once('leave-full-screen', () => {
      scheduleCloseAfterLeaveFullscreen(win, state, options)
    })
    win.setFullScreen(false)
    return
  }

  requestNativeClose(win, state, options)
}

module.exports = { safeCloseProjectionWindow }
