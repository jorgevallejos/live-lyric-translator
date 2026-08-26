/**
 * The debrief's answers and whether its panel is showing, both for this session only.
 *
 * **It must not be modal and must not take over the screen.** A repeat happens *after* the setlist
 * ends, so a blocking debrief would land exactly on the moment the app has to honour a request. It
 * surfaces as *available*, is dismissable, and can be reopened — which is what the two flags here
 * are for, and why "dismissed" is remembered rather than "never shown again".
 */

import { useCallback, useEffect, useState } from 'react'
import { EMPTY_ANSWERS, type DebriefAnswers } from './debrief'

const KEY_ANSWERS = 'pregoneroDebriefAnswers'
const KEY_OPEN = 'pregoneroDebriefOpen'

function storage(): Storage | undefined {
  return typeof sessionStorage !== 'undefined' ? sessionStorage : undefined
}

export function getDebriefAnswers(): DebriefAnswers {
  const s = storage()
  if (!s) return EMPTY_ANSWERS
  const raw = s.getItem(KEY_ANSWERS)
  if (!raw) return EMPTY_ANSWERS
  try {
    const parsed = JSON.parse(raw) as Partial<DebriefAnswers>
    return {
      fullness: parsed.fullness ?? null,
      bestSongId: typeof parsed.bestSongId === 'string' ? parsed.bestSongId : null,
      worstSongId: typeof parsed.worstSongId === 'string' ? parsed.worstSongId : null,
      changeNextTime: typeof parsed.changeNextTime === 'string' ? parsed.changeNextTime : '',
    }
  } catch {
    return EMPTY_ANSWERS
  }
}

export function setDebriefAnswers(answers: DebriefAnswers): void {
  storage()?.setItem(KEY_ANSWERS, JSON.stringify(answers))
}

/**
 * Whether the panel has ever been offered this session.
 *
 * **Absent is not the same as dismissed**, and that distinction is the whole of it: without it the
 * panel either never opens on its own, or reopens every render after he has said Later.
 */
export function hasDebriefBeenOffered(): boolean {
  return storage()?.getItem(KEY_OPEN) !== null
}

/** Whether the panel is showing. Dismissing it sets this false; it can always be set true again. */
export function getDebriefOpen(): boolean {
  return storage()?.getItem(KEY_OPEN) === '1'
}

export function setDebriefOpen(open: boolean): void {
  storage()?.setItem(KEY_OPEN, open ? '1' : '0')
}

export function useDebriefState(): {
  answers: DebriefAnswers
  setAnswers: (next: DebriefAnswers) => void
  open: boolean
  setOpen: (open: boolean) => void
  offered: boolean
} {
  const [answers, setAnswersState] = useState<DebriefAnswers>(getDebriefAnswers)
  const [open, setOpenState] = useState(getDebriefOpen)
  const [offered, setOffered] = useState(hasDebriefBeenOffered)

  useEffect(() => {
    const onStorage = () => {
      setAnswersState(getDebriefAnswers())
      setOpenState(getDebriefOpen())
      setOffered(hasDebriefBeenOffered())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setAnswers = useCallback((next: DebriefAnswers) => {
    setDebriefAnswers(next)
    setAnswersState(next)
  }, [])

  const setOpen = useCallback((next: boolean) => {
    setDebriefOpen(next)
    setOpenState(next)
    setOffered(true)
  }, [])

  return { answers, setAnswers, open, setOpen, offered }
}
