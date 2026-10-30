import { normalize, shortestRoute } from './core.js';

export const OSMS_ITEMS = 'https://osmsdataexplorer.com/data/current/items.json';

export async function fetchItemCatalog() {
  const response = await fetch(OSMS_ITEMS, { cache: 'no-store' });
  if (!response.ok) throw new Error('The item catalog is unavailable right now.');
  const payload = await response.json();
  if (!Array.isArray(payload?.items) || payload.items.length > 50000) throw new Error('The item catalog changed format.');
  // `price` (equipment) or `stats.price` (use/etc) is the game's own item value: what an NPC shop pays you.
  const scrolls = Array.isArray(payload.scrolls) ? payload.scrolls : [];
  return [...payload.items, ...scrolls].filter(item => item?.name && item?.id != null)
    .map(item => ({ id: String(item.id), name: String(item.name).slice(0, 160), category: String(item.category ?? (scrolls.includes(item) ? 'Scroll' : '')).slice(0, 60), npcPrice: Number(item.price ?? item.stats?.price) > 0 ? Number(item.price ?? item.stats?.price) : null }));
}

export function parseWikiDrops(payload) {
  if (!Array.isArray(payload?.cargoquery) || payload.cargoquery.length > 500) throw new Error('The drop listing changed format.');
  return [...new Set(payload.cargoquery.map(row => String(row?.title?.['monster id'] ?? '').trim()).filter(Boolean))];
}

// One reported Classic quest source is absent from the wiki's monster_drops API even though
// the item and monster pages identify it. Use only when the live listing is empty, and let the
// current map catalog locate Mano (do not hard-code a map or bundle a drop table).
export function verifiedQuestDrop(itemName) {
  return normalize(itemName) === 'rainbow colored snail shell' ? ['Mano'] : [];
}

export async function fetchWikiDrops(itemName) {
  if (typeof itemName !== 'string' || !itemName.trim() || itemName.length > 160) throw new Error('Choose a valid item name.');
  const params = new URLSearchParams({
    action: 'cargoquery', tables: 'monster_drops', fields: 'monster_id,item_id',
    where: `item_id='${itemName.replaceAll("'", "''")}'`, limit: '500', format: 'json', origin: '*'
  });
  const response = await fetch(`https://mapleclassic.wiki/api.php?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('The community drop listing is unavailable right now.');
  return parseWikiDrops(await response.json());
}

export function rankFarmMaps(data, monsterNames, currentMapId = null) {
  const names = new Set(monsterNames.map(normalize));
  const maps = new Map(data.maps.map(map => [map.id, map]));
  const spots = new Map();
  const matched = new Set();
  for (const mob of data.targets ?? []) {
    if (mob.kind !== 'mob' || !names.has(normalize(mob.name))) continue;
    matched.add(normalize(mob.name));
    for (const location of mob.locations) {
      const map = maps.get(location.mapId);
      if (!map) continue;
      if (!spots.has(map.id)) spots.set(map.id, { map, mobs: [], spawns: 0 });
      const spot = spots.get(map.id);
      const count = Number.isInteger(location.count) ? location.count : null;
      spot.mobs.push({ name: mob.name, level: mob.level, count });
      spot.spawns += count ?? 0;
    }
  }
  const ranked = [...spots.values()].map(spot => {
    const route = currentMapId ? shortestRoute(data, currentMapId, spot.map.id) : null;
    const hops = route?.length ?? null;
    return { ...spot, hops, score: spot.spawns / (1 + .22 * (hops ?? 0)) };
  }).sort((a, b) => (a.hops === null) - (b.hops === null) || b.score - a.score || a.map.name.localeCompare(b.map.name));
  return { spots: ranked.slice(0, 30), unmapped: monsterNames.filter(name => !matched.has(normalize(name))) };
}

// Community-recorded drops of one monster (MapleClassic Wiki Cargo, CC BY-NC-SA 4.0).
export async function fetchMonsterDrops(monsterName) {
  if (typeof monsterName !== 'string' || !monsterName.trim() || monsterName.length > 160) throw new Error('Choose a valid monster.');
  const params = new URLSearchParams({
    action: 'cargoquery', tables: 'monster_drops', fields: 'monster_id,item_id',
    where: `monster_id='${monsterName.replaceAll("'", "''")}'`, limit: '200', format: 'json', origin: '*'
  });
  const response = await fetch(`https://mapleclassic.wiki/api.php?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('The community drop listing is unavailable right now.');
  const payload = await response.json();
  if (!Array.isArray(payload?.cargoquery)) throw new Error('The drop listing changed format.');
  return [...new Set(payload.cargoquery.map(row => String(row?.title?.['item id'] ?? '').trim()).filter(Boolean))];
}
