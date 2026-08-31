/**
 * **Two doors on a song, and only two.**
 *
 * Pregonero offers exactly two actions on a song: **modify the song**, and **modify its visuals**.
 * No separate button to attach a timeline, link a video or set a tempo — those are all *modify the
 * song*, and they live in the tool that owns the song file.
 *
 * This is written as a rule rather than as a layout preference because it is the one that erodes a
 * convenience button at a time. Each new button looks harmless on its own and each one moves the
 * app's information architecture a little further from the ownership rule it is supposed to teach.
 * **If a third door seems necessary, say so rather than adding it.**
 *
 * What is behind each door is packaging, and it changes: today each one names the tool that owns
 * the work and what to run. Hosting those tools inside Pregonero is a later stage, and it replaces
 * the body of a door without adding one.
 */

import { useState } from 'react'

/** The whole set. A test counts it, because counting it is the only way this rule survives. */
export const SONG_DOORS = ['song', 'visuals'] as const
export type SongDoor = (typeof SONG_DOORS)[number]

export const DOOR_LABEL: Record<SongDoor, string> = {
  song: 'Modify the song',
  visuals: 'Modify its visuals',
}

/**
 * **Step 0 is named, not hidden.** A song becomes SP JSON in an LLM session outside the suite.
 * Pregonero brackets that step and explains it; it never performs it, and no translation support is
 * added to any tool. `bombista new` on one side, `bombista validate` on the other.
 *
 * **The step is called Translations, and not "the words"** (Jorge, 2026-08-31). For the author the
 * words are the original lyrics: they arrive with the song and are not a step. "The words —
 * outside the suite" reads as though the lyric itself were outsourced to a language model, which
 * is both wrong and faintly insulting to the person who wrote it. **Only the translations leave.**
 */
export const SONG_SUBFLOW: readonly { name: string; detail: string }[] = [
  { name: '1. New', detail: '`bombista new <id>` writes a skeleton into the songs folder. Skip it when the song file already exists.' },
  { name: '2. Translations — outside the suite', detail: 'An LLM session writes the translations into the file. **Pregonero does not do this and never will**: no tool in the suite gets a language model. This step is named so it is not a gap you fall into.' },
  { name: '3. Align', detail: '`bombista align` against the audio. This is why a song needs lyrics **and** audio: the timeline comes from matching one to the other.' },
  { name: '4. Review and tempo', detail: 'Bombista’s review page, where the alignment is visible while the tempo is being set.' },
  { name: '5. Validate', detail: '`bombista validate --for-performance` is the exit gate. Only a song that passes it belongs in a setlist.' },
]

export const SONG_INPUT_RULE =
  'A song needs lyrics and audio. The timeline comes from aligning one against the other, so a song with no audio cannot leave this step — that is a fact about the work, not a rule Pregonero invented.'

type Props = {
  songId: string
  title: string
  /** What the door leads to. Given, so hosting the tools later changes a body and not this file. */
  renderDoor: (door: SongDoor, songId: string) => React.ReactNode
  testIdPrefix?: string
}

export function SongDoors({ songId, title, renderDoor, testIdPrefix = 'song-doors' }: Props) {
  const [open, setOpen] = useState<SongDoor | null>(null)
  return (
    <div className="song-doors" data-testid={`${testIdPrefix}-${songId}`}>
      <div className="song-doors-buttons">
        {SONG_DOORS.map((door) => (
          <button
            key={door}
            type="button"
            className="ctrl-btn ctrl-setup-link"
            aria-expanded={open === door}
            data-testid={`${testIdPrefix}-${songId}-${door}`}
            onClick={() => setOpen((current) => (current === door ? null : door))}
          >
            {DOOR_LABEL[door]}
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="song-door-body" data-testid={`${testIdPrefix}-${songId}-${open}-body`}>
          <p className="song-door-title">
            {DOOR_LABEL[open]} — {title}
          </p>
          {renderDoor(open, songId)}
        </div>
      )}
    </div>
  )
}
