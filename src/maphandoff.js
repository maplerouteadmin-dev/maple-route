// Decide whether a new mini-map title is safe to use for directions. An unreadable changed title
// must stay unsettled and be read again; it must never make the old map look confirmed.
export function resolveMapHandoff({ current, pending = null, recognized = null, neighbor = false, areaOnly = false, picture = null, titleChanged = false }) {
  // A clear match of a neighboring map's art can rescue a stale OCR read of the previous title.
  if (titleChanged && picture && picture !== current && recognized === current)
    return { mapId: picture, pending: null, settling: false, rememberTitle: true };
  if (recognized) {
    // A changed title is evidence of a portal transition. One stale OCR read of the old title
    // must not resume movement on the old map. Repeated OCR can make the same mistake (II as I),
    // so only a return to the original title picture, a new-map match, or a manual correction settles it.
    if (recognized === current && titleChanged)
      return { mapId: current, pending: current, settling: true, rememberTitle: false };
    if (!current || recognized === current || pending === recognized || (neighbor && !areaOnly))
      return { mapId: recognized, pending: null, settling: false, rememberTitle: true };
    return { mapId: current, pending: recognized, settling: true, rememberTitle: false };
  }
  // A picture match against the old map can be a false positive on a neighboring map with
  // similar art. It cannot settle a visibly changed title back to the old map.
  if (picture && (!titleChanged || picture !== current))
    return { mapId: picture, pending: null, settling: false, rememberTitle: true };
  return { mapId: current, pending, settling: titleChanged, rememberTitle: !titleChanged };
}
