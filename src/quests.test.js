import test from 'node:test';
import assert from 'node:assert/strict';
import { questStepMaps, questUrl, fromOsmsQuests, bestNpcMap } from './quests.js';

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

test('an unreachable duplicate NPC cannot take the first quest route', () => {
  const world = {
    maps: [{ id: 'town', name: 'Kerning City' }, { id: 'start', name: 'Henesys' }, { id: 'pq', name: 'Party Quest Stage' }],
    portals: [{ from: 'start', to: 'town', name: 'west' }],
    targets: [
      { kind: 'npc', name: 'Nella', locations: [{ mapId: 'pq', count: 50 }] },
      { kind: 'npc', name: 'Nella', locations: [{ mapId: 'town', count: 1 }] }
    ]
  };
  assert.equal(questStepMaps(world, { npc: 'Nella' }, 'start', 1)[0].map.id, 'town');
});

test('quest guide offers multiple mob maps with distance breaking spawn ties', () => {
  assert.deepEqual(questStepMaps(data, { monster: 'Dark Stump' }, '1').map(x => x.map.name), ['The Tree That Grew III', 'The Field South of Ellinia']);
});

test('a repeated NPC uses a reachable location instead of the first isolated location', () => {
  const world = { ...data, maps: [...data.maps, { id: 'event', name: 'Event Room' }], targets: [
    { kind: 'npc', name: 'Maple Administrator', locations: [{ mapId: 'event' }, { mapId: '2' }, { mapId: '3' }] }
  ] };
  assert.equal(bestNpcMap(world, 'Maple Administrator', '1'), '2');
  assert.equal(questStepMaps(world, { npc: 'Maple Administrator' }, '1', 1)[0].map.id, '2');
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

test('game start items are handovers, not farming objectives across the quest catalog', () => {
  const payload = { quests: [
    { id: '10110', name: "Getting Arcon's Blood", npc_name: 'Manji', requirements_list: [
      { type: 'item', name: "Arcon's Blood", count: 1 }, { type: 'item', name: 'Squishy Liquid', count: 30 }
    ], start_items: [{ type: 'item', name: "Arcon's Blood", count: 1 }] },
    { id: '10126', name: 'The Old Snail', npc_name: 'Jay', requirements_list: [{ type: 'item', name: 'The Snail Legend', count: 1 }], start_items: [{ type: 'item', name: 'The Snail Legend', count: 1 }] },
    { id: '1002', name: "Roger's Apple", npc_name: 'Roger', requirements_list: [{ type: 'item', name: "Roger's Apple", count: 1 }] }
  ] };
  const quests = fromOsmsQuests(payload, [], [{ quest: "Getting Arcon's Blood", item: "Arcon's Blood (quest item)", quantity: 1 }]);
  assert.deepEqual(quests[0].needs.map(item => item.name), ['Squishy Liquid']);
  assert.deepEqual(quests[0].startItems, [{ name: "Arcon's Blood", count: 1 }]);
  assert.deepEqual(quests[1].needs, []);
  // Roger's tutorial apple is the one documented handover missing from start_items.
  assert.deepEqual(quests[2].needs, []);
  assert.deepEqual(quests[2].startItems, [{ name: "Roger's Apple", count: 1 }]);
});

test('the two verified quest hand-ins survive missing community guide rows', () => {
  const quests = fromOsmsQuests({ quests: [
    { id: 10126, name: 'The Old Snail', npc_name: 'Pia', requirements_list: [{ type: 'item', name: 'The Snail Legend', count: 1 }] },
    { id: 506105, name: 'First Greeting with Nella, the Town Resident', npc_name: 'Community Board', requirements_list: [] }
  ] });
  assert.deepEqual(quests.map(quest => quest.turnIn), ['Jay', 'Nella']);
});

test('the quest catalog preserves items given at acceptance', () => {
  const quests = fromOsmsQuests({ quests: [{ id: 10409, name: 'Transporting Drake\'s Skull', npc_name: 'Anne', requirements_list: [{ type: 'item', id: 4030001, name: 'Stuffed Drake Skull', count: 1 }], start_items: [{ type: 'item', id: 4030001, name: 'Stuffed Drake Skull', count: 1 }] }] });
  assert.deepEqual(quests[0].startItems, [{ id: 4030001, name: 'Stuffed Drake Skull', count: 1 }]);
});
