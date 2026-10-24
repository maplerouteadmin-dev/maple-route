import test from 'node:test';
import assert from 'node:assert/strict';
import { fromOsmsCrafting, craftRecipe, craftNeeds } from './refine.js';
import { validateDataset } from './core.js';
import { huntGoals, planHuntTrip, craftStops } from './objective.js';

// Shaped like OSMS crafting.json (Classic game files).
const crafting = fromOsmsCrafting({ disciplines: [
  { discipline: 'Arcforge', output_types: [{ output_type: 'Materials', levels: [{ level: 1, recipes: [{ result_item_name: 'Garnet', result_count: 1, req_level: 1, meso_cost: 200, ingredients: [{ item_name: 'Garnet Ore', count: 1 }] }] }] }] },
  { discipline: 'Smithing', output_types: [{ output_type: 'Materials', levels: [{ level: 1, recipes: [{ result_item_name: 'Silver Ingot', result_count: 1, req_level: 1, meso_cost: 400, ingredients: [{ item_name: 'Silver Ore', count: 5 }] }] }] }] },
  { discipline: 'Woodcrafting', output_types: [{ output_type: 'Materials', levels: [{ level: 1, recipes: [
    { result_item_name: 'Processed Wood', result_count: 1, req_level: 2, meso_cost: 200, ingredients: [{ item_name: 'Firewood', count: 5 }] },
    { result_item_name: 'Processed Wood', result_count: 1, req_level: 1, meso_cost: 100, ingredients: [{ item_name: 'Tree Branch', count: 10 }] }
  ] }] }] }
] });

test('recipes come from the game files: where to make it, what it takes', () => {
  const garnet = craftRecipe(crafting, 'Garnet');
  assert.deepEqual([garnet.discipline, garnet.npc, garnet.town, garnet.meso, garnet.ingredients], ['Arcforge', 'Chrishrama', 'Sleepywood', 200, [{ name: 'Garnet Ore', count: 1 }]]);
  assert.deepEqual(craftNeeds(craftRecipe(crafting, 'Silver Ingot'), 15), { batches: 15, meso: 6000, ingredients: [{ name: 'Silver Ore', count: 75 }] });
  assert.equal(craftRecipe(crafting, 'Processed Wood').ingredients[0].name, 'Tree Branch'); // the easiest recipe
  assert.equal(craftRecipe(crafting, 'Omok Table'), null);
});

test('a crafted need hunts its ingredients and the trip passes the crafter before the hand-in', () => {
  const data = validateDataset({ schemaVersion: 1, maps: ['field', 'sleepy', 'ellinia'].map(id => ({ id, name: id })), portals: [
    { from: 'ellinia', to: 'field', name: 'a' }, { from: 'field', to: 'ellinia', name: 'b' }, { from: 'field', to: 'sleepy', name: 'c' }, { from: 'sleepy', to: 'field', name: 'd' }
  ], targets: [
    { id: 'm', name: 'Zombie Mushroom', kind: 'mob', locations: [{ mapId: 'field', count: 12 }] },
    { id: 'c', name: 'Chrishrama', kind: 'npc', locations: [{ mapId: 'sleepy' }] },
    { id: 'e', name: 'Estelle', kind: 'npc', locations: [{ mapId: 'ellinia' }] }
  ] });
  const [goal] = huntGoals(data, [{ name: 'Garnet', have: 0, need: 1 }], { 'Garnet Ore': ['Zombie Mushroom'] }, '', [], crafting);
  assert.deepEqual([goal.name, goal.need, goal.monsters, goal.craft.npc, goal.craft.meso], ['Garnet Ore', 1, ['Zombie Mushroom'], 'Chrishrama', 200]);
  assert.equal(huntGoals(data, [{ name: 'Garnet', have: 0, need: 1 }], {}, '', [], crafting)[0].pending, true); // ore droppers still loading
  // A monster that drops the finished item itself: hunt it, no crafting.
  assert.equal(huntGoals(data, [{ name: 'Garnet', have: 0, need: 1 }], { Garnet: ['Zombie Mushroom'] }, '', [], crafting)[0].craft, undefined);
  const via = craftStops(data, [goal]);
  assert.deepEqual(via, ['sleepy']);
  const trip = planHuntTrip(data, [goal], 'ellinia', 'ellinia', { via });
  assert.deepEqual([trip.stops.map(s => s.mapId), trip.via, trip.hops], [['field'], ['sleepy'], 4]); // ellinia→field→sleepy→field→ellinia
});

test('an ingredient that is itself made is expanded, and named after its monster', () => {
  const nested = fromOsmsCrafting({ disciplines: [{ discipline: 'Weaponcrafting', output_types: [{ output_type: 'Materials', levels: [{ level: 1, recipes: [
    { result_item_name: 'Monkey Wrench', result_count: 1, req_level: 1, meso_cost: 0, ingredients: [{ item_name: 'Screw', count: 6 }] },
    { result_item_name: 'Screw', result_count: 3, req_level: 1, meso_cost: 0, ingredients: [{ item_name: "Iron Hog's Metal Hoof", count: 10 }] }
  ] }] }] }] });
  const data = validateDataset({ schemaVersion: 1, maps: [{ id: 'a', name: 'A' }], portals: [], targets: [{ id: 'h', name: 'Iron Hog', kind: 'mob', locations: [{ mapId: 'a', count: 9 }] }] });
  const goals = huntGoals(data, [{ name: 'Monkey Wrench', have: 0, need: 1 }], { Screw: [], "Iron Hog's Metal Hoof": [] }, 'Talk to Mr. Thunder.', [], nested);
  assert.deepEqual(goals.map(g => [g.name, g.need, g.monsters, g.craft.item]), [["Iron Hog's Metal Hoof", 20, ['Iron Hog'], 'Screw']]); // 6 screws = 2 batches of 3
});
