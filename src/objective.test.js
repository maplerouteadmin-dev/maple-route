import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { huntGoals, rankObjectiveMaps, questObjective } from './objective.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'el', name: 'Ellinia' }, { id: 'df', name: 'Deep Forest' }, { id: 'hg', name: 'Hunting Ground in the Deep Forest I' }, { id: 'sw', name: 'Swampy Land' }
], portals: [
  { from: 'el', to: 'df', name: 'a' }, { from: 'df', to: 'el', name: 'b' }, { from: 'df', to: 'hg', name: 'c' }, { from: 'hg', to: 'df', name: 'd' }, { from: 'df', to: 'sw', name: 'e' }, { from: 'sw', to: 'df', name: 'f' }
], targets: [
  { id: 'm1', name: 'Dark Stump', kind: 'mob', level: 10, locations: [{ mapId: 'df', count: 8 }, { mapId: 'hg', count: 14 }] },
  { id: 'm2', name: 'Stump', kind: 'mob', level: 7, locations: [{ mapId: 'hg', count: 6 }, { mapId: 'sw', count: 10 }] },
  { id: 'n1', name: 'Francois', kind: 'npc', locations: [{ mapId: 'el' }] }
] });

const helper = { progress: [{ name: 'Leaf', have: 4, need: 20, done: false }, { name: 'Dark Stump', have: 0, need: 30, done: false }], complete: false };

test('unfinished counts become kill and collect goals', () => {
  const goals = huntGoals(data, helper.progress, { Leaf: ['Stump', 'Dark Stump', 'Unknown Mob'] });
  assert.deepEqual(goals.map(g => [g.name, g.kind, g.monsters]), [['Leaf', 'collect', ['Stump', 'Dark Stump']], ['Dark Stump', 'kill', ['Dark Stump']]]);
  assert.equal(huntGoals(data, helper.progress, {})[0].pending, true);
});

test('the map covering every remaining goal ranks first', () => {
  const goals = huntGoals(data, helper.progress, { Leaf: ['Stump'] });
  const ranked = rankObjectiveMaps(data, goals, 'el');
  assert.equal(ranked[0].mapId, 'hg'); // Dark Stump and Stump both spawn there
  assert.deepEqual(ranked[0].goals.sort(), ['Dark Stump', 'Leaf']);
});

test('hunting keeps you on a useful map; completion sends you to hand in', () => {
  const sources = { Leaf: ['Stump'] };
  const away = questObjective(data, { quest: 'Francois in Need of an Apprentice', helperQuest: helper, catalogQuest: { turnIn: 'Francois' }, itemSources: sources, currentMapId: 'el' });
  assert.equal(away.stage, 'hunt'); assert.equal(away.mapId, 'hg'); assert.equal(away.here, false);
  const onDeepForest = questObjective(data, { quest: 'x', helperQuest: helper, catalogQuest: { turnIn: 'Francois' }, itemSources: sources, currentMapId: 'df' });
  assert.equal(onDeepForest.here, true); assert.equal(onDeepForest.mapId, 'df'); // Dark Stumps spawn here: hunt, do not leave
  const done = questObjective(data, { quest: 'x', helperQuest: { progress: [{ name: 'Leaf', have: 20, need: 20, done: true }], complete: true }, catalogQuest: { turnIn: 'Francois' }, currentMapId: 'hg' });
  assert.deepEqual([done.stage, done.npc, done.mapId, done.here], ['turn-in', 'Francois', 'el', false]);
});

test('without the Quest Helper, the game data says what to hunt, and talk quests go to the hand-in NPC', async () => {
  const { questObjective } = await import('./objective.js');
  const data = { maps: [{ id: 'f' }, { id: 'e' }], portals: [{ from: 'e', to: 'f', name: 'east00', cost: 1 }], targets: [
    { kind: 'mob', name: 'Green Mushroom', locations: [{ mapId: 'f', count: 20 }] },
    { kind: 'npc', name: 'Shane', locations: [{ mapId: 'e' }] }
  ] };
  const hunt = questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', turnIn: 'Shane', needs: [{ type: 'mob', name: 'Green Mushroom', count: 30 }] }, currentMapId: 'e' });
  assert.equal(hunt.stage, 'hunt'); assert.equal(hunt.mapId, 'f'); assert.equal(hunt.countsUnknown, true);
  const talk = questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', needs: [] } });
  assert.equal(talk.stage, 'turn-in'); assert.equal(talk.mapId, 'e');
  assert.equal(questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', needs: [{ type: 'mob', name: 'Green Mushroom', count: 30 }] }, handIn: true }).stage, 'turn-in');
});
