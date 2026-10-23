import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { worldMapModel, worldMapHtml, mobTally } from './worldmap.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'h', name: 'Henesys', area: 'Victoria Island', bounds: { minX: 0, maxX: 3000, minY: 0, maxY: 1000 } },
  { id: 'g', name: 'Henesys Hunting Ground I', area: 'Victoria Island' }, { id: 'k', name: 'Kerning City', area: 'Victoria Island' }, { id: 'p', name: 'Pig Park', area: 'Victoria Island' }
], portals: [
  { from: 'h', to: 'g', name: 'west00', kind: 'visible', x: 50, y: 900 }, { from: 'g', to: 'h', name: 'east00', kind: 'visible' },
  { from: 'h', to: 'k', name: 'Regular Cab', kind: 'taxi', npc: 'Regular Cab', fare: [600, 1200], x: 800, y: 900 },
  { from: 'p', to: 'h', name: 'out00', kind: 'visible' }
], targets: [
  { id: 'm', name: 'Orange Mushroom', kind: 'mob', level: 8, locations: [{ mapId: 'g', count: 10 }] },
  { id: 'n', name: 'Mai', kind: 'npc', locations: [{ mapId: 'g' }] }
] });

test('world map lists neighbours with how to get there and what is there', () => {
  const model = worldMapModel(data, 'h', { currentId: 'h', destinationId: 'k' });
  const byName = Object.fromEntries(model.rows.map(r => [r.name, r]));
  assert.match(byName['Henesys Hunting Ground I'].how, /left portal/);
  assert.equal(byName['Henesys Hunting Ground I'].mobs, '10 Lv 8 monsters');
  assert.equal(byName['Henesys Hunting Ground I'].npcs, 1);
  assert.equal(byName['Kerning City'].how, 'ride (Regular Cab)');
  assert.equal(byName['Kerning City'].destination, true);
  assert.equal(byName['Pig Park'].outgoing, false);
  assert.equal(model.center.current, true);
});

test('search finds maps, NPCs and monsters and points at a map', () => {
  const model = worldMapModel(data, 'h', { query: 'mush' });
  assert.deepEqual(model.results.map(r => [r.kind, r.name, r.mapId]), [['mob', 'Orange Mushroom', 'g']]);
  const html = worldMapHtml(model, String);
  assert.match(html, /data-wm-go="g"/);
});

test('monster tally counts spawns per map', () => {
  assert.deepEqual(mobTally(data, 'g'), { total: 10, kinds: [{ name: 'Orange Mushroom', level: 8, thumb: null, count: 10 }], levels: [8, 8] });
  assert.equal(mobTally(data, 'h').total, 0);
});
