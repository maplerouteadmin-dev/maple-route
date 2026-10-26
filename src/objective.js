import { editDistance, normalize, shortestRoute } from './core.js';
import { craftRecipe, craftNeeds } from './refine.js';
import { sellersOf } from './shops.js';
import { huntRisk } from './huntsafety.js';

// What the player should be doing right now for one quest, from the live Quest Helper counts (or the
// wiki steps when the quest is not on screen): hunt/collect on the best map, or hand the quest in.
//
// `helperQuest`: { progress: [{ name, have, need, done }], complete } read from the screen, or null.
// `catalogQuest`: { name, giver, turnIn } from the wiki catalog.
// `itemSources`: { [itemName]: [monsterName, ...] } wiki drop records, filled in as they load.

const mobByName = (data, name) => (data.targets ?? []).find(t => t.kind === 'mob' && normalize(t.name) === normalize(name));
const npcMap = (data, npcName) => (data.targets ?? []).find(t => t.kind === 'npc' && normalize(t.name) === normalize(npcName))?.locations[0]?.mapId ?? null;

// Each unfinished count becomes a goal with the monsters that satisfy it: the monster itself for a
// kill count, or the monsters recorded as dropping the item.
// The Quest Helper count for one need, by the closest whole name ("Omok Piece Mushroom" must not
// take the count of "Omok Piece Octopus", which shares its first words). OCR slips allowed.
const stemName = text => normalize(text).split(' ').map(word => word.replace(/(es|s)$/, '')).join(' ');
export function matchCount(progress, name) {
  const want = stemName(name);
  if (!want) return null;
  let best = null, bestDistance = Infinity, tie = false;
  for (const p of progress ?? []) {
    const got = stemName(p.name);
    const distance = got === want ? 0 : got.startsWith(want) || want.startsWith(got) && got.length >= want.length - 2 ? 1 : editDistance(got, want);
    if (distance < bestDistance) { best = p; bestDistance = distance; tie = false; } else if (distance === bestDistance) tie = true;
  }
  return best && !tie && bestDistance <= Math.max(2, Math.floor(want.length / 6)) ? best : null;
}

// A finished count is believable when it is not wildly over what is needed (a misread "7/1").
export const believableDone = p => Boolean(p?.done) && p.need > 0 && p.have <= Math.max(p.need * 2, p.need + 2);

// The Quest Helper says a quest is complete only if every one of its needs was read: a wrapped
// line can hide one (read as its own heading), leaving only the finished counts on screen.
export const helperComplete = (quest, expectedNeeds = null) => Boolean(quest?.progress?.length) && quest.progress.every(p => p.done) && (!expectedNeeds || quest.progress.length >= expectedNeeds);

