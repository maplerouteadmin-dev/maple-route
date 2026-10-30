import { normalize } from './core.js';

// Audit the live catalog without bundling or publishing it. A directed graph matters:
// a portal into a room does not prove the player can walk back out of it.
export function auditQuestRoutes(data, quests, startMapNames = ['Henesys', 'Kerning City', 'Perion', 'Ellinia', 'Lith Harbor', 'Sleepywood', 'Mushroom Town']) {
  const starts = data.maps.filter(map => startMapNames.some(name => normalize(map.name) === normalize(name))).map(map => map.id);
  const outgoing = new Map();
  for (const portal of data.portals) {
    if (!outgoing.has(portal.from)) outgoing.set(portal.from, []);
    outgoing.get(portal.from).push(portal.to);
  }
  const reachable = new Set(starts), queue = [...starts];
  while (queue.length) for (const to of outgoing.get(queue.shift()) ?? []) if (!reachable.has(to)) { reachable.add(to); queue.push(to); }
  const npcs = new Map();
  for (const target of data.targets ?? []) if (target.kind === 'npc') {
    const key = normalize(target.name), ids = npcs.get(key) ?? new Set();
    for (const location of target.locations ?? []) ids.add(location.mapId);
    npcs.set(key, ids);
  }
  const issues = [];
  for (const quest of quests) for (const [role, npc] of [['giver', quest.giver], ['hand-in', quest.turnIn]]) {
    if (!npc) continue;
    const locations = [...(npcs.get(normalize(npc)) ?? [])];
    if (!locations.length || !locations.some(id => reachable.has(id))) issues.push({ quest: quest.name, role, npc,
      status: locations.length ? 'isolated' : 'unmapped', maps: locations.map(id => data.maps.find(map => map.id === id)?.name ?? id) });
  }
  return { starts: starts.length, reachable: reachable.size, checked: quests.length, issues };
}
