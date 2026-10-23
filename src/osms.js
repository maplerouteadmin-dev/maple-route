import { validateDataset } from './core.js';
import { transportEdges } from './transport.js';

export const OSMS_MAPS = 'https://osmsdataexplorer.com/data/current/maps.json';
export const OSMS_PORTALS = 'https://osmsdataexplorer.com/data/current/portals.json';
export const OSMS_MONSTERS = 'https://osmsdataexplorer.com/data/current/monsters.json';
export const OSMS_FILES = 'https://osmsdataexplorer.com/data/current/';
const id9 = value => String(value).padStart(9, '0');
// OSMS portal `type` follows the game's portal kinds: 2 shows a swirl you press ↑ on, 3 triggers when
// you walk into it, 1 is invisible (often a hidden or quest-gated spot). Others are scripted.
export const portalKind = type => ({ 1: 'hidden', 2: 'visible', 3: 'walk' })[Number(type)] ?? 'special';
export const KIND_COST = { visible: 1, walk: 1, hidden: 6, special: 10, taxi: 3 };

export function fromOsms(mapPayload, portalPayload, monsterPayload = null) {
  const monsterNames = new Map((monsterPayload?.monsters ?? []).map(m => [String(m.id), String(m.name)]));
  if (!Array.isArray(mapPayload?.regions) || !portalPayload || typeof portalPayload !== 'object') throw new Error('The public map feed changed format.');
  const boundsById = new Map();
  const addPoint = (id, point) => {
    if (point?.x == null || point?.y == null) return;
    const x = Number(point?.x), y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const bounds = boundsById.get(id) ?? { minX: x, maxX: x, minY: y, maxY: y };
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    boundsById.set(id, bounds);
  };
  for (const [source, exits] of Object.entries(portalPayload)) if (Array.isArray(exits)) for (const exit of exits) addPoint(id9(source), exit);
  for (const group of mapPayload.regions) for (const map of group.maps ?? []) for (const npc of map.npc_positions ?? []) addPoint(id9(map.id), npc);
  const maps = mapPayload.regions
    .filter(group => !['Dev', 'Event'].includes(group.region))
    .flatMap(group => (group.maps ?? []).filter(m => m.name).map(m => ({
      id: id9(m.id), name: String(m.name), area: String(m.region ?? group.region ?? ''),
      aliases: [m.street_name && `${m.street_name} ${m.name}`].filter(Boolean), bounds: boundsById.get(id9(m.id)),
      picture: typeof m.minimap === 'string' ? m.minimap : null, returnTo: m.return_map_id && Number(m.return_map_id) !== Number(m.id) && Number(m.return_map_id) < 999999999 ? id9(m.return_map_id) : null,
      npcs: (m.npc_positions ?? []).map(position => ({ name: mapPayload.npc_lookup?.[String(position.id)]?.name, x: position.x, y: position.y })).filter(npc => npc.name),
      mobSpots: (m.mob_positions ?? []).map(position => ({ name: monsterNames.get(String(position.id)), x: position.x, y: position.y })).filter(spot => spot.name)
    })));
  const known = new Set(maps.map(m => m.id));
  const mapsById = new Map(maps.map(m => [m.id, m]));
  const portals = [];
  for (const [source, exits] of Object.entries(portalPayload)) {
    const from = id9(source);
    if (!known.has(from) || !Array.isArray(exits)) continue;
    // Every visible swirl (any destination) is drawn on the minimap; keep their spots for position fixes.
    const marks = exits.filter(exit => portalKind(exit.type) === 'visible' && Number.isFinite(Number(exit.x)) && Number.isFinite(Number(exit.y))).map(exit => ({ x: Number(exit.x), y: Number(exit.y) }));
    if (marks.length) mapsById.get(from).marks = marks;
    for (const exit of exits) {
      const to = id9(exit.dest_map);
      if (!known.has(to) || from === to) continue;
      const kind = portalKind(exit.type);
      portals.push({
        from, to, name: String(exit.name || `portal ${exit.id ?? ''}`), kind, arrive: exit.dest_portal ? String(exit.dest_portal) : '',
        note: Number.isFinite(Number(exit.x)) ? `Portal at map x ${exit.x}${Number.isFinite(Number(exit.y)) ? `, y ${exit.y}` : ''}.` : '',
        cost: KIND_COST[kind], x: exit.x ?? null, y: exit.y ?? null
      });
    }
  }
  // NPC rides (Regular Cab, Phil, VIP Cab) from the wiki table, placed at the driver's spot in the feed.
  const npcAt = (mapId, name) => {
    for (const group of mapPayload.regions) for (const map of group.maps ?? []) {
      if (id9(map.id) !== mapId) continue;
      const spot = (map.npc_positions ?? []).find(position => mapPayload.npc_lookup?.[String(position.id)]?.name === name);
      if (spot && Number.isFinite(Number(spot.x))) return { x: Number(spot.x), y: Number(spot.y) };
    }
    return null;
  };
  portals.push(...transportEdges(maps, npcAt));
  // Named portal spots per map, so a step can say which side of the next map you arrive on.
  for (const [source, exits] of Object.entries(portalPayload)) {
    const map = mapsById.get(id9(source));
    if (!map || !Array.isArray(exits)) continue;
    const spots = {};
    for (const exit of exits) if (exit.name && Number.isFinite(Number(exit.x)) && Number.isFinite(Number(exit.y)) && !(exit.name in spots)) spots[exit.name] = { x: Number(exit.x), y: Number(exit.y) };
    map.spots = spots;
  }
  const targetMap = new Map();
  for (const group of mapPayload.regions) {
    if (['Dev', 'Event'].includes(group.region)) continue;
    for (const map of group.maps ?? []) {
      const mapId = id9(map.id);
      if (!known.has(mapId) || !Array.isArray(map.npcs)) continue;
      for (const npcId of map.npcs) {
        const details = mapPayload.npc_lookup?.[String(npcId)];
        if (!details?.name) continue;
        const id = `npc:${npcId}`;
        if (!targetMap.has(id)) targetMap.set(id, { id, kind: 'npc', name: String(details.name), locations: [] });
        const target = targetMap.get(id);
        if (!target.locations.some(location => location.mapId === mapId)) target.locations.push({ mapId });
      }
    }
  }
  for (const monster of monsterPayload?.monsters ?? []) {
    if (!monster?.name || !Array.isArray(monster.maps)) continue;
    const locations = [...new Map(monster.maps
      .filter(location => known.has(id9(location.id)))
      .map(location => [id9(location.id), { mapId: id9(location.id), count: Number.isInteger(Number(location.count)) ? Number(location.count) : null }])).values()];
    if (locations.length) targetMap.set(`mob:${monster.id}`, { id: `mob:${monster.id}`, kind: 'mob', name: String(monster.name), level: monster.level ?? null, hp: monster.hp ?? null, exp: monster.exp ?? null, special: Boolean(monster.special), thumb: monster.thumbnail, locations });
  }
  return validateDataset({ schemaVersion: 1, label: 'OSMS Data Explorer live map graph', source: 'https://osmsdataexplorer.com/', updated: new Date().toISOString(), maps, portals, targets: [...targetMap.values()] });
}

export async function fetchOsms() {
  const options = { cache: 'no-store' };
  const [mapsResponse, portalsResponse, monstersResponse] = await Promise.all([fetch(OSMS_MAPS, options), fetch(OSMS_PORTALS, options), fetch(OSMS_MONSTERS, options).catch(() => null)]);
  if (!mapsResponse.ok || !portalsResponse.ok) throw new Error('The map feed is unavailable right now.');
  return fromOsms(await mapsResponse.json(), await portalsResponse.json(), monstersResponse?.ok ? await monstersResponse.json() : null);
}
