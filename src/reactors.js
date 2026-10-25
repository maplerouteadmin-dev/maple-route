// Breakable objects ("reactors") that give quest items: the Ellinia Flower gives Plant Samples
// (Research on Plant Fossils) a third of the time, only while the quest is active. No monster drops
// these items, so without this the plan had nowhere to send you. MapleClassic Wiki (CC BY-NC-SA):
// `reactor_drops` says which reactor gives an item; each reactor's page lists its maps and counts.
// No dataset has their exact positions, so the planner uses the per-map counts.
import { normalize } from './core.js';

const WIKI = 'https://mapleclassic.wiki/api.php';
const decode = text => String(text ?? '').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

// The "Locations" table on a reactor page: | {{map|The Forest North of Ellinia}} || 24
export function parseReactorLocations(wikitext) {
  const out = [];
  for (const match of String(wikitext ?? '').matchAll(/\{\{map\|([^}|]+)(?:\|[^}]*)?\}\}\s*\|\|\s*(\d+)/g)) out.push({ map: match[1].trim(), count: Number(match[2]) });
  return out;
}

export function parseReactorDrops(payload) {
  return (payload?.cargoquery ?? []).map(row => row.title ?? {}).map(row => ({
    reactor: decode(row['reactor id']), item: decode(row['item id']), rate: Number(row['drop rate']) || null, quest: decode(row['required quest']) || null
  })).filter(row => row.reactor && row.item);
}

// Reactors as hunting targets: kind 'mob' (so every planner, step and map count treats them like a
// monster to go to), marked `reactor` so they are worded "hit …" and not counted as monsters.
export function reactorTargets(data, sources) {
  const byName = name => (data.maps ?? []).find(m => m.name === name && /victoria/i.test(m.area ?? '')) ?? (data.maps ?? []).find(m => normalize(m.name) === normalize(name));
  return sources.map(source => ({
    id: `reactor:${normalize(source.reactor)}`, name: source.reactor, kind: 'mob', reactor: true, level: null,
    gives: source.item, rate: source.rate, quest: source.quest,
    locations: source.locations.map(l => ({ mapId: byName(l.map)?.id, count: l.count })).filter(l => l.mapId)
  })).filter(t => t.locations.length);
}

export async function fetchReactorSources(itemName) {
  if (typeof itemName !== 'string' || !itemName.trim() || itemName.length > 160) return [];
  const params = new URLSearchParams({ action: 'cargoquery', tables: 'reactor_drops', fields: 'reactor_id,item_id,drop_rate,required_quest', where: `item_id='${itemName.replaceAll("'", "''")}'`, limit: '50', format: 'json', origin: '*' });
  const response = await fetch(`${WIKI}?${params}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const drops = parseReactorDrops(await response.json());
  const out = [];
  for (const drop of drops) {
    const page = await fetch(`${WIKI}?${new URLSearchParams({ action: 'parse', page: drop.reactor, prop: 'wikitext', format: 'json', origin: '*' })}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    out.push({ ...drop, locations: parseReactorLocations(page?.parse?.wikitext?.['*']) });
  }
  return out;
}
