/**
 * **THE HOST SEAM, AND IT IS A FRAME NOW.**
 *
 * `App.tsx` mounted `PlayerApp` as a component until 2026-09-06. It said so itself: *today it is a
 * component; when the player becomes a framed page it becomes a URL, and this is the one line that
 * changes.* This is that line.
 *
 * **Relative, and that is not cosmetic.** `player.html` resolves against whatever document the
 * shell is — `tramoya://app/player.html` packaged, `http://localhost:5174/player.html` in dev — so
 * **the frame is same-origin by construction** rather than by a rule somebody has to keep. That is
 * the whole arrangement: same-origin is what lets the frame reach `window.parent.electronAPI` with
 * no preload and no `nodeIntegrationInSubFrames`, and what lets it share `localStorage` with the
 * projection window it opens.
 *
 * **The src is fixed at mount.** The player's own rooms — the setlist, the gig picker, the
 * languages screen — are routes inside that document and never touch the shell's address; changing
 * this `src` would reload the page mid-gig. The shell's hash is read once, so a deep link still
 * lands where it says.
 */
import { useRef } from 'react'

export function PlayerFrame({ hash }: { hash: string }) {
  // Read once: a re-render must not reload the player.
  const src = useRef(`player.html${hash && hash !== '#/' ? hash : ''}`).current
  return (
    <iframe
      className="player-frame"
      data-testid="player-frame"
      title="Pregonero"
      src={src}
      /**
       * **No `sandbox`, and that is deliberate.** A sandboxed frame is given a unique opaque
       * origin, which would take away both things this move exists for: the shared `localStorage`
       * and the reach to the embedder's bridge. The frame is this app's own page from this app's
       * own origin — the two vendored tools are the ones that are kept at arm's length, and they
       * are cross-origin for exactly that reason.
       */
      allow="fullscreen"
    />
  )
}
