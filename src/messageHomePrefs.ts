/**
 * **THE MESSAGE HOME'S FOUR VALUES, AS THIS MACHINE REMEMBERS THEM.**
 *
 * **Artist-level, asked at first need, edited in Preferences** (Jorge, 2026-09-05) — the principle
 * that settles the whole group. The four fields are asked at the first gig, on the gig flow's own
 * step, and every gig after that arrives prefilled from here.
 *
 * ## This is not where the player finds them
 *
 * **The content travels in the gig.** A player that reads only the gig folder cannot read the
 * shell's Preferences, so the step writes the answers into `gig.json` and the player reads them out
 * of it. **This store is the shell's authoring convenience and nothing else** — the thing that
 * saves typing the same handle at every gig.
 *
 * **So a value changed here does not change a gig that has already been set up**, and that is
 * correct rather than a limitation: a gig folder is a record of a night, and the night's card is
 * what was on the wall.
 *
 * ## Why they are four keys and not one blob
 *
 * The same reason the folders are: **each is a separate answer with its own moment of being given**,
 * and a JSON blob in one key turns a missing field into a parse question. Every read is a string or
 * null, and null is *not answered*.
 *
 * **The keys say `pregonero` and are deliberately not renamed** — see `contentFolders.ts`.
 */
import type { MessageHome } from './gigFile'

export const MESSAGE_HOME_LOGO_KEY = 'pregoneroMessageHomeLogo'
export const MESSAGE_HOME_URL_KEY = 'pregoneroMessageHomeUrl'
export const MESSAGE_HOME_HANDLE_KEY = 'pregoneroMessageHomeHandle'
export const MESSAGE_HOME_MESSAGE_KEY = 'pregoneroMessageHomeMessage'

function read(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const value = localStorage.getItem(key)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    const trimmed = value?.trim() ?? ''
    if (trimmed.length > 0) localStorage.setItem(key, trimmed)
    else localStorage.removeItem(key)
  } catch {
    /* unavailable in some environments */
  }
}

/** What this machine remembers, in the shape the gig file carries. Empty when nothing is answered. */
export function getRememberedMessageHome(): MessageHome {
  const out: MessageHome = {}
  const logo = read(MESSAGE_HOME_LOGO_KEY)
  const url = read(MESSAGE_HOME_URL_KEY)
  const handle = read(MESSAGE_HOME_HANDLE_KEY)
  const message = read(MESSAGE_HOME_MESSAGE_KEY)
  if (logo !== null) out.logo = logo
  if (url !== null) out.url = url
  if (handle !== null) out.handle = handle
  if (message !== null) out.message = message
  return out
}

/**
 * Remembers the four, so the next gig arrives prefilled.
 *
 * **A field cleared is remembered as cleared.** Blanking the handle on this gig's step means the
 * next gig does not offer it either — the step is where the answer is given, so it is also where it
 * is taken back.
 */
export function rememberMessageHome(fields: MessageHome): void {
  write(MESSAGE_HOME_LOGO_KEY, fields.logo ?? null)
  write(MESSAGE_HOME_URL_KEY, fields.url ?? null)
  write(MESSAGE_HOME_HANDLE_KEY, fields.handle ?? null)
  write(MESSAGE_HOME_MESSAGE_KEY, fields.message ?? null)
}
