// Jump quests (the Forest of Patience and the Deep Forest of Patience): an NPC sends you in, and the
// quest item is picked from a pile at the top. Both come from the OSMS map data's NPC lists (Shane in
// Ellinia, the Mysterious Statue in Sleepywood, "A pile of flowers" on step 2…); which pile gives which
// item follows the quest texts. No route or drop table had them, so the plan had nowhere to send you.
import { normalize } from './core.js';

export const JUMP_QUEST_WARPS = [
  { npc: 'Shane', town: 'Ellinia', to: 'The Forest of Patience <Step 1>', note: 'Shane takes you into the Forest of Patience (a jump quest) while you have its quest.' },
  { npc: 'Shane', town: 'Ellinia', to: 'The Forest of Patience <Step 3>', note: 'Shane takes you to the upper Forest of Patience (a jump quest) while you have its quest.' },
  { npc: 'Mysterious Statue', town: 'Sleepywood', to: 'The Deep Forest of Patience <Step 1>', note: 'The Mysterious Statue takes you into the Deep Forest of Patience (a jump quest) while you have its quest.' }
];
// The way back out: the NPC on every step of the jump quest (Louis, the Crumbling Statue).
export const JUMP_QUEST_EXITS = [
  { npc: 'Louis', maps: 'The Forest of Patience <', to: 'Ellinia', note: 'Talk to Louis to leave the Forest of Patience.' },
  { npc: 'Crumbling Statue', maps: 'The Deep Forest of Patience <', to: 'Sleepywood', note: 'Talk to the Crumbling Statue to leave the Deep Forest of Patience.' }
];
export const JUMP_QUEST_PILES = [
  { item: 'Pink Anthurium', pile: 'A pile of flowers', map: 'The Forest of Patience <Step 2>' },
  { item: 'Double-Rooted Red Ginseng', pile: 'A pile of herbs', map: 'The Forest of Patience <Step 5>' },
  { item: 'Pink Viola', pile: 'A pile of pink flowers', map: 'The Deep Forest of Patience <Step 2>' },
  { item: 'Blue Viola', pile: 'A pile of blue flowers', map: 'The Deep Forest of Patience <Step 4>' },
  { item: 'White Viola', pile: 'A pile of white flowers', map: 'The Deep Forest of Patience <Step 7>' }
];

const mapNamed = (data, name) => (data.maps ?? []).find(map => normalize(map.name) === normalize(name));

// Extra exits for the travel graph: from the NPC's own map (and spot) into the jump quest.
export function jumpQuestEdges(data) {
  const edges = [];
  for (const warp of JUMP_QUEST_WARPS) {
    const to = mapNamed(data, warp.to);
    const from = (data.maps ?? []).find(map => (map.npcs ?? []).some(npc => npc.name === warp.npc) && (!warp.town || map.name === warp.town))
      ?? (data.maps ?? []).find(map => (map.npcs ?? []).some(npc => npc.name === warp.npc));
    if (!to || !from) continue;
    const spot = from.npcs.find(npc => npc.name === warp.npc);
    edges.push({ from: from.id, to: to.id, name: warp.npc, kind: 'special', npc: warp.npc, cost: 2, arrive: '', note: warp.note, x: spot?.x ?? null, y: spot?.y ?? null });
  }
  for (const exit of JUMP_QUEST_EXITS) {
    const to = (data.maps ?? []).find(map => map.name === exit.to && /victoria/i.test(map.area ?? '')) ?? mapNamed(data, exit.to);
    if (!to) continue;
    for (const map of (data.maps ?? []).filter(m => m.name.startsWith(exit.maps))) {
      const spot = (map.npcs ?? []).find(npc => npc.name === exit.npc);
      if (spot) edges.push({ from: map.id, to: to.id, name: exit.npc, kind: 'special', npc: exit.npc, cost: 2, arrive: '', note: exit.note, x: spot.x ?? null, y: spot.y ?? null });
    }
  }
  return edges;
}
// The pile that gives an item, as a target to go to (worded "pick from …", never counted as a monster).
export function pileTarget(data, itemName) {
  const pile = JUMP_QUEST_PILES.find(entry => normalize(entry.item) === normalize(itemName));
  const map = pile && mapNamed(data, pile.map);
  if (!map) return null;
  return { id: `pile:${normalize(pile.pile)}:${map.id}`, name: pile.pile, kind: 'mob', reactor: true, pile: true, level: null, gives: pile.item, locations: [{ mapId: map.id, count: 1 }] };
}
