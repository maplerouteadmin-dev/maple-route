import test from 'node:test';
import assert from 'node:assert/strict';
import { questStepMaps, questUrl, fromOsmsQuests } from './quests.js';

const data = {
  maps: [{ id: '1', name: 'Sleepywood' }, { id: '2', name: 'The Tree That Grew III' }, { id: '3', name: 'The Field South of Ellinia' }],
  portals: [{ from: '1', to: '2', name: 'east', cost: 1 }, { from: '2', to: '3', name: 'east', cost: 1 }],
  targets: [
    { id: 'npc:1', name: 'Chrishrama', kind: 'npc', locations: [{ mapId: '1' }] },
    { id: 'mob:1', name: 'Dark Stump', kind: 'mob', locations: [{ mapId: '2', count: 13 }, { mapId: '3', count: 13 }] }
  ]
};

test('quest guide routes NPC steps to their map', () => {
  assert.deepEqual(questStepMaps(data, { npc: 'Chrishrama', map: 'Sleepywood' }, '1').map(x => x.map.name), ['Sleepywood']);
});

test('quest guide offers multiple mob maps with distance breaking spawn ties', () => {
  assert.deepEqual(questStepMaps(data, { monster: 'Dark Stump' }, '1').map(x => x.map.name), ['The Tree That Grew III', 'The Field South of Ellinia']);
});

test('quest guide does not invent a route for an unmapped collection step', () => {
  assert.deepEqual(questStepMaps(data, { title: 'Collect 1 Garnet Ore' }, '1'), []);
  assert.equal(questUrl("Mai's Training"), 'https://mapleclassic.wiki/wiki/Mai%27s_Training');
});


test('game-file quest list keeps quest lines, order, earlier quests and what to hunt', () => {
  const payload = {
    quests: [
      { id: '10211', name: 'How to Enjoy Mushrooms', npc_name: 'Shane', region: 'Ellinia', parent: "Father's Mushroom Stew", level_min: 14, requirements: 'Defeat Green Mushroom x 30, Green Mushroom Cap x 15', requirements_list: [{ type: 'mob', name: 'Green Mushroom', count: 30 }, { type: 'item', name: 'Green Mushroom Cap', count: 15 }] },
      { id: '10212', name: 'How to Enjoy Mushrooms Even More', npc_name: 'Shane', region: 'Ellinia', parent: "Father's Mushroom Stew", level_min: 14, requirements: 'Complete: How to Enjoy Mushrooms (#010211), Lemon x 1' },
      { id: '1500', name: 'Warrior Test', npc_name: 'Dances with Balrog', region: 'Warrior', level_min: 10, is_repeatable: false }
    ],
    chains: [{ parent: "Father's Mushroom Stew", quest_ids: ['10211', '10212'] }]
  };
  const quests = fromOsmsQuests(payload, [{ name: 'How to Enjoy Mushrooms', turnIn: 'Shane' }]);
  const [first, second, job] = quests;
  assert.equal(first.arc, "Father's Mushroom Stew"); assert.equal(first.arcOrder, 0); assert.deepEqual(first.prerequisites, []);
  assert.equal(first.turnIn, 'Shane'); assert.equal(first.needs.length, 2);
  assert.deepEqual(second.prerequisites, ['How to Enjoy Mushrooms']); assert.equal(second.arcOrder, 1);
  assert.equal(job.job, 'Warrior');
});

test('wiki required items join the correct job-specific quest even when its title differs', () => {
  const payload = { quests: [
    { id: '1', name: 'Test of Qualification', region: 'Warrior', requirements_list: [] },
    { id: '2', name: 'Test of Qualification', region: 'Thief', requirements_list: [] }
  ] };
  const quests = fromOsmsQuests(payload, [], [{ quest: 'Test of Qualification (Thief)', item: 'Dark Marble', quantity: 30 }]);
  assert.deepEqual(quests[0].needs, []);
  assert.deepEqual(quests[1].needs.map(need => [need.name, need.count]), [['Dark Marble', 30]]);
});
