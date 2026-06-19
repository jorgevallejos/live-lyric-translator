import { useState, useEffect } from 'react'

export const KEY_END_CARD_VISIBLE = 'liveLyricEndCardVisible'

export function getEndCardVisible(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(KEY_END_CARD_VISIBLE) === '1'
}

export function setEndCardVisible(visible: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (visible) {
    localStorage.setItem(KEY_END_CARD_VISIBLE, '1')
  } else {
    localStorage.removeItem(KEY_END_CARD_VISIBLE)
  }
}

export function useEndCardState(): {
  visible: boolean
  show: () => void
  hide: () => void
  toggle: () => void
} {
  const [visible, setVisible] = useState(getEndCardVisible)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_END_CARD_VISIBLE || e.key === null) {
        setVisible(getEndCardVisible())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const show = () => {
    setEndCardVisible(true)
    setVisible(true)
  }

  const hide = () => {
    setEndCardVisible(false)
    setVisible(false)
  }

  const toggle = () => {
    const next = !getEndCardVisible()
    setEndCardVisible(next)
    setVisible(next)
  }

  return { visible, show, hide, toggle }
}
