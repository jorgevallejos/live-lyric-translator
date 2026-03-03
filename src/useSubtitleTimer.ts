import { useEffect, useState } from 'react'
import {
  getActiveLine,
  getSubtitleState,
  setSubtitleState,
  type SubtitleLine,
} from './subtitleState'

const TICK_MS = 50

export function useSubtitleTimer(): {
  running: boolean
  t: number
  activeLine: SubtitleLine | null
  startPause: () => void
  stop: () => void
} {
  const [state, setState] = useState(getSubtitleState)

  // Sync from localStorage when another window updates (storage event)
  useEffect(() => {
    const onStorage = () => setState(getSubtitleState())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Tick loop: advance t when running
  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => {
      const { running, t, lastTickTs } = getSubtitleState()
      if (!running) return
      const now = Date.now()
      const newT = t + (now - lastTickTs) / 1000
      setSubtitleState({ t: newT, lastTickTs: now })
      setState(getSubtitleState())
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state.running])

  const startPause = () => {
    const { running } = getSubtitleState()
    if (running) {
      setSubtitleState({ running: false })
    } else {
      const now = Date.now()
      setSubtitleState({ lastTickTs: now, running: true })
    }
    setState(getSubtitleState())
  }

  const stop = () => {
    setSubtitleState({ t: 0, lastTickTs: Date.now(), running: false })
    setState(getSubtitleState())
  }

  const activeLine = getActiveLine(state.t)
  return {
    running: state.running,
    t: state.t,
    activeLine,
    startPause,
    stop,
  }
}
