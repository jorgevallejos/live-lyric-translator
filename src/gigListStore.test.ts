import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  GIG_LIST_KEY,
  forgetGig,
  getGigList,
  rememberGigInList,
  replaceGigPath,
} from './gigListStore'
import { ensureStorage } from './testSupport/storage'

beforeAll(ensureStorage)
beforeEach(() => localStorage.clear())

describe('the gig list', () => {
  it('is empty before anything has been opened', () => {
    expect(getGigList()).toEqual([])
  })

  it('puts the most recently opened gig first', () => {
    rememberGigInList('/gigs/a')
    rememberGigInList('/gigs/b')
    expect(getGigList()).toEqual(['/gigs/b', '/gigs/a'])
  })

  it('moves a gig to the front rather than listing it twice', () => {
    rememberGigInList('/gigs/a')
    rememberGigInList('/gigs/b')
    rememberGigInList('/gigs/a')
    expect(getGigList()).toEqual(['/gigs/a', '/gigs/b'])
  })

  it('forgets one without touching the rest', () => {
    rememberGigInList('/gigs/a')
    rememberGigInList('/gigs/b')
    forgetGig('/gigs/a')
    expect(getGigList()).toEqual(['/gigs/b'])
  })

  it('repoints a row that has been located somewhere else, keeping its place', () => {
    // **Locate, not re-add.** A gig folder that moved is the same gig: adding the new path would
    // put it at the front and leave the dead row behind, which is two rows for one night.
    rememberGigInList('/gigs/a')
    rememberGigInList('/gigs/b')
    rememberGigInList('/gigs/c')
    replaceGigPath('/gigs/b', '/moved/b')
    expect(getGigList()).toEqual(['/gigs/c', '/moved/b', '/gigs/a'])
  })

  it('collapses a locate that lands on a gig already listed', () => {
    rememberGigInList('/gigs/a')
    rememberGigInList('/gigs/b')
    replaceGigPath('/gigs/b', '/gigs/a')
    expect(getGigList()).toEqual(['/gigs/a'])
  })

  it('ignores an empty path rather than storing a row that names nothing', () => {
    rememberGigInList('')
    rememberGigInList('   ')
    expect(getGigList()).toEqual([])
  })

  it('survives a stored value that is not a list of strings', () => {
    // The key is hand-editable and survives across versions. Unreadable means empty, never a
    // crash on the way to a screen the performer needs.
    for (const junk of ['{}', 'null', '[1,2]', 'not json', '["/gigs/a", 7]']) {
      localStorage.setItem(GIG_LIST_KEY, junk)
      expect(Array.isArray(getGigList())).toBe(true)
    }
  })

  it('keeps the good entries out of a partly bad list', () => {
    localStorage.setItem(GIG_LIST_KEY, '["/gigs/a", 7, "/gigs/b", ""]')
    expect(getGigList()).toEqual(['/gigs/a', '/gigs/b'])
  })

  it('is a bookmark list and not the open gig', () => {
    // The remembered open folder has its own key and its own meaning. Listing a gig is not opening
    // it, and opening one does not empty the list.
    rememberGigInList('/gigs/a')
    expect(localStorage.getItem('pregoneroGigFolder')).toBeNull()
  })
})
