import { normalize, shortestRoute } from './core.js';

// An NPC name is not a place: the same name can occur in several towns and in
// isolated party-quest maps. Prefer a quest's named map, then a reachable spot.
export function npcLocations(data, name, currentMapId = null, { mapName = null, nearMapId = null } = {}) {
  const key = normalize(name);
  if (!key) return [];
  const ids = new Set((data.targets ?? []).filter(t => t.kind === 'npc' && normalize(t.name) === key)
    .flatMap(t => t.locations ?? []).map(l => l.mapId));
  const named = mapName ? new Set((data.maps ?? []).filter(m => normalize(m.name) === normalize(mapName) || m.aliases?.some(a => normalize(a) === normalize(mapName))).map(m => m.id)) : null;
  const onNamedMap = named?.size ? [...ids].filter(id => named.has(id)) : [];
  const candidates = onNamedMap.length ? onNamedMap : [...ids];
  const distance = (from, to) => !from ? null : shortestRoute(data, from, to)?.length ?? null;
  return candidates.map(mapId => ({ mapId, map: data.maps.find(m => m.id === mapId), named: Boolean(named?.has(mapId)), hops: distance(currentMapId, mapId), nearHops: distance(nearMapId, mapId) }))
    .filter(x => x.map)
    .sort((a, b) => Number(b.hops !== null) - Number(a.hops !== null)
      || Number(b.nearHops !== null) - Number(a.nearHops !== null) || (a.nearHops ?? Infinity) - (b.nearHops ?? Infinity)
      || (a.hops ?? Infinity) - (b.hops ?? Infinity)
      || a.map.name.localeCompare(b.map.name));
}

export function npcMapId(data, name, currentMapId = null, options = {}) {
  const locations = npcLocations(data, name, currentMapId, options);
  // An unreachable first row is not an actionable GPS destination. Without a
  // starting map or a quest map, duplicate names remain ambiguous.
  if (currentMapId && locations[0]?.hops === null) return null;
  if (!currentMapId && !options.nearMapId && locations.length > 1 && !locations.some(place => place.named)) return null;
  return locations[0]?.mapId ?? null;
}

export function questNpcMapHint(steps, npc) {
  const key = normalize(npc);
  return (steps ?? []).findLast(step => step.map && (normalize(step.npc) === key || normalize(step.npc).startsWith(`${key} `)))?.map ?? null;
}

export function questNpcDestination(data, npc, currentMapId, { steps = [], chosen = null, nearMapId = null } = {}) {
  if (chosen && npcLocations(data, npc, currentMapId).some(place => place.mapId === chosen && (!currentMapId || place.hops !== null))) return chosen;
  return npcMapId(data, npc, currentMapId, { mapName: questNpcMapHint(steps, npc), nearMapId });
}
