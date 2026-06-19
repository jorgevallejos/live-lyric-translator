import type { BeatPhaseResult, SongTempo } from './beatScheduler'

type Props = {
  tempo: SongTempo
  phase: BeatPhaseResult | null
  /** Whether the small persistent pulse is visible (toggled by the performer). */
  pulseVisible: boolean
  onTogglePulse: () => void
}

/**
 * Visual beat indicator — performer view only, never shown in the projection window.
 *
 * Count-in phase: fills the stage with a large beat number, a dot row, and the
 * downbeat emphasised with a larger scale transform.
 *
 * Song phase: a small pulsing dot in the corner that the performer can toggle off.
 */
export function BeatIndicator({ tempo, phase, pulseVisible, onTogglePulse }: Props) {
  if (!phase) return null

  if (phase.inCountIn) {
    const dots = Array.from({ length: tempo.meter }, (_, i) => i + 1)
    const isDownbeat = phase.beatInBar === 1

    return (
      <div className="beat-count-in-overlay" data-testid="beat-count-in-overlay">
        <span
          className={`beat-count-in-number${isDownbeat ? ' beat-count-in-downbeat' : ''}`}
          data-testid="beat-count-in-number"
        >
          {phase.beatInBar}
        </span>
        <div className="beat-count-in-dots" data-testid="beat-count-in-dots" aria-hidden="true">
          {dots.map((b) => (
            <span
              key={b}
              className={`beat-count-in-dot${b === phase.beatInBar ? ' beat-count-in-dot-active' : ''}`}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="beat-pulse-wrap" data-testid="beat-pulse-wrap">
      {pulseVisible && (
        <span
          key={phase.absoluteBeat}
          className={`beat-pulse${phase.beatInBar === 1 ? ' beat-pulse-down' : ''}`}
          data-testid="beat-pulse"
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        className="ctrl-btn beat-pulse-toggle"
        data-testid="beat-pulse-toggle"
        onClick={onTogglePulse}
        aria-label={pulseVisible ? 'Hide beat pulse' : 'Show beat pulse'}
      >
        {pulseVisible ? '●' : '○'}
      </button>
    </div>
  )
}
