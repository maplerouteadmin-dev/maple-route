import { editDistance, normalize, shortestRoute } from './core.js';
import { craftRecipe, craftNeeds } from './refine.js';

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
export function huntGoals(data, progress, itemSources = {}, questText = '', allNeeds = [], crafting = null) {
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
      const craft = { item: name, discipline: recipe.discipline, npc: recipe.npcs.find(npc => npcMap(data, npc)) ?? recipe.npc, npcs: recipe.npcs, town: recipe.town, meso: plan.meso, makes: count };
      return plan.ingredients.flatMap(i => {
        const mob = mobByName(data, i.name), droppers = itemSources[i.name];
        if (mob) return [{ name: i.name, have: 0, need: i.count, done: false, kind: 'kill', monsters: [mob.name], pending: false, craft }];
        if (!droppers?.length) { const deeper = expand(i.name, i.count, depth + 1); if (deeper) return deeper; }
        return [{ name: i.name, have: 0, need: i.count, done: false, kind: 'collect', lookup: i.name, craft, monsters: (droppers ?? []).filter(mobName => mobByName(data, mobName)), pending: droppers === undefined }];
      });
    };
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
function hops(data, from, to) {
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
export function planHuntTrip(data, goals, currentMapId = null, endMapId = null, { via = [] } = {}) {
  const active = goals.filter(g => g.monsters?.length).slice(0, 3);
  if (!active.length) return null;
  const spawnsOn = (goal, mapId) => {
    let total = 0;
    for (const name of goal.monsters) total += mobByName(data, name)?.locations.find(l => l.mapId === mapId)?.count ?? 0;
    return total;
  };
  // Candidates per goal: its densest maps, the current map, and maps that cover several goals.
  const shared = rankObjectiveMaps(data, active, null).filter(m => m.goals.length > 1).slice(0, 3).map(m => m.mapId);
  const cap = goal => Math.min(20, 8 + Math.ceil(Math.max(1, (goal.need ?? 1) - (goal.have ?? 0)) / 5));
  const near = mapId => Math.min(...[currentMapId, endMapId].filter(Boolean).map(from => hops(data, from, mapId) ?? 99), currentMapId || endMapId ? 99 : 0);
  const candidates = active.map(goal => {
    const maps = new Map();
    for (const name of goal.monsters) for (const l of mobByName(data, name)?.locations ?? []) maps.set(l.mapId, (maps.get(l.mapId) ?? 0) + (l.count ?? 1));
    // Worth a look: enough spawns for what is left, close to where you are or where you hand in.
    const top = [...maps].map(([mapId, count]) => [mapId, Math.min(count, cap(goal)) * 3 - near(mapId) * 4]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([mapId]) => mapId);
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
      const score = value * 3 - total * 4 - (order.length - 1) * 8; // an extra stop must earn its keep
      if (!best || score > best.score) best = { score, hops: total, stops: order.map(mapId => ({ mapId, goals: active.filter((goal, i) => chosen[i] === mapId).map(goal => goal.name), monsters: [...new Set(active.filter((goal, i) => chosen[i] === mapId).flatMap(goal => goal.monsters.filter(name => spawnsOn({ monsters: [name] }, mapId))))], spawns: active.reduce((sum, goal, i) => sum + (chosen[i] === mapId ? spawnsOn(goal, mapId) : 0), 0) })) };
    }
  };
  visit(0, []);
  if (best) Object.assign(best, { endMapId, via });
  return best;
}

// Maps ranked by how much of the remaining work they cover (listed spawns of useful monsters),
// lightly penalised by distance.
export function rankObjectiveMaps(data, goals, currentMapId = null) {
  const scores = new Map();
  for (const goal of goals) for (const name of goal.monsters) {
    const mob = mobByName(data, name);
    for (const location of mob?.locations ?? []) {
      const entry = scores.get(location.mapId) ?? { mapId: location.mapId, spawns: 0, goals: new Set(), monsters: new Set() };
      // A monster that covers two needs (kill it AND collect its drop) is still one set of spawns.
      if (!entry.monsters.has(mob.name)) entry.spawns += location.count ?? 1;
      entry.goals.add(goal.name); entry.monsters.add(mob.name);
      scores.set(location.mapId, entry);
    }
  }
  return [...scores.values()].map(entry => {
    const route = currentMapId ? shortestRoute(data, currentMapId, entry.mapId) : null;
    const hops = currentMapId === entry.mapId ? 0 : route?.length ?? null;
    return { ...entry, goals: [...entry.goals], monsters: [...entry.monsters], hops, score: entry.goals.size * 100 + Math.min(entry.spawns, 60) - (hops ?? 20) * 3 };
  }).filter(entry => entry.hops !== null || entry.mapId === currentMapId).sort((a, b) => b.score - a.score);
}

export function questObjective(data, { quest, helperQuest = null, catalogQuest = null, itemSources = {}, currentMapId = null, handIn = false, crafting = null }) {
  const turnInNpc = catalogQuest?.turnIn || catalogQuest?.giver || null;
  const turnIn = () => { const mapId = turnInNpc ? npcMap(data, turnInNpc) : null; return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId }; };
  if (handIn) return turnIn();
  if (helperQuest?.progress?.length) {
    if (helperQuest.complete) {
      const mapId = turnInNpc ? npcMap(data, turnInNpc) : null;
      return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId };
    }
    const goals = huntGoals(data, helperQuest.progress, itemSources, catalogQuest?.text, (catalogQuest?.needs ?? []).map(n => n.name), crafting);
    const maps = rankObjectiveMaps(data, goals, currentMapId);
    const trip = planHuntTrip(data, goals, currentMapId, turnInNpc ? npcMap(data, turnInNpc) : null, { via: craftStops(data, goals) });
    const best = trip?.stops[0] ?? maps[0] ?? null;
    const hereEntry = maps.find(m => m.mapId === currentMapId) ?? null;
    // Already on a map that covers something: stay and hunt rather than being sent elsewhere.
    const target = hereEntry ?? best;
    return {
      quest, stage: 'hunt', goals, maps: maps.slice(0, 4), trip, mapId: target?.mapId ?? null, here: Boolean(hereEntry),
      done: helperQuest.progress.filter(p => p.done), pending: goals.some(g => g.pending)
    };
  }
  // Quest Helper not on screen: the game data says what to hunt/collect (counts not readable, so 0),
  // and a quest with nothing to collect is a talk/delivery quest: go straight to the hand-in NPC.
  const needs = catalogQuest?.needs ?? null;
  if (Array.isArray(needs)) {
    if (!needs.length) return turnIn();
    const goals = huntGoals(data, needs.map(n => ({ name: n.name, have: 0, need: n.count, done: false })), itemSources, catalogQuest?.text, needs.map(n => n.name), crafting);
    const maps = rankObjectiveMaps(data, goals, currentMapId), trip = planHuntTrip(data, goals, currentMapId, turnInNpc ? npcMap(data, turnInNpc) : null, { via: craftStops(data, goals) });
    const hereEntry = maps.find(m => m.mapId === currentMapId) ?? null, target = hereEntry ?? trip?.stops[0] ?? maps[0] ?? null;
    return { quest, stage: 'hunt', goals, maps: maps.slice(0, 4), trip, mapId: target?.mapId ?? null, here: Boolean(hereEntry), done: [], pending: goals.some(g => g.pending), countsUnknown: true };
  }
  return { quest, stage: 'unknown', npc: turnInNpc, mapId: null, here: false };
}
