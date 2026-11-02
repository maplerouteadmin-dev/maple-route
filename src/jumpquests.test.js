import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, searchRoute } from './core.js';
import { jumpQuestEdges, pileTarget } from './jumpquests.js';
import { textMonsters } from './objective.js';
import { travelGraph } from './routing.js';

const world = validateDataset({ schemaVersion: 1, maps: [
  { id: 'ell', name: 'Ellinia', npcs: [{ name: 'Shane', x: 10, y: 20 }] },
  { id: 'f1', name: 'The Forest of Patience <Step 1>' }, { id: 'f2', name: 'The Forest of Patience <Step 2>', npcs: [{ name: 'Louis', x: 1, y: 2 }] }, { id: 'f3', name: 'The Forest of Patience <Step 3>' }
], portals: [{ from: 'f1', to: 'f2', name: 'up' }], targets: [
  { id: 'f2m', kind: 'mob', name: 'Fairy 2', locations: [{ mapId: 'ell', count: 2 }] }, { id: 'f3m', kind: 'mob', name: 'Fairy 3', locations: [{ mapId: 'ell', count: 2 }] },
  { id: 'cy', kind: 'mob', name: 'Curse Eye', locations: [{ mapId: 'ell', count: 9 }] }
] });

test('Shane sends you into the Forest of Patience, and the route goes there', () => {
  const edges = jumpQuestEdges(world);
  assert.deepEqual(edges.map(e => `${e.from}>${e.to}:${e.npc}`), ['ell>f1:Shane', 'ell>f3:Shane', 'f2>ell:Louis']);
  assert.deepEqual(searchRoute(travelGraph(world, { taxis: false }), 'f2', 'ell').map(step => step.npc), ['Louis']);
  assert.deepEqual(searchRoute(travelGraph(world, { taxis: false }), 'ell', 'f2').map(step => step.to), ['f1', 'f2']);
});

test('the Pink Anthurium is picked from the pile of flowers on step 2', () => {
  assert.deepEqual(pileTarget(world, 'Pink Anthurium')?.locations, [{ mapId: 'f2', count: 1 }]);
  assert.equal(pileTarget(world, 'Pink Anthurium')?.pile, true);
  assert.equal(pileTarget(world, 'Steel Ore'), null);
});

test('"the fairies took them" means the numbered Fairy monsters', () => {
  // Only with a map where they spawn in the text; "the fairies" alone are usually Ellinia's NPCs.
  assert.deepEqual(textMonsters(world, 'Lyn asked me to recover 25 Torn Ledger Pages the fairies took. Look for fairies in Ellinia.').sort(), ['Fairy 2', 'Fairy 3']);
  assert.deepEqual(textMonsters(world, 'The fairies of the town asked me to help.'), []);
  assert.deepEqual(textMonsters(world, 'Arwen the Fairy wants a glass shoe.'), []);
  assert.deepEqual(textMonsters(world, 'Kill Curse Eyes in the dungeon.'), ['Curse Eye']);
});

test('a guessed monster is hunted on the maps the quest names', async () => {
  const { huntGoals, goalSpawns } = await import('./objective.js');
  const data = validateDataset({ schemaVersion: 1, maps: [{ id: 'temple', name: "The Entrance of Golem's Temple" }, { id: 'up6', name: 'Tree Dungeon, Forest Up North VI' }, { id: 'hub', name: 'Hub' }],
    portals: [{ from: 'hub', to: 'temple', name: 'a' }, { from: 'hub', to: 'up6', name: 'b' }],
    targets: [{ id: 'f3', kind: 'mob', name: 'Fairy 3', locations: [{ mapId: 'temple', count: 12 }, { mapId: 'up6', count: 2 }] }] });
  const text = 'Lyn asked me to recover 25 Torn Ledger Pages the fairies took. I can probably find fairies in Tree Dungeon, Forest Up North VI.';
  const goal = huntGoals(data, [{ name: 'Torn Ledger Pages', have: 0, need: 25 }], { 'Torn Ledger Pages': [] }, text, ['Torn Ledger Pages'])[0];
  assert.deepEqual(goal.monsters, ['Fairy 3']);
  assert.deepEqual(goal.maps, ['up6']);
  assert.deepEqual([...goalSpawns(data, goal).keys()], ['up6']);
});
