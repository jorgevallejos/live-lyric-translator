import { useState } from 'react'
import {
  getGigsFolder,
  getSongsFolder,
  setGigsFolder,
  setSongsFolder,
} from './contentFolders'
import { chooseFolderPath, hasFolderPicker } from './platform'

/**
 * **First run: the two folders, asked once, before anything else.**
 *
 * **It replaces the main screen; it does not sit behind a button and does not appear after the
 * main screen has rendered.** `App` checks `hasRequiredFolders()` before it renders anything on the
 * control side — before the library-hydration screen, which is the one that would otherwise flash
 * first. A launch with either folder unset shows this and nothing else.
 *
 * **Once both are chosen it is gone, and every later launch goes straight through.** There is no
 * "skip", because the whole point is that a setting stops being something you discover at the
 * moment it blocks you.
 *
 * **Preferences remains where these are changed.** This screen is where they are first set.
 */

function FolderRow({
  label,
  hint,
  value,
  onChoose,
  disabled,
  testId,
}: {
  label: string
  hint: string
  value: string | null
  onChoose: () => void
  disabled: boolean
  testId: string
}) {
  return (
    <div className="first-run-row" data-testid={testId}>
      <span className="folders-row-label">{label}</span>
      <span className="folders-row-value" data-testid={`${testId}-value`}>
        {value ?? 'Not set'}
      </span>
      <p className="gig-hint">{hint}</p>
      <button
        type="button"
        className="ctrl-btn ctrl-setup-link"
        data-testid={`${testId}-choose`}
        disabled={disabled}
        onClick={onChoose}
      >
        {value === null ? 'Choose…' : 'Choose another folder'}
      </button>
    </div>
  )
}

export function FirstRunView({ onDone }: { onDone: () => void }) {
  const [songs, setSongs] = useState<string | null>(getSongsFolder)
  const [gigs, setGigs] = useState<string | null>(getGigsFolder)
  const [busy, setBusy] = useState(false)

  const canPick = hasFolderPicker()

  const choose = (
    title: string,
    store: (path: string | null) => void,
    hold: (path: string | null) => void,
    other: string | null
  ) => {
    setBusy(true)
    void (async () => {
      const chosen = await chooseFolderPath(title)
      if (chosen) {
        store(chosen)
        hold(chosen)
        // **Both chosen means done.** The screen has one job and it is finished the moment the
        // second folder lands; asking for a confirming click would be a step that decides nothing.
        if (other !== null) onDone()
      }
      setBusy(false)
    })()
  }

  return (
    <div className="songs-screen first-run-screen" data-testid="first-run">
      <header className="songs-top-bar">
        <h1 className="songs-title">Where do you keep things?</h1>
      </header>

      <main className="songs-body first-run-body">
        <p className="gig-hint" data-testid="first-run-lede">
          Two folders, asked once. Pregonero opens as usual from here on, and you can change them
          later in preferences.
        </p>

        {!canPick && (
          <p className="gig-empty" data-testid="first-run-no-picker">
            Folders can only be chosen from the desktop app.
          </p>
        )}

        <FolderRow
          testId="first-run-songs"
          label="Songs"
          hint="The folder holding your song files. Every song file in it is listed in the app."
          value={songs}
          disabled={busy || !canPick}
          onChoose={() =>
            choose('Choose the songs folder', setSongsFolder, setSongs, gigs)
          }
        />

        <FolderRow
          testId="first-run-gigs"
          label="Gigs"
          hint="The folder your gigs live in. A gig is a folder inside it."
          value={gigs}
          disabled={busy || !canPick}
          onChoose={() => choose('Choose the gigs folder', setGigsFolder, setGigs, songs)}
        />
      </main>
    </div>
  )
}
