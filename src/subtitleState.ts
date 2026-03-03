export interface SubtitleLine {
  start: number
  end: number
  es: string
  tr: string
}

export const SAMPLE_LINES: SubtitleLine[] = [
  { start: 0, end: 3, es: 'Hola', tr: 'Hello' },
  { start: 3, end: 6, es: '¿Cómo estás?', tr: 'How are you?' },
]

const KEY_RUNNING = 'subtitle_running'
const KEY_T = 'subtitle_t'
const KEY_LAST_TICK = 'subtitle_lastTickTs'

export interface SubtitleState {
  running: boolean
  t: number
  lastTickTs: number
}

export function getSubtitleState(): SubtitleState {
  const running = localStorage.getItem(KEY_RUNNING) === 'true'
  const t = Number(localStorage.getItem(KEY_T) ?? 0)
  const lastTickTs = Number(localStorage.getItem(KEY_LAST_TICK) ?? 0)
  return { running, t, lastTickTs }
}

export function setSubtitleState(partial: Partial<SubtitleState>): void {
  if (partial.running !== undefined) {
    localStorage.setItem(KEY_RUNNING, String(partial.running))
  }
  if (partial.t !== undefined) {
    localStorage.setItem(KEY_T, String(partial.t))
  }
  if (partial.lastTickTs !== undefined) {
    localStorage.setItem(KEY_LAST_TICK, String(partial.lastTickTs))
  }
}

export function getActiveLine(t: number): SubtitleLine | null {
  return SAMPLE_LINES.find((line) => line.start <= t && t < line.end) ?? null
}
