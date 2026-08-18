/* THROWAWAY — restyle prototype scaffolding only.
 *
 * Flips `data-theme` on <html> between the current look and the two restyle
 * variants so the whole thing can be judged from one running app, mid-song,
 * without a rebuild. It is deliberately crude: plain React state plus one
 * dataset write, no persistence, no cross-window sync, inline styles. It is
 * removed by a single `git revert` of the commit that added it, and nothing
 * else in the app imports it.
 */
import { useEffect, useState } from 'react'

const THEMES = ['today', 'a', 'b'] as const
type Theme = (typeof THEMES)[number]

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme
  return (THEMES as readonly string[]).includes(t ?? '') ? (t as Theme) : 'today'
}

export default function ThemeSwitcher() {
  // Seeded from the DOM, not from storage: the attribute already survives a
  // route change, so re-reading it is what keeps the theme steady when the
  // performer ducks into Songs and back. Deliberately NOT routed through the
  // persisted-settings machinery — see the storage-event gotcha in CLAUDE.md.
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // No cleanup on unmount: the attribute is meant to outlive this component.
  }, [theme])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+K.
      //
      // Every existing key handler in the control window matches a BARE key
      // with no modifier guard — ArrowRight, Space, ArrowLeft, r, a, s, l, b
      // in ControlView, ArrowRight/ArrowLeft in single-screen ProjectionView,
      // Enter/Escape in the setlist rename input. A modifier does not stop
      // any of them from firing, so the chord has to avoid those keys
      // outright rather than rely on the modifier to disambiguate. With Shift
      // held e.key is 'K', which none of them match. Electron's default macOS
      // menu is Cmd-based and this app installs no Menu of its own, so
      // Ctrl+Shift+* is free of accelerator collisions too.
      if (!e.ctrlKey || !e.shiftKey || e.metaKey || e.altKey) return
      if (e.key !== 'K' && e.key !== 'k') return
      e.preventDefault()
      e.stopPropagation()
      setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])
    }
    // Capture phase, so the chord is consumed before any bare-key handler runs.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div
      data-testid="theme-switcher-label"
      style={{
        position: 'fixed',
        left: 6,
        bottom: 6,
        zIndex: 9999,
        pointerEvents: 'none',
        font: '10px/1 ui-monospace, Menlo, monospace',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '3px 5px',
        color: theme === 'today' ? '#8e8e93' : '#d98b7a',
        border: `1px solid ${theme === 'today' ? '#3a3a3c' : '#8f5a4e'}`,
        background: '#000',
      }}
    >
      {`theme ${theme} · ⌃⇧K`}
    </div>
  )
}
