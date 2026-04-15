/**
 * Unit tests for safeCloseProjectionWindow. Uses mocked window (no real Electron).
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { safeCloseProjectionWindow } = require('./closeProjectionWindow.cjs')

function createMockWindow(overrides: {
  isDestroyed?: boolean
  isFullScreen?: boolean
} = {}) {
  const { isDestroyed = false, isFullScreen = false } = overrides
  let fullscreenState = isFullScreen
  const listeners = new Map<string, Array<() => void>>()
  const onceListeners = new Map<string, Array<() => void>>()

  const addListener = (store: Map<string, Array<() => void>>, event: string, cb: () => void) => {
    const next = store.get(event) ?? []
    next.push(cb)
    store.set(event, next)
  }

  const emit = (event: string) => {
    ;(listeners.get(event) ?? []).forEach((cb) => cb())
    ;(onceListeners.get(event) ?? []).forEach((cb) => cb())
    onceListeners.delete(event)
  }

  return {
    isDestroyed: vi.fn(() => isDestroyed),
    isFullScreen: vi.fn(() => fullscreenState),
    setFullScreen: vi.fn((next) => {
      if (next === false) {
        fullscreenState = false
      }
    }),
    close: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => addListener(listeners, event, cb)),
    once: vi.fn((event: string, cb: () => void) => addListener(onceListeners, event, cb)),
    _emit: emit,
  }
}

describe('safeCloseProjectionWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a no-op when win is null or destroyed', () => {
    safeCloseProjectionWindow(null)
    const win = createMockWindow({ isDestroyed: true })
    safeCloseProjectionWindow(win as any)
    expect(win.setFullScreen).not.toHaveBeenCalled()
    expect(win.close).not.toHaveBeenCalled()
  })

  it('closes immediately when not fullscreen', () => {
    const win = createMockWindow({ isFullScreen: false })
    safeCloseProjectionWindow(win as any)
    expect(win.close).toHaveBeenCalledTimes(1)
    expect(win.setFullScreen).not.toHaveBeenCalled()
  })

  it('exits fullscreen first, then closes after leave-full-screen + delay', async () => {
    vi.useFakeTimers()
    const win = createMockWindow({ isFullScreen: true })
    safeCloseProjectionWindow(win as any)
    expect(win.setFullScreen).toHaveBeenCalledWith(false)
    expect(win.close).not.toHaveBeenCalled()

    win._emit('leave-full-screen')
    await vi.advanceTimersByTimeAsync(399)
    expect(win.close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('ignores close requests while exiting fullscreen', async () => {
    vi.useFakeTimers()
    const win = createMockWindow({ isFullScreen: true })
    safeCloseProjectionWindow(win as any)
    safeCloseProjectionWindow(win as any)
    expect(win.setFullScreen).toHaveBeenCalledTimes(1)

    win._emit('leave-full-screen')
    await vi.advanceTimersByTimeAsync(400)
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('ignores close requests while already closing', () => {
    const win = createMockWindow({ isFullScreen: false })
    safeCloseProjectionWindow(win as any)
    safeCloseProjectionWindow(win as any)
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('ignores close requests after window is closed', () => {
    const win = createMockWindow({ isFullScreen: false })
    safeCloseProjectionWindow(win as any)
    win._emit('closed')
    safeCloseProjectionWindow(win as any)
    expect(win.close).toHaveBeenCalledTimes(1)
  })
})
