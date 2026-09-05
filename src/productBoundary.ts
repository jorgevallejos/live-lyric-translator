/**
 * **THE LINE BETWEEN THE TWO PRODUCTS, DECLARED SO IT CAN BE MEASURED** (2026-09-05).
 *
 * **The boundary is: the shell makes things, the player uses them.** Backstage, the song flow and
 * the gig flow make; Standby and the performing view use a finished gig. That ruling moved Standby
 * to the player's side on 2026-09-05 — a standalone player that cannot choose the song, set the
 * languages, open the projection and arm is not a player — and **arming is therefore not the
 * product boundary; it is a state inside the player.**
 *
 * ## Why this file exists rather than a sentence in a document
 *
 * **Standby moved to the player's side on the same day three rounds worked on Standby.** That is
 * precisely where a seam gets crossed unnoticed: a player screen reaching into shell state, found
 * only when someone tries to separate them. **So the boundary is made checkable rather than
 * promised**, in the family of the iframe allowlist and the `promote` canary — something that goes
 * red on the day the line is crossed rather than on the day someone tries to cross it.
 *
 * **Nothing here moved any code, and that was a refusal rather than a preference.** The rule for
 * the round that wrote this: if the graph is already clean the test lands green and the boundary is
 * real from tonight; **if it is not, report exactly what crosses and stop.** A refactor at 1am,
 * unattended, across a boundary drawn hours earlier, is the failure this was written to prevent.
 * The graph was clean in the direction that matters, and the two places it is not are named below
 * rather than tidied away.
 *
 * ## The four sets
 *
 * - **`PLAYER`** — Standby, the performing view, the projection window, the gig picker, and what
 *   only they use.
 * - **`SHELL`** — Backstage, the song flow, the gig flow, first run's own screens, and what only
 *   they use.
 * - **`SHARED`** — what belongs to neither product and both need: **the first-run folders screen**,
 *   which is the one surface the design names, plus **the files both products read** — `gig.json`,
 *   `visuals.json`, the catalogue, the song — and the platform layer under them. **A shell that
 *   makes a gig and a player that performs it are looking at the same file**; that is the contract,
 *   not a leak.
 * - **`UNSPLIT`** — `App.tsx` and `main.tsx`, and **nothing else, ever**. `App.tsx` is the router
 *   and it contains both products: Standby, the performing view and the projection window are
 *   defined in it, and it imports every one of the shell's screens to route to them. **It is the
 *   extraction's first work item and the whole of its known cost**, and the test pins the set at
 *   two names so it cannot grow while nobody is looking.
 *
 * ## What the measurement said, on the day it was written
 *
 * - **`PLAYER` imports nothing in `SHELL` and nothing in `UNSPLIT`.** That is the claim the design
 *   asked for, and it holds.
 * - **`SHELL` imports nothing in `PLAYER` either**, which is stronger than was asked and is worth
 *   keeping.
 * - **One crossing, and it is named rather than fixed:** `mediaSources.ts` reaches into
 *   `ShapeStatic.tsx` for `isStaticType`, a pure predicate that happens to live in a component
 *   file. A shared reader importing a player renderer is the wrong way round; moving the predicate
 *   is a one-line change and it was **deliberately not made**, because this round's rule was that
 *   nothing moves to make the test pass. It is pinned as the only permitted `SHARED → PLAYER` edge,
 *   so a second one turns the test red.
 *
 * ## The judgement calls, stated so they can be argued with
 *
 * **A green test is only worth what its classification is worth**, so the two entries that decide
 * the result are named here rather than left inside a list.
 *
 * - **`setlistStore.ts` is `SHARED`, and the design's own words make that arguable.** *The player
 *   receives a gig and never reaches into Backstage, Preferences or the catalogue* — and this
 *   module is the catalogue. **It is also the song library**, and a player has to read a song:
 *   the standalone ruling of 2026-09-05 has it resolving a song by its id against the answered
 *   catalogue, which is a read of exactly this. So the module holds both a shared read and shell-
 *   only management, and classifying it either way is wrong about half of it. **The player's whole
 *   use of it today is one symbol** — `getLibrarySongById`, in `useSongNavigation.ts` — which is
 *   the read half, so `SHARED` is the less wrong answer and this is where to look first if the
 *   split is ever attempted.
 * - **`gigSession.ts`, `gigReadiness.ts` and the gig list are `SHARED` for the same reason** and
 *   with less doubt: the shell writes `gig.json` and the player performs what it says. Two
 *   products reading one file is the contract, not a leak.
 */

