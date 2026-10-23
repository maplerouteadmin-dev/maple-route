import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { arrivalDetails, fitLabel } from './arrival.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'hg', name: 'Henesys Hunting Ground I', bounds: { minX: 0, maxX: 3000, minY: 0, maxY: 1000 }, npcs: [{ name: 'Mai', x: 200, y: 900 }, { name: 'Mai', x: 210, y: 900 }] },
  { id: 'h', name: 'Henesys' }, { id: 'k', name: 'Kerning City' }
], portals: [
  { from: 'hg', to: 'h', name: 'east00', kind: 'visible', x: 2950, y: 900 },
  { from: 'hg', to: 'k', name: 'Regular Cab', kind: 'taxi', npc: 'Regular Cab', fare: [600, 1200], x: 100, y: 900 }
], targets: [
  { id: 'm1', name: 'Snail', kind: 'mob', level: 1, exp: 3, hp: 8, locations: [{ mapId: 'hg', count: 20 }] },
  { id: 'm2', name: 'Orange Mushroom', kind: 'mob', level: 8, exp: 15, hp: 80, locations: [{ mapId: 'hg', count: 12 }] }
] });

test('arrival details describe the map you are standing on', () => {
  const d = arrivalDetails(data, 'hg', {
    playerLevel: 12, position: { x: 2800, y: 950 },
    sessions: [{ mapId: 'hg', expPerHour: 900 }, { mapId: 'hg', expPerHour: 1500 }, { mapId: 'h', expPerHour: 9999 }],
    quests: [{ name: "Mai's First Training", giver: 'Mai', turnIn: 'Mai', level: 1 }],
    questTasks: [{ quest: { name: 'Snail Hunt' }, step: { title: 'Defeat 10 Snails' }, maps: [{ map: { id: 'hg' } }] }]
  });
  assert.equal(d.where, 'on the right side, ground level');
  assert.deepEqual(d.mobs.map(m => [m.name, m.fit]), [['Snail', 'very easy'], ['Orange Mushroom', 'good EXP']]);
  assert.equal(d.npcs.length, 1); assert.equal(d.npcs[0].side, 'left'); assert.equal(d.npcs[0].quests.length, 2);
  assert.deepEqual(d.exits.map(e => e.name), ['Henesys']); assert.equal(d.rides[0].name, 'Kerning City');
  assert.deepEqual(d.training, { from: 1, to: 16, spawns: 32 });
  assert.equal(d.bestRun.expPerHour, 1500); assert.equal(d.runs, 2);
  assert.deepEqual(d.questSteps, [{ quest: 'Snail Hunt', step: 'Defeat 10 Snails' }]);
  assert.equal(fitLabel(25, 12), 'dangerous'); assert.equal(fitLabel(15, 12), 'good EXP'); assert.equal(fitLabel(17, 12), 'tough');
});
