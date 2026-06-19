import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  KEY_END_CARD_VISIBLE,
  getEndCardVisible,
  setEndCardVisible,
} from './endCardState'

describe('endCardState — pure functions', () => {
  let store: Storage & { _map?: Map<string, string> }

  beforeEach(() => {
    const map = new Map<string, string>()
    store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => { map.clear() },
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size },
      _map: map,
    }
    vi.stubGlobal('localStorage', store)
  })

  it('KEY_END_CARD_VISIBLE is a non-empty string', () => {
    expect(typeof KEY_END_CARD_VISIBLE).toBe('string')
    expect(KEY_END_CARD_VISIBLE.length).toBeGreaterThan(0)
  })

  it('getEndCardVisible returns false when localStorage has no entry', () => {
    expect(getEndCardVisible()).toBe(false)
  })

  it('setEndCardVisible(true) makes getEndCardVisible return true', () => {
    setEndCardVisible(true)
    expect(getEndCardVisible()).toBe(true)
  })

  it('setEndCardVisible(false) makes getEndCardVisible return false', () => {
    setEndCardVisible(true)
    setEndCardVisible(false)
    expect(getEndCardVisible()).toBe(false)
  })

  it('setEndCardVisible(false) removes the key rather than writing "0"', () => {
    setEndCardVisible(true)
    setEndCardVisible(false)
    expect(store._map!.has(KEY_END_CARD_VISIBLE)).toBe(false)
  })

  it('multiple set(true) calls are idempotent', () => {
    setEndCardVisible(true)
    setEndCardVisible(true)
    expect(getEndCardVisible()).toBe(true)
    expect(store._map!.get(KEY_END_CARD_VISIBLE)).toBe('1')
  })
})
