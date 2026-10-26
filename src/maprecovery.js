// Small, local-only set of maps a player can confirm from the Decky panel.
// The full map search remains available on the phone.
export function mapRecoveryChoices({ maps = [], portals = [] }, currentId, pendingId, likelyIds = [], limit = 12) {
  const byId = new Map(maps.map(map => [map.id, map]));
  const ids = [currentId, pendingId, ...likelyIds.slice(0, 3)];
  if (currentId) for (const portal of portals) {
    if (portal.from === currentId) ids.push(portal.to);
    if (portal.to === currentId) ids.push(portal.from);
  }
  return [...new Set(ids)].filter(id => byId.has(id)).slice(0, limit).map(id => {
    const map = byId.get(id);
    return { id, label: `${map.name}${map.area ? ` — ${map.area}` : ''}` };
  });
}

// A manual correction wins over OCR until the visible mini-map title changes.
// If the title was covered at confirmation time, anchor the lock on the first readable frame.
export function advanceManualMapLock(lock, signature, titleChanged = false) {
  if (!lock) return null;
  if (!lock.signature) return { ...lock, signature };
  return titleChanged ? null : lock;
}
