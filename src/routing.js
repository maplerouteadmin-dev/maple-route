import { searchRoute, normalize } from './core.js';

const UNCERTAIN = /hidden|quest|event|ticket|ship|ferry|subway|locked|gate|boss|one.way|special|timed/i;

export function uncertainPortal(portal) {
  return portal.kind === 'hidden' || portal.kind === 'special' || UNCERTAIN.test(`${portal.name} ${portal.note}`);
}

// How you can travel: the portal graph minus taxis when they are off (boats stay: Shanks is the only
// way off Maple Island), plus a Return to Nearest Town scroll from every map to its town when scrolls
// are on. Routes and every "N maps away" use this same graph so they always agree.
const TOWN_SCROLLS = ['Henesys', 'Ellinia', 'Perion', 'Kerning City', 'Lith Harbor', 'Sleepywood', 'Forgotten Hollow'];
const travelCache = new WeakMap();
// `nearest`: Return Scroll - Nearest Town; `towns`: the town scrolls (each a separate choice).
// `taxis` = Regular Cabs and Phil; `vip` = the VIP Cab (10,000 mesos) on its own switch. Boats always count.
export function travelGraph(data, { taxis = true, vip = taxis, nearest = false, towns: townScrolls = false, scrolls = false } = {}) {
  if (scrolls) { nearest = true; townScrolls = true; }
  const key = `${taxis}|${vip}|${nearest}|${townScrolls}`, byData = travelCache.get(data) ?? new Map();
  travelCache.set(data, byData);
  if (byData.has(key)) return byData.get(key);
  const known = new Set(data.maps.map(m => m.id));
  const portals = data.portals.filter(p => p.kind !== 'taxi' || p.boat || (p.npc === 'VIP Cab' ? vip : taxis));
  if (nearest || townScrolls) {
    // Return Scroll - Nearest Town (to the map's own return town) and the town scrolls Classic sells
    // (Return Scroll to Henesys, Ellinia, Perion, Kerning City, Lith Harbor, Sleepywood, Forgotten Hollow).
    // A scroll costs a little more than a portal hop, so a short walk still wins.
    const towns = !townScrolls ? [] : TOWN_SCROLLS.map(name => data.maps.find(m => m.name === name && /victoria/i.test(m.area ?? '')) ?? data.maps.find(m => m.name === name)).filter(Boolean);
    for (const map of data.maps) {
      if (nearest && map.returnTo && known.has(map.returnTo)) portals.push({ from: map.id, to: map.returnTo, name: 'Return Scroll - Nearest Town', kind: 'scroll', cost: 2, arrive: '', note: '', x: null, y: null });
      for (const town of towns) if (town.id !== map.id && town.id !== map.returnTo) portals.push({ from: map.id, to: town.id, name: `Return Scroll to ${town.name}`, kind: 'scroll', cost: 3, arrive: '', note: '', x: null, y: null });
    }
  }
  const graph = { ...data, portals };
  byData.set(key, graph);
  return graph;
}

// `taxis: false` leaves NPC rides out entirely.
export function routeWithPreference(data, start, destination, preference = 'fewest', playerLevel = 1, { taxis = true } = {}) {
  const highMobs = new Map();
  if (preference === 'level') for (const mob of data.targets ?? []) {
    if (mob.kind !== 'mob' || mob.special || !Number.isFinite(mob.level)) continue;
    for (const location of mob.locations) highMobs.set(location.mapId, Math.max(highMobs.get(location.mapId) ?? 0, mob.level));
  }
  return searchRoute(data, start, destination, portal => {
    if (!taxis && portal.kind === 'taxi' && !portal.boat) return Infinity;
    let cost = portal.cost;
    if (preference === 'cautious' && uncertainPortal(portal)) cost += 30;
    if (preference === 'level' && portal.to !== destination) cost += Math.min(30, Math.max(0, (highMobs.get(portal.to) ?? 0) - Number(playerLevel) - 8) * 2);
    return cost;
  });
}

// Why no route exists, and the closest map you *can* walk to. Maps behind NPC warps (subways,
// jump quests, boarding areas) form islands in the portal graph; name overlap finds the likely entrance town.
export function explainNoRoute(data, start, destination) {
  const reachable = new Set([start]), queue = [start];
  const outgoing = new Map();
  for (const portal of data.portals) (outgoing.get(portal.from) ?? outgoing.set(portal.from, []).get(portal.from)).push(portal.to);
  while (queue.length) for (const next of outgoing.get(queue.shift()) ?? []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
  const target = data.maps.find(map => map.id === destination);
  const words = new Set(normalize(target?.name).split(' ').filter(word => word.length > 2 && !/^(area|the|b\d|step|road)$/.test(word)));
  let best = null, bestScore = 0;
  for (const map of data.maps) {
    if (!reachable.has(map.id) || map.id === start) continue;
    const score = normalize(map.name).split(' ').filter(word => words.has(word)).length + (map.area && map.area === target?.area ? .1 : 0);
    if (score > bestScore) { best = map; bestScore = score; }
  }
  return { reachableCount: reachable.size, nearest: bestScore >= 1 ? best : null };
}

export function routeTradeoff(data, route, preference, level) {
  const flagged = route.filter(uncertainPortal).length;
  const high = new Set();
  for (const mob of data.targets ?? []) if (mob.kind === 'mob' && !mob.special && mob.level > Number(level) + 8)
    for (const location of mob.locations) if (route.some(step => step.to === location.mapId)) high.add(location.mapId);
  const summary = preference === 'level' ? 'Prefers passing through maps without listed monsters far above your level.' : preference === 'cautious' ? 'Adds a large penalty to exits whose labels or data cost suggest special travel.' : 'Minimizes the number of portal transitions.';
  return { summary, flagged, highMaps: high.size };
}