// When the wiki has no drop record for an item, the quest's own text often names the monsters
// ("I can get them by defeating Stump, Orange Mushroom, and Octopus"); those become `guess` goals.
export function huntGoals(data, progress, itemSources = {}, questText = '', allNeeds = [], crafting = null, shops = null) {
  const goals = progress.filter(p => !p.done).flatMap(p => {
    const mob = mobByName(data, p.name);
    if (mob) return { ...p, kind: 'kill', monsters: [mob.name], pending: false };
    // Made, not dropped (a Garnet, an ingot, a Screw): each ingredient becomes a goal, and `craft`
    // says where to make it (the game files' recipe; the trip passes that NPC before the hand-in).
    // An ingredient that is itself made (Screws for a Monkey Wrench) is expanded once more.
    const expand = (name, count, depth) => {
      const recipe = itemSources[name]?.length || depth > 2 ? null : craftRecipe(crafting, name);
      if (!recipe) return null;
      const plan = craftNeeds(recipe, count);
      const craft = { item: name, discipline: recipe.discipline, npc: recipe.npcs.find(npc => npcMap(data, npc)) ?? recipe.npc, npcs: recipe.npcs, town: recipe.town, meso: plan.meso, makes: count, level: recipe.level, master: recipe.master };
      return plan.ingredients.flatMap(i => {
        const mob = mobByName(data, i.name), droppers = itemSources[i.name];
        if (mob) return [{ name: i.name, have: 0, need: i.count, done: false, kind: 'kill', monsters: [mob.name], pending: false, craft }];
        // An ingredient a shop sells (dyes, thread…): buy it.
        const sellers = droppers?.length ? [] : sellersOf(shops, i.name);
        if (sellers.length) return [{ name: i.name, have: 0, need: i.count, done: false, kind: 'buy', monsters: [], pending: false, craft, buy: { sellers: sellers.map(x => ({ ...x, mapId: npcMap(data, x.npc) })).filter(x => x.mapId) } }];
        if (!droppers?.length) { const deeper = expand(i.name, i.count, depth + 1); if (deeper) return deeper; }
        return [{ name: i.name, have: 0, need: i.count, done: false, kind: 'collect', lookup: i.name, craft, monsters: (droppers ?? []).filter(mobName => mobByName(data, mobName)), pending: droppers === undefined }];
      });
    };
    // Sold by an NPC shop (a Salad at Raymond's): buy it, it is the sure way to get it.
    const sellers = sellersOf(shops, p.name);
    if (sellers.length) return [{ ...p, kind: 'buy', monsters: [], pending: false, buy: { sellers: sellers.map(s => ({ ...s, mapId: npcMap(data, s.npc) })).filter(s => s.mapId) } }];
    const crafted = expand(p.name, Math.max(1, (p.need ?? 1) - (p.have ?? 0)), 1);
    if (crafted) return crafted;
    const droppers = itemSources[p.name];
    return { ...p, kind: 'collect', monsters: (droppers ?? []).filter(name => mobByName(data, name)), pending: droppers === undefined };
  });
  const missing = goals.filter(g => g.kind === 'collect' && !g.pending && !g.monsters.length);
  if (!missing.length) return goals;
  const named = questText ? textMonsters(data, questText) : [];
  const mobNames = (data.targets ?? []).filter(t => t.kind === 'mob').map(t => t.name);
  const words = name => normalize(name).split(' ').filter(word => word.length >= 3).map(word => word.replace(/(es|s)$/, ''));
  // Monsters whose whole name is in the item's name ("Lorang Claw" → Lorang), named in the text or not.
  const inName = item => { const text = ` ${words(item).join(' ')} `; return mobNames.filter(mob => words(mob).length && text.includes(` ${words(mob).join(' ')} `)); };
  // The monsters that best fit an item: most shared words, then fewest extra words ("Dark Stone Golem
  // Rubble" → Dark Stone Golem, "Pig's Ribbon" → Ribbon Pig, "Omok Piece: Mushroom" → Orange Mushroom).
  const bestFit = item => {
    const want = words(item), pool = [...new Set([...named, ...inName(item)])];
    let best = [], top = 0, fewest = Infinity;
    for (const mob of pool) {
      const own = words(mob), shared = own.filter(word => want.includes(word)).length, extra = own.length - shared;
      if (!shared) continue;
      if (shared > top || (shared === top && extra < fewest)) { best = [mob]; top = shared; fewest = extra; }
      else if (shared === top && extra === fewest) best.push(mob);
    }
    return best;
  };
  // Monsters already accounted for by any need, finished ones included (the Octopus of a ticked-off
  // "Omok Piece: Octopus" does not drop the table).
  const claimed = new Set(goals.flatMap(g => g.monsters));
  for (const p of [...progress, ...allNeeds.map(name => ({ name }))]) {
    for (const mob of bestFit(p.name)) claimed.add(mob);
    for (const mob of itemSources[p.name] ?? []) claimed.add(mob);
    if (mobByName(data, p.name)) claimed.add(mobByName(data, p.name).name);
  }
  for (const g of missing) {
    const fit = bestFit(g.name), left = named.filter(mob => !claimed.has(mob));
    // A crafting ingredient is matched by its name only ("Iron Hog's Metal Hoof" → Iron Hog): the
    // quest text is about the finished item, not what it is made from.
    g.monsters = fit.length ? fit : g.craft ? [] : left.length ? left : named;
    if (g.monsters.length) g.guess = true;
    // Nothing drops it as far as any source knows: usually handed over by an NPC during the quest.
    else if (!g.craft) g.given = true;
  }
  return goals;
}

