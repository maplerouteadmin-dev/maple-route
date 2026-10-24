import test from 'node:test';
import assert from 'node:assert/strict';
import { refineRecipe } from './refine.js';
import { validateDataset } from './core.js';
import { huntGoals, planHuntTrip, refineStops } from './objective.js';

test('jewels are refined in Sleepywood, ingots in Perion, from 10 ores each', () => {
  assert.deepEqual([refineRecipe('Garnet').ore, refineRecipe('Garnet').npc], ['Garnet Ore', 'Chrishrama']);
  assert.deepEqual([refineRecipe('Orihalcon Ingot').ore, refineRecipe('Orihalcon Ingot').npc], ['Orihalcon Ore', 'Silas Irons']);
  assert.equal(refineRecipe('Omok Table'), null);
  assert.equal(refineRecipe('Garnet Ore'), null); // the ore itself is hunted, not refined
});

test('a refined need hunts its ore and the trip passes the refiner before the hand-in', () => {
  const data = validateDataset({ schemaVersion: 1, maps: ['field', 'sleepy', 'ellinia'].map(id => ({ id, name: id })), portals: [
    { from: 'ellinia', to: 'field', name: 'a' }, { from: 'field', to: 'ellinia', name: 'b' }, { from: 'field', to: 'sleepy', name: 'c' }, { from: 'sleepy', to: 'field', name: 'd' }
  ], targets: [
    { id: 'm', name: 'Zombie Mushroom', kind: 'mob', locations: [{ mapId: 'field', count: 12 }] },
    { id: 'c', name: 'Chrishrama', kind: 'npc', locations: [{ mapId: 'sleepy' }] },
    { id: 'e', name: 'Estelle', kind: 'npc', locations: [{ mapId: 'ellinia' }] }
  ] });
  const [goal] = huntGoals(data, [{ name: 'Garnet', have: 0, need: 1 }], { 'Garnet Ore': ['Zombie Mushroom'] });
  assert.deepEqual([goal.lookup, goal.ores, goal.monsters, goal.refine.npc], ['Garnet Ore', 10, ['Zombie Mushroom'], 'Chrishrama']);
  assert.equal(huntGoals(data, [{ name: 'Garnet', have: 0, need: 1 }], {})[0].pending, true); // ore droppers still loading
  const via = refineStops(data, [goal]);
  assert.deepEqual(via, ['sleepy']);
  const trip = planHuntTrip(data, [goal], 'ellinia', 'ellinia', { via });
  assert.deepEqual([trip.stops.map(s => s.mapId), trip.via, trip.hops], [['field'], ['sleepy'], 4]); // ellinia→field→sleepy→field→ellinia
});
