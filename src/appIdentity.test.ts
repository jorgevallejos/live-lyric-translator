/**
 * **The app is Tramoya, and the addresses under it did not move** (2026-09-06).
 *
 * Two halves of one rename, and they pull in opposite directions on purpose.
 *
 * **What a person reads is the product's name**, so the manifest's `productName`, the bundle id
 * and the disk image all say Tramoya — and `productName` is also what decides
 * `Application Support/<name>`, which is why it is asserted here rather than left to the build.
 *
 * **What the software reads is an address**, and an address that is rewritten does not rename
 * anything: it points the app at a different, empty place. So every `localStorage` key still says
 * `pregonero`, and the older `liveLyric*` and `llt.*` keys still carry the name this app had
 * before 2026-08-14. **This test is the guard comment made mechanical** — a find-and-replace over
 * the product name turns it red instead of silently emptying a machine that had answered.
 */
import { describe, it, expect } from 'vitest'
import pkg from '../package.json'
import { SONGS_FOLDER_KEY, VISUALS_FOLDER_KEY, GIGS_FOLDER_KEY, MURALISTA_FOLDER_KEY, BOMBISTA_PATH_KEY, ARTIST_NAME_KEY } from './contentFolders'
import { GIG_FOLDER_KEY } from './gigFolderStore'
import { KEY_CONTACT_LIT_BROADCAST } from './cardBroadcast'
import { KEY_VISUALS_BROADCAST } from './visualsBroadcast'

describe('the application names itself Tramoya', () => {
  it('carries the product name, the bundle id and the disk image title', () => {
    expect(pkg.build.productName).toBe('Tramoya')
    expect(pkg.build.appId).toBe('com.changopepper.tramoya')
    expect(pkg.build.dmg.title).toBe('Tramoya')
  })

  it('names the data directory through `name`, which is the field Electron actually reads', () => {
    // **Measured on the 2026-09-06 install, not inferred.** `app.getPath('userData')` is
    // `Application Support/<app.getName()>`, and `app.getName()` reads the `package.json` inside
    // the asar — where electron-builder leaves `name` alone and writes `productName` only into
    // `Info.plist`. The old bundle's `CFBundleName` was `Pregonero` and its directory was the
    // lowercase `pregonero`; this one's is `Tramoya` and its directory is `tramoya`.
    //
    // **So `productName` alone would have renamed the app and left its data where it was.**
    expect(pkg.name).toBe('tramoya')
  })
})

describe('the stored addresses did not move with the name', () => {
  it('keeps every folder answer where the machine already wrote it', () => {
    expect(SONGS_FOLDER_KEY).toBe('pregoneroSongsFolder')
    expect(VISUALS_FOLDER_KEY).toBe('pregoneroMediaFolder')
    expect(GIGS_FOLDER_KEY).toBe('pregoneroGigsFolder')
    expect(MURALISTA_FOLDER_KEY).toBe('pregoneroMuralistaFolder')
    expect(BOMBISTA_PATH_KEY).toBe('pregoneroBombistaPath')
    expect(ARTIST_NAME_KEY).toBe('pregoneroArtistName')
  })

  it('keeps the gig, the contact boolean and the visuals channel where they were', () => {
    expect(GIG_FOLDER_KEY).toBe('pregoneroGigFolder')
    expect(KEY_CONTACT_LIT_BROADCAST).toBe('pregoneroContactLit')
    expect(KEY_VISUALS_BROADCAST).toBe('pregoneroVisualsBroadcast')
  })
})
