import test from 'node:test';
import assert from 'node:assert/strict';
import { huntRisk } from './huntsafety.js';
import { rankObjectiveMaps, planHuntTrip, planMultiTrip, questObjective } from './objective.js';
import { validateDataset } from './core.js';

const world = validateDataset({ schemaVersion: 1,
  maps: ['start', 'boars', 'stumps'].map(id => ({ id, name: id })),
  portals: [
    { from: 'start', to: 'boars', name: 'b' }, { from: 'boars', to: 'start', name: 'back' },
    { from: 'start', to: 'stumps', name: 's' }, { from: 'stumps', to: 'start', name: 'back' }
  ],
  targets: [
    { id: 'dark-stump', kind: 'mob', name: 'Dark Stump', level: 10, locations: [{ mapId: 'boars', count: 14 }, { mapId: 'stumps', count: 10 }] },
    { id: 'wild-boar', kind: 'mob', name: 'Wild Boar', level: 35, locations: [{ mapId: 'boars', count: 12 }] }
  ]
});
const goals = [{ name: 'Dark Stump', kind: 'kill', need: 25, have: 0, monsters: ['Dark Stump'], quests: ['Hunt'] }];

test('unknown player level does not invent hunt risk; target mobs do not count as unrelated danger', () => {
  assert.equal(huntRisk(world, 'boars', null, ['Dark Stump']).penalty, 0);
  assert.equal(huntRisk(world, 'boars', 20, ['Wild Boar']).penalty, 0);
  assert.deepEqual(huntRisk(world, 'stumps', 20, ['Dark Stump']).dangerous, []);
});

test('a lower-level player is sent to Dark Stumps away from Wild Boars', () => {
  assert.equal(rankObjectiveMaps(world, goals, 'start', { playerLevel: 20 })[0].mapId, 'stumps');
  assert.equal(planHuntTrip(world, goals, 'start', null, { playerLevel: 20 }).stops[0].mapId, 'stumps');
  assert.equal(planMultiTrip(world, goals, 'start', [], { playerLevel: 20 }).stops[0].mapId, 'stumps');
  const objective = questObjective(world, { quest: 'Hunt', catalogQuest: { needs: [{ name: 'Dark Stump', count: 25 }] }, currentMapId: 'boars', playerLevel: 20 });
  assert.equal(objective.mapId, 'stumps');
  assert.equal(objective.here, false);
});

test('higher-level players can take the denser map and a lone dangerous map remains reachable', () => {
  assert.equal(rankObjectiveMaps(world, goals, 'start', { playerLevel: 40 })[0].mapId, 'boars');
  const alone = { ...world, targets: world.targets.map(target => target.name === 'Dark Stump' ? { ...target, locations: target.locations.filter(l => l.mapId === 'boars') } : target) };
  assert.equal(planHuntTrip(alone, goals, 'start', null, { playerLevel: 20 }).stops[0].mapId, 'boars');
});
