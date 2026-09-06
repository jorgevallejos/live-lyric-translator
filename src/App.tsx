/**
 * **TRAMOYA — THE SHELL, AND ITS ROUTER.**
 *
 * **The shell makes things, the player uses them** (Jorge, 2026-09-05). This file is the making
 * half: first run, Backstage, the song flow, the gig flow, Preferences — and the one seam where
 * it hands the screen to the player.
 *
 * ## The host seam, and it is one import
 *
 * `PlayerApp` is mounted here and nowhere else. **It is the only edge from the shell into the
 * player, and it is declared as such** in `productBoundary.ts` so a second one turns the boundary
 * test red. Today it is a component; **when the player becomes a framed page it becomes a URL**,
 * and this is the one line that changes.
 *
 * ## What stays on this side of it
 *
 * - **First run** — the deal, the artist's name, the folders. A standalone player would repeat the
 *   folders screen, which is why that screen is `SHARED` and these two are not.
 * - **The song library gate.** Hydration is the catalogue's, and the catalogue is made here. The
 *   player is handed a library that is already loaded, which is the shape a framed page needs
 *   anyway: it cannot hydrate from the host's memory.
 * - **The rooms where things are made**, each on its own hash.
 *
 * ## Why the hash and not a router library
 *
 * Unchanged from before the split: two windows are served by one bundle and told apart by their
 * hash, and the Projection window is a second `BrowserWindow` with no preload. A router that owned
 * history would be a second answer to which window this is.
 */
import { useEffect, useState } from 'react'
import { isPlayerRoute, ConcertSessionTimerRunner } from './PlayerApp'
import { PlayerFrame } from './PlayerFrame'
import {
  autoSelectFirstSongForActiveSetlist,
  ensureSongLibraryHydrated,
  getOrderedSongsForActiveSetlist,
  isLibraryHydrated,
  loadSetlistStore,
} from './setlistStore'
import { getCurrentSongId, getSongLines } from './songState'
import { refreshGigReadiness } from './gigSession'
import { GigFlowView } from './GigFlowView'
import { GigView } from './GigView'
import { FoldersView } from './FoldersView'
import { SetupHomeView } from './SetupHomeView'
import { SongFlowView } from './SongFlowView'
import { FirstRunView } from './FirstRunView'
import { AppDealView, isDealDue } from './AppDealView'
import { ArtistNameView, isArtistNameDue } from './ArtistNameView'
import { hasRequiredFolders } from './contentFolders'
import './control.css'

