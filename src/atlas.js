export function atlasNeighbors(data, centerId, limit = 12) {
  const maps = new Map(data.maps.map(map => [map.id, map]));
  if (!maps.has(centerId)) return { neighbors: [], hiddenCount: 0 };
  const links = new Map();
  for (const portal of data.portals) {
    const outgoing = portal.from === centerId;
    const incoming = portal.to === centerId;
    if (!outgoing && !incoming) continue;
    const neighborId = outgoing ? portal.to : portal.from;
    if (!maps.has(neighborId) || neighborId === centerId) continue;
    const link = links.get(neighborId) ?? { map: maps.get(neighborId), outgoing: false, incoming: false };
    if (outgoing) link.outgoing = true;
    if (incoming) link.incoming = true;
    links.set(neighborId, link);
  }
  const ordered = [...links.values()].sort((a, b) => Number(b.outgoing) - Number(a.outgoing) || a.map.name.localeCompare(b.map.name));
  return { neighbors: ordered.slice(0, limit), hiddenCount: Math.max(0, ordered.length - limit) };
}
