import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { mapViewModel, mapViewSvg } from './mapview.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'h', name: 'Henesys', bounds: { minX: 0, maxX: 6000, minY: 400, maxY: 1100 }, npcs: [{ name: 'Regular Cab', x: 800, y: 870 }, { name: 'Chief Stan', x: 5000, y: 700 }] },
  { id: 'm', name: 'Henesys Market' }, { id: 'p', name: 'Henesys Park' }, { id: 'k', name: 'Kerning City' }, { id: 'e', name: 'Ellinia' }
], portals: [
  { from: 'h', to: 'm', name: 'in00', kind: 'visible', x: 3700, y: 930 },
  { from: 'h', to: 'p', name: 'in01', kind: 'hidden', x: 4500, y: 720 },
  { from: 'h', to: 'k', name: 'Regular Cab', kind: 'taxi', npc: 'Regular Cab', fare: [600, 1200], x: 800, y: 870 },
  { from: 'h', to: 'e', name: 'Regular Cab', kind: 'taxi', npc: 'Regular Cab', fare: [500, 1000], x: 800, y: 870 }
] });

test('one marker per exit, one per ride driver, route target flagged', () => {
  const model = mapViewModel(data, 'h', { route: [data.portals[0]], position: { x: 3000, y: 930 } });
  assert.equal(model.markers.length, 3);
  const cab = model.markers.find(m => m.kind === 'taxi');
  assert.deepEqual(cab.targets.map(t => t.name), ['Kerning City', 'Ellinia']);
  assert.equal(model.target.targets[0].name, 'Henesys Market');
  assert.deepEqual(model.npcs.map(n => n.name), ['Chief Stan']); // the cab driver is drawn as the ride marker
  assert.ok(model.player.sx < model.target.sx);
  for (const marker of model.markers) assert.ok(marker.sx >= 0 && marker.sx <= model.width && marker.sy >= 0 && marker.sy <= model.height);
});

test('svg escapes names and marks the next exit', () => {
  const svg = mapViewSvg(mapViewModel(data, 'h', { route: [data.portals[0]] }), value => String(value).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`));
  assert.match(svg, /mv-next/);
  assert.match(svg, /Hidden portal to Henesys Park/);
  assert.doesNotMatch(svg, /mv-player/);
});

test('maps without coordinates say so', () => {
  assert.equal(mapViewModel(data, 'm').empty, true);
  assert.equal(mapViewModel(data, 'nope'), null);
});

import { existsSync, readFileSync } from 'node:fs';
import { calibratePicture } from './mapview.js';

test('picture calibration finds the offset that puts points on the ground (synthetic)', () => {
  // Ground at y=30 left of x=100, a raised step at y=20 from x=100; true offset (-10, -2.5) at 1/16.
  const width = 200, height = 40, alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (y >= (x < 100 ? 30 : 20)) alpha[y * width + x] = 255;
  // Points hugging both sides of the step pin the horizontal offset.
  const points = [{ x: 400, y: 520 }, { x: 1200, y: 520 }, { x: 1700, y: 520 }, { x: 1790, y: 360 }, { x: 2800, y: 360 }, { x: 3000, y: 360 }];
  const cal = calibratePicture(alpha, width, height, points);
  assert.ok(Math.abs(cal.ox - -10) <= 3 && Math.abs(cal.oy - -2.5) <= 3, JSON.stringify(cal));
});

for (const [name, ox, oy] of [['henesys', -9, -4], ['lith', -10, -5], ['road', -8, -4]]) {
  const base = new URL(`../fixtures/screens/picture-${name}`, import.meta.url);
  const present = existsSync(new URL(`${base.href}.json`)) && existsSync(new URL(`${base.href}.alpha`));
  test(`picture calibration on the real ${name} mini map`, { skip: !present && 'fixture not present' }, () => {
    const meta = JSON.parse(readFileSync(new URL(`${base.href}.json`), 'utf8'));
    const cal = calibratePicture(new Uint8Array(readFileSync(new URL(`${base.href}.alpha`))), meta.width, meta.height, meta.points);
    assert.ok(Math.abs(cal.ox - ox) <= 2 && Math.abs(cal.oy - oy) <= 2, JSON.stringify(cal));
    assert.ok(cal.confidence > .55, `confidence ${cal.confidence}`);
  });
}

import { placeLabels } from './mapview.js';
test('labels that would overprint move below, then drop out', () => {
  const placed = placeLabels([
    { x: 100, y: 100, r: 5, text: 'Henesys Market' },
    { x: 110, y: 100, r: 5, text: 'Henesys Park' },
    { x: 105, y: 101, r: 5, text: 'Yellow Mushroom House', priority: 1 }
  ], 10);
  assert.ok(placed[2] && placed[2].y < 100, 'priority label keeps the spot above');
  assert.ok(placed[0] && placed[0].y > 100, 'next label moves below');
  assert.equal(placed[1], null, 'third overlapping label is left out');
});

test('on the destination map the NPC you were sent to becomes the target', () => {
  const data = { maps: [{ id: 'e', name: 'Ellinia', npcs: [{ name: 'Betty', x: 900, y: 300 }] }], portals: [] };
  const model = mapViewModel(data, 'e', { position: { x: 100, y: 300 }, goal: { name: 'Betty', x: 900, y: 300 } });
  assert.equal(model.target.name, 'Betty'); assert.equal(model.goal.goal, true);
  assert.equal(mapViewModel(data, 'e', {}).target, null);
});

test('each monster on a map gets its own spawn colour, most spawns first', async () => {
  const { spawnColors } = await import('./mapview.js');
  const colors = spawnColors([{ name: 'Slime' }, { name: 'Shroom' }, { name: 'Shroom' }]);
  assert.deepEqual([...colors.keys()], ['Shroom', 'Slime']);
  assert.notEqual(colors.get('Shroom'), colors.get('Slime'));
});
