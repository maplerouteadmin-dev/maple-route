import { normalize, shortestRoute } from './core.js';

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
export function huntGoals(data, progress, itemSources = {}) {
  return progress.filter(p => !p.done).map(p => {
    const mob = mobByName(data, p.name);
    if (mob) return { ...p, kind: 'kill', monsters: [mob.name], pending: false };
    const droppers = itemSources[p.name];
    return { ...p, kind: 'collect', monsters: (droppers ?? []).filter(name => mobByName(data, name)), pending: droppers === undefined };
  });
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

export function questObjective(data, { quest, helperQuest = null, catalogQuest = null, itemSources = {}, currentMapId = null, handIn = false }) {
  const turnInNpc = catalogQuest?.turnIn || catalogQuest?.giver || null;
  const turnIn = () => { const mapId = turnInNpc ? npcMap(data, turnInNpc) : null; return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId }; };
  if (handIn) return turnIn();
  if (helperQuest?.progress?.length) {
    if (helperQuest.complete) {
      const mapId = turnInNpc ? npcMap(data, turnInNpc) : null;
      return { quest, stage: 'turn-in', npc: turnInNpc, mapId, here: mapId === currentMapId };
    }
    const goals = huntGoals(data, helperQuest.progress, itemSources);
    const maps = rankObjectiveMaps(data, goals, currentMapId);
    const best = maps[0] ?? null;
    const hereEntry = maps.find(m => m.mapId === currentMapId) ?? null;
    // Already on a map that covers something: stay and hunt rather than being sent elsewhere.
    const target = hereEntry ?? best;
    return {
      quest, stage: 'hunt', goals, maps: maps.slice(0, 4), mapId: target?.mapId ?? null, here: Boolean(hereEntry),
      done: helperQuest.progress.filter(p => p.done), pending: goals.some(g => g.pending)
    };
  }
  // Quest Helper not on screen: the game data says what to hunt/collect (counts not readable, so 0),
  // and a quest with nothing to collect is a talk/delivery quest: go straight to the hand-in NPC.
  const needs = catalogQuest?.needs ?? null;
  if (Array.isArray(needs)) {
    if (!needs.length) return turnIn();
    const goals = huntGoals(data, needs.map(n => ({ name: n.name, have: 0, need: n.count, done: false })), itemSources);
    const maps = rankObjectiveMaps(data, goals, currentMapId), hereEntry = maps.find(m => m.mapId === currentMapId) ?? null, target = hereEntry ?? maps[0] ?? null;
    return { quest, stage: 'hunt', goals, maps: maps.slice(0, 4), mapId: target?.mapId ?? null, here: Boolean(hereEntry), done: [], pending: goals.some(g => g.pending), countsUnknown: true };
  }
  return { quest, stage: 'unknown', npc: turnInNpc, mapId: null, here: false };
}
