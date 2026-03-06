# Phase 1 — Navigation behavior extraction analysis

## 1. Navigation behaviors in `useSongNavigation.ts`

| Behavior | Where | Logic |
|----------|--------|--------|
| **next** | `goNext()`, `applyCommand('next')` | `newIndex = nextIndex(lines, idx)`; persist index; if `newIndex >= 0` then set `blank = false`, else leave blank unchanged. |
| **previous** | `goPrev()`, `applyCommand('prev')` | `newIndex = prevIndex(lines, idx)`; persist index; if `newIndex >= 0` then set `blank = false`, else leave blank unchanged. |
| **restart** | `goRestart()` | `index = -1`, `blank = true`. |
| **blank toggle** | `setBlankAndStore` used with toggle, `applyCommand('blankToggle')` | Index unchanged; `blank = !curBlank`. |
| **setIndex** | `applyCommand('setIndex', value)` | Only when `value !== undefined`: `clamped = value < 0 ? -1 : clamp(value, 0, lines.length - 1)`; persist index; if `clamped === -1` then `blank = true`, else leave blank unchanged. |

All of these share the same pattern: from current `(lines, index, blank)` and an action (and optional `value` for setIndex), compute the **next** `(index, blank)`. Persistence (localStorage + React state) is separate from that computation.

---

## 2. Proposed pure extraction

**Single pure function** that encapsulates the above behavior:

- **Name:** `computeNavigationState`
- **Location:** New file `src/navigationState.ts` (or alongside `songState.ts`) so it stays dependency-light and testable without the hook. It will use `nextIndex` and `prevIndex` from `songState` (already pure).

**Why one function:**  
The five behaviors are a small, closed set of branches (next / prev / restart / blankToggle / setIndex). One function keeps a single place to test and avoids fragmenting the logic across many tiny helpers.

---

## 3. Inputs and outputs

**Inputs:**

- `lines: SongItem[]` — current song items (for length and for delegating to `nextIndex` / `prevIndex`).
- `index: number` — current index (-1 = “before first” or restart).
- `blank: boolean` — current blank state.
- `action: 'next' | 'prev' | 'restart' | 'blankToggle' | 'setIndex'`.
- `value?: number` — required only for `action === 'setIndex'`; when `action === 'setIndex'` and `value === undefined`, treat as no-op (return current state).

**Output:**

- `{ index: number; blank: boolean }` — the next index and blank state with no side effects.

**Edge cases to preserve:**

- **next:** When `nextIndex(lines, index)` is `-1` (e.g. empty lines), leave `blank` unchanged.
- **prev:** When `prevIndex(lines, index)` is `-1`, leave `blank` unchanged.
- **setIndex:** When `value` is `undefined`, return current `{ index, blank }`. Clamp non-negative `value` to `[0, lines.length - 1]`; negative `value` → index `-1` and `blank = true`.

---

## 4. Conclusion

The extraction is **small and behavior-preserving**: one pure function with clear inputs/outputs. The hook will continue to read from storage and call `setSongIndex` / `setBlank` / `setIndexState` / `setBlankState`; it will simply replace the inline branching with a call to `computeNavigationState(lines, index, blank, action, value)` and then apply the returned `{ index, blank }`. No change to observable behavior, only to structure.

**Proceed to Phase 2:** Red → Green → Refactor (tests first, then implementation, then refactor hook to use the pure function).
