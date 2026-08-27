/**
 * **Which display the projection window belongs on.**
 *
 * On a night, the projector is the display that is *not* the laptop's own. Placing the window there
 * removes the drag-it-across step, which is the last manual thing between arming and the wall.
 *
 * **Falling back is visible, never silent.** With one display there is nowhere to put it and the
 * window opens exactly as it did before — but the app says so, because a projection window that
 * quietly stayed on the laptop is discovered by looking at a blank wall.
 *
 * **Nothing here is remembered.** The chosen display is read at the moment the window opens and
 * never stored: the output size is a parameter passed on every render (`docs/warp-contract.md`,
 * caller obligation 1), and a remembered display would be the frozen-matrix bug with extra steps.
 */

/**
 * Picks the projector, or reports why there is none.
 *
 * The rule, in order: an external display that is not the primary one; failing that, any external
 * display; failing that, none. `internal` is what macOS reports for the built-in panel, and the
 * primary is where the menu bar is — which on a laptop plugged into a projector is the laptop.
 */
function chooseProjectorDisplay(description) {
  const displays = (description && description.displays) || []
  if (displays.length <= 1) {
    return {
      display: null,
      reason:
        displays.length === 0
          ? 'No displays reported, so the projection window opens where it always did.'
          : 'Only one display, so the projection window opens where it always did.',
    }
  }
  const external = displays.filter((d) => !d.internal)
  const secondary = external.filter((d) => !d.primary)
  const chosen = secondary[0] || external[0] || displays.filter((d) => !d.primary)[0] || null
  if (chosen === null) {
    return {
      display: null,
      reason: 'Every display is the primary one, so the projection window opens where it always did.',
    }
  }
  return { display: chosen, reason: null }
}

module.exports = { chooseProjectorDisplay }