// Monster names that appear in a quest's text, longest first so "Orange Mushroom" is not also read
// as a shorter name inside it.
export function textMonsters(data, text) {
  let rest = ` ${normalize(text)} `;
  if (!rest.trim()) return [];
  const found = [];
  const mobs = (data.targets ?? []).filter(t => t.kind === 'mob').sort((a, b) => b.name.length - a.name.length);
  for (const mob of mobs) {
    const key = normalize(mob.name); if (!key) continue;
    const pattern = new RegExp(` ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s? `);
    if (pattern.test(rest)) { found.push(mob.name); rest = rest.replace(new RegExp(pattern.source, 'g'), ' · '); }
  }
  return found;
}

// Where crafted items get made on the way to the hand-in (Sleepywood for jewels, Perion for ingots…).
export const craftNpc = (data, craft) => (craft?.npcs ?? []).find(name => npcMap(data, name)) ?? null;
export const craftStops = (data, goals) => [...new Set(goals.filter(g => g.craft).map(g => npcMap(data, craftNpc(data, g.craft) ?? '')).filter(Boolean))];

// Map-to-map hop counts, remembered per dataset (trip planning asks for the same pairs a lot).
const hopCache = new WeakMap();
export function hops(data, from, to) {
  if (!from || !to) return 0;
  if (from === to) return 0;
  let cache = hopCache.get(data); if (!cache) hopCache.set(data, cache = new Map());
  const key = `${from}>${to}`;
  if (!cache.has(key)) cache.set(key, shortestRoute(data, from, to)?.length ?? null);
  return cache.get(key);
}

// The best hunting trip for everything still needed, ending at the hand-in NPC: either one map that
// has it all, or one stop per need in the best order (Stumps on one map, then Orange Mushrooms on
// another, then Casey). Scored by spawns of the wanted monsters minus every hop of the whole trip.
export function planHuntTrip(data, goals, currentMapId = null, endMapId = null, { via = [], playerLevel = null } = {}) {
  goals = shareMonsterThresholds(goals);
  const active = goals.filter(g => g.monsters?.length).slice(0, 3);
  if (!active.length) return null;
  const spawnsOn = (goal, mapId) => goalSpawns(data, goal).get(mapId) ?? 0;
  // Candidates per goal: its densest maps, the current map, and maps that cover several goals.
  const shared = rankObjectiveMaps(data, active, null, { playerLevel }).filter(m => m.goals.length > 1).slice(0, 3).map(m => m.mapId);
  const cap = goal => Math.min(20, 8 + Math.ceil(Math.max(1, (goal.need ?? 1) - (goal.have ?? 0)) / 5));
  const near = mapId => Math.min(...[currentMapId, endMapId].filter(Boolean).map(from => hops(data, from, mapId) ?? 99), currentMapId || endMapId ? 99 : 0);
  const candidates = active.map(goal => {
    const maps = goalSpawns(data, goal);
    // Worth a look: enough spawns for what is left, close to where you are or where you hand in.
    const top = [...maps].map(([mapId, count]) => [mapId, Math.min(count, cap(goal)) * 3 - near(mapId) * 4 - huntRisk(data, mapId, playerLevel, goal.monsters).penalty]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([mapId]) => mapId);
    for (const mapId of [currentMapId, ...shared]) if (mapId && maps.has(mapId) && !top.includes(mapId)) top.push(mapId);
    return top;
  });
  const orders = list => list.length <= 1 ? [list] : list.flatMap((item, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [item, ...rest]));
  let best = null;
  const visit = (index, chosen) => {
    if (index < active.length) { for (const mapId of candidates[index]) visit(index + 1, [...chosen, mapId]); return; }
    const stops = [...new Set(chosen)];
    for (const order of orders(stops)) {
      let total = 0, ok = true, at = currentMapId;
      for (const mapId of [...order, ...via, endMapId].filter(Boolean)) { const h = at ? hops(data, at, mapId) : 0; if (h === null) { ok = false; break; } total += h; at = mapId; }
      if (!ok) continue;
      // More spawns only help up to a point, and less when few are still needed (1 item: ~9 spawns is plenty).
      const value = active.reduce((sum, goal, i) => sum + Math.min(spawnsOn(goal, chosen[i]), cap(goal)), 0);
      const risk = order.reduce((sum, mapId) => sum + huntRisk(data, mapId, playerLevel, active.filter((goal, i) => chosen[i] === mapId).flatMap(goal => goal.monsters)).penalty, 0);
      const score = value * 3 - total * 4 - (order.length - 1) * 8 - risk; // an extra stop must earn its keep
      if (!best || score > best.score) best = { score, hops: total, stops: order.map(mapId => ({ mapId, goals: active.filter((goal, i) => chosen[i] === mapId).map(goal => goal.name), monsters: [...new Set(active.filter((goal, i) => chosen[i] === mapId).flatMap(goal => goal.monsters.filter(name => spawnsOn({ monsters: [name] }, mapId))))], spawns: active.reduce((sum, goal, i) => sum + (chosen[i] === mapId ? spawnsOn(goal, mapId) : 0), 0) })) };
    }
  };
  visit(0, []);
  if (best) Object.assign(best, { endMapId, via });
  return best;
}