function App({ initialHash }: { initialHash?: string } = {}) {
  const [hash, setHash] = useState(() =>
    typeof initialHash === 'string' ? initialHash : window.location.hash
  )
  const isProjectionRoute = hash === '#/projection'
  const [songLibRetryKey, setSongLibRetryKey] = useState(0)
  const [songLibState, setSongLibState] = useState<'loading' | 'ready' | 'error'>(() => {
    const h = typeof initialHash === 'string' ? initialHash : window.location.hash
    if (h === '#/projection') return 'ready'
    if (typeof localStorage !== 'undefined' && isLibraryHydrated()) return 'ready'
    return 'loading'
  })
  const [songLibError, setSongLibError] = useState<string | null>(null)
  /**
   * **First run, and it is checked before anything on the control side renders.**
   *
   * Read once into state rather than on every render so that choosing the folders re-renders
   * through `setFoldersReady` — and so a stale read cannot put the screen back after it is done.
   */
  const [foldersReady, setFoldersReady] = useState(hasRequiredFolders)
  /**
   * **The app's deal, and it is two screens rather than one flow** (2026-09-04).
   *
   * Read once into state, from the world — no folder answered means nothing has been offered here
   * yet. `Begin →` moves the screen on without anything having been answered, which is why the
   * press lives in React state and not on disk: **it is a transition, not a remembered
   * dismissal**, and a launch that ends on the deal is offered it again because the offer was
   * never taken.
   */
  const [dealDue, setDealDue] = useState(isDealDue)
  /**
   * **The artist's name, and it is the second of three screens** (Jorge, 2026-09-05).
   *
   * THE DEAL · WHO YOU ARE · YOUR FOLDERS. **Its own screen and not a third folder column**: the
   * folders screen answers *where your things are*, and a name is a different kind of question —
   * see `ArtistNameView`. Read from the world once, like the other two, so `Continue →` is a
   * transition rather than a remembered dismissal.
   */
  const [artistNameDue, setArtistNameDue] = useState(isArtistNameDue)

  useEffect(() => {
    if (isProjectionRoute) {
      setSongLibState('ready')
      setSongLibError(null)
      return
    }
    if (isLibraryHydrated()) {
      setSongLibState('ready')
      setSongLibError(null)
      return
    }
    setSongLibState('loading')
    setSongLibError(null)
    let cancelled = false
    ensureSongLibraryHydrated()
      .then(() => {
        if (!cancelled) {
          setSongLibState('ready')
          setSongLibError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSongLibState('error')
          setSongLibError(e instanceof Error ? e.message : 'Failed to load song library')
        }
      })
    return () => {
      cancelled = true
    }
  }, [isProjectionRoute, songLibRetryKey])

  // When Setup renders with an active setlist, auto-load its first song when no valid song is selected.
  useEffect(() => {
    if (window.location.hash === '#/projection') return
    if (hash !== '#/' || songLibState !== 'ready') return
    if (!sessionStorage.getItem('liveLyricLaunched')) {
      sessionStorage.setItem('liveLyricLaunched', '1')
    }
    const snapshot = loadSetlistStore()
    if (!snapshot || !snapshot.activeSetlistId) return
    const activeSongs = getOrderedSongsForActiveSetlist()
    const currentSongId = getCurrentSongId()
    const hasValidLoadedSong =
      currentSongId !== '' &&
      activeSongs.some((song) => song.id === currentSongId) &&
      getSongLines().length > 0
    if (!hasValidLoadedSong) {
      autoSelectFirstSongForActiveSetlist(snapshot)
    }
  }, [hash, songLibState])

  // **A gig re-checks its references whenever it is opened.** Arriving on the control screen is
  // that moment: songs are edited in Bombista and the room is mapped in Muralista, independently
  // of the gigs holding them, and nothing chases those gigs. Just-in-time on open is the whole
  // mechanism, and it is trivially not mid-song — which is why there is no file watcher here.
  useEffect(() => {
    if (hash !== '#/' || songLibState !== 'ready') return
    void refreshGigReadiness()
  }, [hash, songLibState])

  useEffect(() => {
    if (typeof initialHash === 'string') return
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [initialHash])

  // **The deal and then the folder request replace the main screen, and come before every other
  // return.** Above the hydration screen deliberately: that one would otherwise flash first, and
  // "the first thing on screen is the deal" is the requirement. The Projection window is untouched
  // — it is a second window with no preload, and it has nothing to ask for.
  //
  // **No step bar joins them.** They are two screens, not a flow: the offer, and then the first
  // thing asked of you.
  if (!isProjectionRoute && (!foldersReady || artistNameDue)) {
    return (
      <>
        <ConcertSessionTimerRunner />
        {dealDue ? (
          <AppDealView onBegin={() => setDealDue(false)} />
        ) : artistNameDue ? (
          <ArtistNameView onDone={() => setArtistNameDue(false)} />
        ) : (
          <FirstRunView onDone={() => setFoldersReady(true)} />
        )}
      </>
    )
  }

  if (!isProjectionRoute && songLibState === 'loading') {
    return (
      <>
        <ConcertSessionTimerRunner />
        <div className="app-loading" data-testid="song-library-loading" aria-busy="true">
          Loading…
        </div>
      </>
    )
  }
  if (!isProjectionRoute && songLibState === 'error') {
    return (
      <>
        <ConcertSessionTimerRunner />
        <div className="app-hydrate-error" role="alert" data-testid="song-library-error">
          <p>{songLibError}</p>
          <button type="button" onClick={() => setSongLibRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </>
    )
  }

  if (hash === '#/setup') return <SetupHomeView />
  if (hash === '#/song') return <SongFlowView />
  // **`#/gig` is the gig flow** (2026-09-02, journey-setup step 9): four screens with a step bar
  // shaped like Bombista's, so the two flows in this app read as the same kind of thing. One door
  // for a gig being made and a gig being opened — the defect this round opened by fixing was one
  // control meaning two things depending on how deep you are.
  if (hash === '#/gig') return <GigFlowView />
  // **The setup screen the flow has not replaced yet.** The flow's screens 3 and 4 — the visuals
  // and the check — are later steps and are not built, and this screen still owns both. It is not
  // a second door into making a gig: it holds no `New gig` and no `Import`, and screen 2 of the
  // flow is the one place that points here. It goes when 3 and 4 land.
  if (hash === '#/gig/steps') return <GigView />
  if (hash === '#/preferences' || hash === '#/folders') return <FoldersView />

  /**
   * **THE HOST SEAM, AND IT IS A URL NOW** (2026-09-06). This file said it would be: *today it is
   * a component; when the player becomes a framed page it becomes a URL, and this is the one line
   * that changes.* `isPlayerRoute` was written for exactly this decision.
   *
   * **An unknown hash lands on Standby**, which is what the fallthrough always did and is the
   * right answer for a window whose address bar nobody can see.
   */
  void isPlayerRoute(hash)
  return <PlayerFrame hash={hash} />
}

export default App
