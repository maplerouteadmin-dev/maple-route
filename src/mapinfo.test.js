import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { mapInfo, mobInfo, npcInfo } from './mapinfo.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'east', name: 'East Domain of Perion', area: 'Victoria Island', capacity: 40, npcs: [] },
  { id: 'wisdom', name: 'The Forest of Wisdom', capacity: 31, npcs: [{ name: 'Raymond', x: 1, y: 1 }] }
], portals: [{ from: 'east', to: 'wisdom', name: 'a' }], targets: [
  { id: 'g', name: 'Green Mushroom', kind: 'mob', level: 15, hp: 250, exp: 26, locations: [{ mapId: 'east', count: 12 }, { mapId: 'wisdom', count: 30 }] },
  { id: 'o', name: 'Other', kind: 'mob', level: 9, locations: [{ mapId: 'east', count: 59 }, { mapId: 'wisdom', count: 28 }] }
] });

test('clicking the map: its monsters with counts and alive at once, NPCs, exits', () => {
  const info = mapInfo(data, 'east');
  assert.equal(info.title, 'East Domain of Perion');
  assert.deepEqual(info.monsters.map(m => [m.name, m.count, m.alive]), [['Other', 59, 33], ['Green Mushroom', 12, 7]]);
  assert.deepEqual(info.exits, ['The Forest of Wisdom']);
  assert.equal(mapInfo(data, 'nope'), null);
});

test('clicking a monster: stats, here, and the best other maps', () => {
  const info = mobInfo(data, 'Green Mushroom', 'east');
  assert.deepEqual([info.level, info.hp, info.exp, info.here], [15, 250, 26, { count: 12, alive: 7 }]);
  assert.deepEqual(info.best, [{ map: 'The Forest of Wisdom', alive: 16 }]);
});

test('clicking an NPC: quests given and taken, what they sell', () => {
  const info = npcInfo('Raymond', { quests: [{ name: 'A', giver: 'Raymond' }, { name: 'B', giver: 'Luke', turnIn: 'Raymond' }], shops: { salad: [{ npc: 'Raymond', price: 220 }], apple: [{ npc: 'Luna', price: 10 }] } });
  assert.deepEqual([info.gives, info.takes, info.sells], [['A'], ['B'], [{ item: 'salad', price: 220 }]]);
});
