/**
 * Unit tests for closeProjectionWindow. Uses mocked window (no real Electron).
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { closeProjectionWindow } = require('./closeProjectionWindow.cjs')

function createMockWindow(overrides: {
  isDestroyed?: boolean
  isFullScreen?: boolean
} = {}) {
  const { isDestroyed = false, isFullScreen = false } = overrides
  const close = vi.fn()
  const setFullScreen = vi.fn()
  const listeners: Array<() => void> = []
  const once = vi.fn((_event: string, cb: () => void) => {
    listeners.push(cb)
  })
  return {
    isDestroyed: vi.fn(() => isDestroyed),
    isFullScreen: vi.fn(() => isFullScreen),
    setFullScreen,
    once,
    close,
    _emitLeaveFullScreen() {
      listeners.forEach((cb) => cb())
      listeners.length = 0
    },
  }
}

describe('closeProjectionWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Closing projection closes the window entirely', () => {
    it('when not fullscreen, calls close() once', () => {
      const win = createMockWindow({ isFullScreen: false })
      closeProjectionWindow(win as any)
      expect(win.close).toHaveBeenCalledTimes(1)
      expect(win.setFullScreen).not.toHaveBeenCalled()
    })

    it('when fullscreen, exits fullscreen then closes (on leave-full-screen)', () => {
      const win = createMockWindow({ isFullScreen: true })
      closeProjectionWindow(win as any)
      expect(win.setFullScreen).toHaveBeenCalledWith(false)
      expect(win.close).not.toHaveBeenCalled()
      win._emitLeaveFullScreen()
      expect(win.close).toHaveBeenCalledTimes(1)
    })
  })

  describe('2. If projection window is fullscreen, it exits fullscreen before closing', () => {
    it('calls setFullScreen(false) before close when fullscreen', () => {
      const win = createMockWindow({ isFullScreen: true })
      closeProjectionWindow(win as any)
      expect(win.setFullScreen).toHaveBeenCalledWith(false)
      win._emitLeaveFullScreen()
      expect(win.close).toHaveBeenCalledTimes(1)
    })
  })

  describe('3. No-op when window is null or destroyed', () => {
    it('does nothing when win is null', () => {
      closeProjectionWindow(null)
      // No throw, no calls (we can't assert on a null mock, so we just ensure no throw)
    })

    it('does nothing when win is destroyed', () => {
      const win = createMockWindow({ isDestroyed: true })
      closeProjectionWindow(win as any)
      expect(win.close).not.toHaveBeenCalled()
      expect(win.setFullScreen).not.toHaveBeenCalled()
      expect(win.once).not.toHaveBeenCalled()
    })
  })

  describe('4. Fullscreen: does not close if already destroyed when leave-full-screen fires', () => {
    it('does not call close() in leave-full-screen callback if window was destroyed', () => {
      const win = createMockWindow({ isFullScreen: true })
      closeProjectionWindow(win as any)
      win.isDestroyed.mockReturnValue(true)
      win._emitLeaveFullScreen()
      expect(win.close).not.toHaveBeenCalled()
    })
  })

  describe('5. Fullscreen fallback: closes window if leave-full-screen never fires', () => {
    it('calls close() after fallback timeout when leave-full-screen is never emitted', async () => {
      const win = createMockWindow({ isFullScreen: true })
      vi.useFakeTimers()
      closeProjectionWindow(win as any)
      expect(win.close).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(500)
      expect(win.close).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })
  })
})