// A map is only worth hunting on if the monster spawns there often enough for what is still needed:
// 25 Green Mushrooms cannot be done on a map with 2 of them. Fewest spawns: 8 when 20+ are left, 6 for
// 10+, 4 for 4+, else 2. If no map anywhere has that many (a rare monster), the best maps still count.
// Needs met by the same monster ("Defeat 25 Axe Stump" and "12 Plant Fossil", which only Axe Stumps
// drop) must hunt on the same maps: they share the strictest "enough alive at once" threshold, so a
// map good enough for one is good enough for both. Goals sharing any monster form one group.
export function shareMonsterThresholds(goals) {
  const groups = [];
  for (const goal of goals) {
    const names = new Set((goal.monsters ?? []).map(normalize));
    const touching = groups.filter(g => [...names].some(n => g.names.has(n)));
    const merged = { names: new Set([...names, ...touching.flatMap(g => [...g.names])]), goals: [goal, ...touching.flatMap(g => g.goals)] };
    for (const g of touching) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  const strictest = new Map();
  for (const group of groups) { const min = Math.max(...group.goals.map(minSpawns)); for (const goal of group.goals) strictest.set(goal, min); }
  return goals.map(goal => goal.monsters?.length && strictest.get(goal) !== minSpawns(goal) ? { ...goal, minAlive: strictest.get(goal) } : goal);
}
export function minSpawns(goal) {
  if (Number.isFinite(goal?.minAlive)) return goal.minAlive;
  const left = Math.max(1, (goal?.need ?? 1) - (goal?.have ?? 0));
  return left >= 20 ? 8 : left >= 10 ? 6 : left >= 4 ? 4 : 2;
}
// Monsters of one kind alive at once on a map: its spawn points there, scaled down when the map's mob
// cap is below its total spawn points (East Domain of Perion: 71 points, 40 alive at once, so its 12
// Green Mushroom points give about 7). Without a cap in the data, the listed points.
const totalPoints = new WeakMap();
export function aliveAtOnce(data, mapId, count) {
  const map = (data.maps ?? []).find(m => m.id === mapId);
  if (!map?.capacity) return count;
  let totals = totalPoints.get(data);
  if (!totals) {
    totalPoints.set(data, totals = new Map());
    for (const t of data.targets ?? []) if (t.kind === 'mob' && !t.reactor) for (const l of t.locations ?? []) totals.set(l.mapId, (totals.get(l.mapId) ?? 0) + (l.count ?? 1));
  }
  const all = totals.get(mapId) ?? count;
  return all > map.capacity ? Math.round(count * map.capacity / all * 10) / 10 : count;
}
// The maps a goal can be done on: map id → its monsters alive there at once (summed).
const spawnCache = new WeakMap();
const enteredCache = new WeakMap();
export function goalSpawns(data, goal) {
  const key = `${goal.monsters?.join('|')}#${minSpawns(goal)}`;
  let byData = spawnCache.get(data); if (!byData) spawnCache.set(data, byData = new Map());
  if (byData.has(key)) return byData.get(key);
  // Maps no portal leads into (Pig Town: an unused map full of Ribbon Pigs) cannot be hunted on.
  let entered = enteredCache.get(data); if (!entered) enteredCache.set(data, entered = new Set((data.portals ?? []).map(p => p.to)));
  const all = new Map();
  for (const name of goal.monsters ?? []) { const target = mobByName(data, name); for (const l of target?.locations ?? []) if (!entered.size || entered.has(l.mapId)) all.set(l.mapId, (all.get(l.mapId) ?? 0) + (target.reactor ? (l.count ?? 1) : aliveAtOnce(data, l.mapId, l.count ?? 1))); }
  const min = minSpawns(goal), most = Math.max(0, ...all.values());
  const usable = new Map([...all].filter(([, count]) => count >= Math.min(min, most)));
  byData.set(key, usable);
  return usable;
}

// Maps ranked by how much of the remaining work they cover (listed spawns of useful monsters),
// lightly penalised by distance. Maps with too few of a goal's monsters do not count for it.
export function rankObjectiveMaps(data, goals, currentMapId = null, { playerLevel = null } = {}) {
  goals = shareMonsterThresholds(goals);
  const scores = new Map();
  for (const goal of goals) for (const name of goal.monsters) {
    const mob = mobByName(data, name), usable = goalSpawns(data, goal);
    for (const location of mob?.locations ?? []) {
      if (!usable.has(location.mapId)) continue;
      const entry = scores.get(location.mapId) ?? { mapId: location.mapId, spawns: 0, goals: new Set(), monsters: new Set() };
      // A monster that covers two needs (kill it AND collect its drop) is still one set of spawns.
      if (!entry.monsters.has(mob.name)) entry.spawns += Math.round(aliveAtOnce(data, location.mapId, location.count ?? 1));
      entry.goals.add(goal.name); entry.monsters.add(mob.name);
      scores.set(location.mapId, entry);
    }
  }
  return [...scores.values()].map(entry => {
    const route = currentMapId ? shortestRoute(data, currentMapId, entry.mapId) : null;
    const hops = currentMapId === entry.mapId ? 0 : route?.length ?? null;
    const risk = huntRisk(data, entry.mapId, playerLevel, [...entry.monsters]);
    return { ...entry, goals: [...entry.goals], monsters: [...entry.monsters], hops, risk, score: entry.goals.size * 100 + Math.min(entry.spawns, 60) - (hops ?? 20) * 3 - risk.penalty };
  }).filter(entry => entry.hops !== null || entry.mapId === currentMapId).sort((a, b) => b.score - a.score);
}

// One trip for several quests at once ("Plan all my quests together"): goals carry `quests` (which
// quests need them). Greedy: from where you are, the next stop is the map that covers the most of
// what is still needed for the least walking; crafters come after the hunting. Then each hand-in is
// put where it adds the fewest maps, but never before its quest's hunting (and crafting) is done, so
// a quest whose NPC is near its hunting map is handed in on the way. Hand-ins without quest names
// go at the end, nearest first. `handIns`: [{ mapId, quests: [names] }] (or plain map ids).
// `starts`: quests not accepted yet, [{ mapId, quests: [name], npc }]: each is picked up where it adds
// the fewest maps but before any hunting for it (kills only count once a quest is accepted), and its
// hand-in comes after it.
// Returns { order: [{ type: 'hunt'|'craft'|'handin', mapId, … }], stops, via, ends, hops, missing }.
export function planMultiTrip(data, goals, currentMapId = null, handIns = [], { via = [], starts = [], playerLevel = null } = {}) {
  goals = shareMonsterThresholds(goals);
  const active = goals.filter(g => g.monsters?.length);
  if (!active.length && !starts.length && !handIns.length && !goals.some(g => g.kind === 'buy')) return null;
  const ends = handIns.map(h => typeof h === 'string' ? { mapId: h, quests: [] } : h).filter(h => h.mapId);
  const cap = goal => Math.min(20, 8 + Math.ceil(Math.max(1, (goal.need ?? 1) - (goal.have ?? 0)) / 5));
  const spawnsOn = (goal, mapId) => goalSpawns(data, goal).get(mapId) ?? 0;
  // Candidate maps: the 25 that cover the most (by capped spawns over all goals).
  const value = new Map();
  for (const goal of active) for (const [mapId, count] of goalSpawns(data, goal)) value.set(mapId, (value.get(mapId) ?? 0) + Math.min(count, cap(goal)));
  const candidates = [...value].sort((a, b) => (b[1] * 3 - huntRisk(data, b[0], playerLevel, active.filter(goal => spawnsOn(goal, b[0]) > 0).flatMap(goal => goal.monsters)).penalty) - (a[1] * 3 - huntRisk(data, a[0], playerLevel, active.filter(goal => spawnsOn(goal, a[0]) > 0).flatMap(goal => goal.monsters)).penalty)).slice(0, 25).map(([mapId]) => mapId);
  if (currentMapId && value.has(currentMapId) && !candidates.includes(currentMapId)) candidates.push(currentMapId);
  const order = [], left = new Set(active);
  let at = currentMapId;
  while (left.size) {
    let best = null;
    for (const mapId of candidates) {
      const covered = [...left].filter(goal => spawnsOn(goal, mapId) > 0);
      if (!covered.length) continue;
      const h = at ? hops(data, at, mapId) : 0;
      if (h === null) continue;
      const score = covered.reduce((sum, goal) => sum + Math.min(spawnsOn(goal, mapId), cap(goal)), 0) * 3 - h * 4 - huntRisk(data, mapId, playerLevel, covered.flatMap(goal => goal.monsters)).penalty;
      if (!best || score > best.score) best = { mapId, covered, score };
    }
    if (!best) break;
    for (const goal of best.covered) left.delete(goal);
    order.push({ mapId: best.mapId, type: 'hunt', goals: best.covered.map(g => g.name), monsters: [...new Set(best.covered.flatMap(g => g.monsters.filter(name => spawnsOn({ monsters: [name] }, best.mapId))))],
      quests: [...new Set(best.covered.flatMap(g => g.quests ?? []))], spawns: best.covered.reduce((sum, g) => sum + spawnsOn(g, best.mapId), 0) });
    at = best.mapId;
  }
  // Crafters after the hunting, nearest first.
  const viaLeft = [...new Set(via.filter(Boolean))];
  while (viaLeft.length) { viaLeft.sort((a, b) => (hops(data, at, a) ?? 99) - (hops(data, at, b) ?? 99)); at = viaLeft.shift(); order.push({ mapId: at, type: 'craft' }); }
  // Quests not accepted yet: picked up where it adds the fewest maps, before their first hunting stop.
  const dist = (a, b) => !a ? 0 : (hops(data, a, b) ?? 99);
  const cheapest = (stop, from, to) => {
    let bestAt = from, bestCost = Infinity;
    for (let i = from; i <= to; i++) {
      const before = i === 0 ? currentMapId : order[i - 1].mapId, after = order[i]?.mapId ?? null;
      const cost = dist(before, stop.mapId) + (after ? dist(stop.mapId, after) - dist(before, after) : 0);
      if (cost < bestCost) { bestCost = cost; bestAt = i; }
    }
    order.splice(bestAt, 0, stop);
  };
  for (const start of starts.filter(s => s.mapId)) {
    const firstHunt = order.findIndex(o => o.type === 'hunt' && o.quests.some(q => start.quests.includes(q)));
    cheapest({ mapId: start.mapId, type: 'start', quests: start.quests, npc: start.npc ?? null }, 0, firstHunt === -1 ? order.length : firstHunt);
  }
  // Each hand-in where it adds the fewest maps, after the last stop its quest needs.
  const crafting = new Set(goals.filter(g => g.craft).flatMap(g => g.quests ?? []));
  const lastCraft = order.findLastIndex(o => o.type === 'craft');
  const named = ends.filter(end => end.quests.length), unnamed = ends.filter(end => !end.quests.length);
  for (const end of named) {
    let earliest = 0;
    for (const quest of end.quests) {
      earliest = Math.max(earliest, order.findLastIndex(o => (o.type === 'hunt' || o.type === 'start') && o.quests.includes(quest)) + 1);
      if (crafting.has(quest)) earliest = Math.max(earliest, lastCraft + 1);
      if ([...left].some(g => g.quests?.includes(quest))) earliest = order.length; // something has no spot: hand in last
    }
    let bestAt = order.length, bestCost = Infinity;
    for (let i = earliest; i <= order.length; i++) {
      const before = i === 0 ? currentMapId : order[i - 1].mapId, after = order[i]?.mapId ?? null;
      const cost = dist(before, end.mapId) + (after ? dist(end.mapId, after) - dist(before, after) : 0);
      if (cost < bestCost) { bestCost = cost; bestAt = i; }
    }
    order.splice(bestAt, 0, { mapId: end.mapId, type: 'handin', quests: end.quests });
  }
  // Things to buy: at whichever seller adds the fewest maps, after the quest is picked up and before
  // it is handed in (so a seller on the way to the hand-in NPC wins).
  for (const goal of goals.filter(g => g.kind === 'buy' && g.buy?.sellers?.length && !g.done)) {
    const startAt = order.findIndex(o => o.type === 'start' && o.quests.some(q => goal.quests?.includes(q))) + 1;
    const handIn = order.findIndex(o => o.type === 'handin' && o.quests.some(q => goal.quests?.includes(q)));
    let best = null;
    for (const seller of goal.buy.sellers) for (let i = startAt; i <= (handIn === -1 ? order.length : handIn); i++) {
      const before = i === 0 ? currentMapId : order[i - 1].mapId, after = order[i]?.mapId ?? null;
      const cost = dist(before, seller.mapId) + (after ? dist(seller.mapId, after) - dist(before, after) : 0);
      if (!best || cost < best.cost) best = { cost, i, seller };
    }
    // The chosen seller's citizenship need, and who sells it to anyone (no citizenship) as the fallback.
    if (best) order.splice(best.i, 0, { mapId: best.seller.mapId, type: 'buy', quests: goal.quests ?? [], item: goal.name, count: Math.max(1, (goal.need ?? 1) - (goal.have ?? 0)), npc: best.seller.npc, price: best.seller.price,
      grade: best.seller.grade ?? null, town: best.seller.town ?? '', open: best.seller.grade ? goal.buy.sellers.filter(x => !x.grade).map(x => ({ npc: x.npc, map: x.map, mapId: x.mapId })) : [] });
  }
  at = order.at(-1)?.mapId ?? currentMapId;
  const unnamedLeft = [...unnamed];
  while (unnamedLeft.length) { unnamedLeft.sort((a, b) => dist(at, a.mapId) - dist(at, b.mapId)); const next = unnamedLeft.shift(); order.push({ mapId: next.mapId, type: 'handin', quests: [] }); at = next.mapId; }
  // Total maps walked; a leg with no route (an NPC reached some other way, like the Truth Booth) is
  // left out of the count and the step marked, so the number stays honest.
  let total = 0, from = currentMapId;
  for (const step of order) { const h = from ? hops(data, from, step.mapId) : 0; if (h === null) step.noRoute = true; else total += h; from = step.mapId; }
  const stops = order.filter(o => o.type === 'hunt');
  return { order, stops, via: order.filter(o => o.type === 'craft').map(o => o.mapId), ends: order.filter(o => o.type === 'handin').map(o => o.mapId), hops: total, missing: [...left].map(g => g.name) };
}

export function questObjective(data, { quest, helperQuest = null, catalogQuest = null, itemSources = {}, currentMapId = null, handIn = false, crafting = null, shops = null, playerLevel = null }) {
  const turnInNpc = catalogQuest?.turnIn || catalogQuest?.giver || null;
  const turnIn = () => { const mapId = turnInNpc ? npcMap(data, turnInNpc) : null; return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId }; };
  if (handIn) return turnIn();
  if (helperQuest?.progress?.length) {
    if (helperQuest.complete) {
      const mapId = turnInNpc ? npcMap(data, turnInNpc) : null;
      return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId };
    }
    const goals = huntGoals(data, helperQuest.progress, itemSources, catalogQuest?.text, (catalogQuest?.needs ?? []).map(n => n.name), crafting, shops);
    const maps = rankObjectiveMaps(data, goals, currentMapId, { playerLevel });
    const trip = planHuntTrip(data, goals, currentMapId, turnInNpc ? npcMap(data, turnInNpc) : null, { via: craftStops(data, goals), playerLevel });
    const best = trip?.stops[0] ?? maps[0] ?? null;
    const hereEntry = maps.find(m => m.mapId === currentMapId) ?? null;
    // Already on a map that covers something: stay and hunt rather than being sent elsewhere.
    const target = hereEntry && (!hereEntry.risk.penalty || !maps.some(m => !m.risk.penalty)) ? hereEntry : best;
    return {
      quest, stage: 'hunt', goals, maps: maps.slice(0, 4), trip, mapId: target?.mapId ?? null, here: target?.mapId === currentMapId,
      done: helperQuest.progress.filter(p => p.done), pending: goals.some(g => g.pending)
    };
  }
  // Quest Helper not on screen: the game data says what to hunt/collect (counts not readable, so 0),
  // and a quest with nothing to collect is a talk/delivery quest: go straight to the hand-in NPC.
  const needs = catalogQuest?.needs ?? null;
  if (Array.isArray(needs)) {
    if (!needs.length) return turnIn();
    const goals = huntGoals(data, needs.map(n => ({ name: n.name, have: 0, need: n.count, done: false })), itemSources, catalogQuest?.text, needs.map(n => n.name), crafting, shops);
    const maps = rankObjectiveMaps(data, goals, currentMapId, { playerLevel }), trip = planHuntTrip(data, goals, currentMapId, turnInNpc ? npcMap(data, turnInNpc) : null, { via: craftStops(data, goals), playerLevel });
    const hereEntry = maps.find(m => m.mapId === currentMapId) ?? null, target = hereEntry && (!hereEntry.risk.penalty || !maps.some(m => !m.risk.penalty)) ? hereEntry : trip?.stops[0] ?? maps[0] ?? null;
    return { quest, stage: 'hunt', goals, maps: maps.slice(0, 4), trip, mapId: target?.mapId ?? null, here: target?.mapId === currentMapId, done: [], pending: goals.some(g => g.pending), countsUnknown: true };
  }
  return { quest, stage: 'unknown', npc: turnInNpc, mapId: null, here: false };
}
