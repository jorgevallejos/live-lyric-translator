/**
 * **What displays this machine has**, as a fact the renderer can read.
 *
 * Two callers, one round apart. The setup confirmation fingerprints the display configuration so it
 * can notice that it moved — a gig confirmed with the projector attached and then reopened on the
 * laptop alone is a confirmation that is no longer true. Placing the projection window on the
 * projector is the other, and it uses the same list.
 *
 * **The fingerprint is compared and never read back.** Nothing recovers a size from it, and nothing
 * renders from it: `docs/warp-contract.md` says the output size is a parameter passed on every
 * render, and that is not weakened by anything here.
 */

/** One display, reduced to what identifies it. Ordered by id so the fingerprint is stable. */
function describeDisplays(screenModule) {
  const all = typeof screenModule?.getAllDisplays === 'function' ? screenModule.getAllDisplays() : []
  const primaryId =
    typeof screenModule?.getPrimaryDisplay === 'function'
      ? screenModule.getPrimaryDisplay()?.id
      : undefined

  const displays = all
    .map((d) => ({
      id: String(d.id),
      width: d.size?.width ?? d.bounds?.width ?? 0,
      height: d.size?.height ?? d.bounds?.height ?? 0,
      scaleFactor: d.scaleFactor ?? 1,
      internal: d.internal === true,
      primary: primaryId !== undefined && d.id === primaryId,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    count: displays.length,
    displays,
    fingerprint: displays
      .map((d) => `${d.width}x${d.height}@${d.scaleFactor}${d.primary ? '*' : ''}`)
      .join(' + '),
  }
}

module.exports = { describeDisplays }
