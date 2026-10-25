// What the little card says when you click the map: the map itself (monsters with counts and levels,
// NPCs, exits), a monster (level, HP, EXP, how many here and alive at once, best other maps), or an
// NPC (quests they give or take, what they sell). Pure; the app positions the card.
import { normalize } from './core.js';
import { aliveAtOnce } from './objective.js';

const mob = (data, name) => (data.targets ?? []).find(t => t.kind === 'mob' && normalize(t.name) === normalize(name));
const mapName = (data, id) => (data.maps ?? []).find(m => m.id === id)?.name ?? '?';

export function mapInfo(data, mapId) {
  const map = (data.maps ?? []).find(m => m.id === mapId);
  if (!map) return null;
  const monsters = (data.targets ?? []).filter(t => t.kind === 'mob').flatMap(t => t.locations.filter(l => l.mapId === mapId).map(l => ({ name: t.name, level: t.level ?? null, count: l.count ?? null, alive: l.count ? Math.round(aliveAtOnce(data, mapId, l.count)) : null })))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const npcs = [...new Set((map.npcs ?? []).map(n => n.name))];
  const exits = [...new Set((data.portals ?? []).filter(p => p.from === mapId).map(p => mapName(data, p.to)))];
  return { title: map.name, area: map.area || '', capacity: map.capacity ?? null, monsters, npcs, exits };
}

export function mobInfo(data, name, mapId = null) {
  const target = mob(data, name);
  if (!target) return null;
  const here = target.locations.find(l => l.mapId === mapId);
  const best = target.locations.filter(l => l.mapId !== mapId).map(l => ({ map: mapName(data, l.mapId), alive: Math.round(aliveAtOnce(data, l.mapId, l.count ?? 1)) }))
    .sort((a, b) => b.alive - a.alive).slice(0, 3);
  return { title: target.name, level: target.level ?? null, hp: target.hp ?? null, exp: target.exp ?? null,
    here: here ? { count: here.count ?? null, alive: here.count ? Math.round(aliveAtOnce(data, mapId, here.count)) : null } : null, best };
}

// quests: the quest catalog ({ name, giver, turnIn }); shops: { item: [{ npc, price }] } (shops.js).
export function npcInfo(name, { quests = [], shops = null } = {}) {
  const key = normalize(name);
  const gives = quests.filter(q => normalize(q.giver) === key).map(q => q.name);
  const takes = quests.filter(q => q.turnIn && normalize(q.turnIn) === key && normalize(q.giver) !== key).map(q => q.name);
  const sells = Object.entries(shops ?? {}).flatMap(([item, sellers]) => sellers.filter(s => normalize(s.npc) === key).map(s => ({ item: s.item ?? item, price: s.price })));
  return { title: name, gives, takes, sells };
}