/** Standby, the performing view, the projection window, the gig picker, and what only they use. */
export const PLAYER: readonly string[] = [
  'GigsView.tsx',
  'VideoPerformancePanel.tsx',
  'VideoControlPanel.tsx',
  'ShapeContact.tsx',
  'ShapeFill.tsx',
  'ShapeIntro.tsx',
  'ShapeRegion.tsx',
  'ShapeStatic.tsx',
  'ShapeText.tsx',
  'ShapeVideo.tsx',
  'BeatCircle.tsx',
  'BeatIndicator.tsx',
  'useBeatClock.ts',
  'useSongNavigation.ts',
  'useWebSocket.ts',
  'useOutputSize.ts',
  'useProjectionOpenState.ts',
  'useProjectionPlacement.ts',
  'useGigsExist.ts',
  'playedSongsState.ts',
  'performanceState.ts',
  'performanceControlStateMachine.ts',
  'autoAdvanceState.ts',
  'autoBlackout.ts',
  'concertSessionState.ts',
  'gigContactState.ts',
  'shapeTextLayout.ts',
  'videoCueLookup.ts',
  'videoTransport.ts',
  'navigationState.ts',
  'beatScheduler.ts',
  'screenSizeState.ts',
  'appVersion.ts',
]

/** Backstage, the song flow, the gig flow, first run's own screens, and what only they use. */
export const SHELL: readonly string[] = [
  'SetupHomeView.tsx',
  'GigFlowView.tsx',
  'GigView.tsx',
  'SongFlowView.tsx',
  'SongDoors.tsx',
  'MuralistaDoor.tsx',
  'AppDealView.tsx',
  'ArtistNameView.tsx',
  'LeaveWithoutSaving.tsx',
  'setupFlow.ts',
  'songFlowState.ts',
  'songUsage.ts',
  'launchAnnouncements.ts',
  'vanishedSongs.ts',
  'rigChecklist.ts',
  'muralistaFixtures.ts',
  'gigFolderRead.ts',
  'visualsPick.ts',
  'worstCase.ts',
]

/**
 * Neither product's, and both products' — the first-run folders screen the design names as the one
 * shared surface, the files both products read, and the platform layer under them.
 */
export const SHARED: readonly string[] = [
  // **This declaration itself**, which describes both products and is owned by neither. Listed
  // rather than special-cased, because the rule is that every module is classified.
  'productBoundary.ts',
  // The one surface the two products share, and the widgets it is built from.
  'FirstRunView.tsx',
  'FoldersView.tsx',
  'GatedAction.tsx',
  'RowIcons.tsx',
  'SetupValue.tsx',
  'useHoldToConfirm.ts',
  // Where this machine keeps things, and how a name becomes bytes.
  'contentFolders.ts',
  'platform.ts',
  'paths.ts',
  'fileLayout.ts',
  'pickerMemory.ts',
  'fingerprint.ts',
  // The files both products read: the shell writes them, the player performs them.
  'gigFile.ts',
  'gigSession.ts',
  'gigReadiness.ts',
  'useGigReadiness.ts',
  'gigFolderList.ts',
  'gigLabels.ts',
  'gigFolderStore.ts',
  'setlistStore.ts',
  'songState.ts',
  'songs.ts',
  'visualsFile.ts',
  'visualsBroadcast.ts',
  'mediaPathStore.ts',
  'mediaSources.ts',
]

/**
 * **Modules that contain both products, and there are two.** The router and its entry point.
 * Pinned at exactly this list: the extraction's cost is allowed to be paid, never to grow.
 */
export const UNSPLIT: readonly string[] = ['App.tsx', 'main.tsx']

/**
 * **The one crossing that exists today, named rather than fixed.** `mediaSources.ts` imports
 * `isStaticType` from `ShapeStatic.tsx` — a pure predicate in a component file, so a shared reader
 * reaches into a player renderer. Moving the predicate is a one-line change and this round's rule
 * was that nothing moves to make a test pass.
 */
export const KNOWN_CROSSINGS: readonly string[] = ['mediaSources.ts -> ShapeStatic.tsx']
